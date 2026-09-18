import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import QRCode from "qrcode";
import {
  getSettings,
  initDb,
  listRequests,
  listSets,
  listSongs,
  updateSettings,
} from "./db.js";
import { clientDistRoot } from "./paths.js";
import { bridge } from "./services/bridge.js";
import { coverContentType, resolveCoverPath } from "./services/cover.js";
import { scanSongFolders, searchSongs } from "./services/library.js";
import {
  cancelRequest,
  formSets,
  getActiveQueueSnapshot,
  joinQueue,
  skipOnDeck,
} from "./services/queue.js";
import { probeYargPlacement, type YargPlacement } from "./services/placement.js";
import {
  buildYaqBridgeUrl,
  getLaunchedYargPid,
  launchYargProcess,
} from "./services/yargLauncher.js";
import type {
  Difficulty,
  Instrument,
  PublicState,
} from "./types.js";
import { DIFFICULTIES, INSTRUMENTS } from "./types.js";

const MIN_ADMIN_PASSWORD_LENGTH = 4;

function lanAddresses(port: number): string[] {
  const nets = os.networkInterfaces();
  const urls: string[] = [];
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      urls.push(`http://${entry.address}:${port}`);
    }
  }
  if (urls.length === 0) urls.push(`http://127.0.0.1:${port}`);
  return urls;
}

function buildPublicState(): PublicState {
  formSets();
  const settings = getSettings();
  const snap = getActiveQueueSnapshot();
  const { adminPassword: _, ...publicSettings } = settings;
  return {
    songs: listSongs(),
    requests: listRequests(),
    sets: listSets(),
    settings: {
      ...publicSettings,
      hasAdminPassword: Boolean(settings.adminPassword),
    },
    yargState: bridge.yargState,
    yargConnected: bridge.yargConnected,
    eventModeEnabled: bridge.eventModeEnabled,
    hasYargClient: bridge.hasYargClient,
    nowPlaying: snap.nowPlaying,
    onDeck: snap.onDeck,
    queuePreview: snap.queuePreview,
    lanUrls: lanAddresses(settings.hostPort),
  };
}

function requireAdmin(
  header: string | string[] | undefined,
): boolean {
  const settings = getSettings();
  if (!settings.adminPassword) return false;
  const token = Array.isArray(header) ? header[0] : header;
  return Boolean(token && token === settings.adminPassword);
}

function validateAdminPassword(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new Error("Admin password is required");
  }
  const password = raw.trim();
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new Error(
      `Admin password must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters`,
    );
  }
  return password;
}

function parsePlacement(raw: unknown): YargPlacement {
  if (raw === "same-machine" || raw === "second-machine") return raw;
  throw new Error("Choose whether YAQ is on the same machine as YARG");
}

function setupPayload() {
  const settings = getSettings();
  const port = settings.hostPort;
  const urls = lanAddresses(port);
  const probe = probeYargPlacement(settings.yargExecutable);
  const lanHost = urls[0]?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? `127.0.0.1:${port}`;
  return {
    needsSetup: !settings.adminPassword,
    hasAdminPassword: Boolean(settings.adminPassword),
    placement: probe,
    savedPlacement: settings.yargPlacement || probe.detected,
    yargExecutable: settings.yargExecutable || probe.yargPath || "",
    lanUrls: urls,
    sameMachineBridgeUrl: buildYaqBridgeUrl(port),
    secondMachineBridgeUrl: `ws://${lanHost}/ws?role=yarg`,
  };
}

async function main(): Promise<void> {
  initDb();
  const settings = getSettings();
  if (settings.simulatorEnabled) bridge.startSimulator();

  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  await app.register(websocket);

  const clientDist = clientDistRoot();
  if (fs.existsSync(clientDist)) {
    await app.register(fastifyStatic, {
      root: clientDist,
      prefix: "/",
      wildcard: false,
    });
  }

  app.get("/api/health", async () => ({ ok: true, name: "yaq" }));

  app.get("/api/state", async () => buildPublicState());

  app.get("/api/setup", async () => setupPayload());

  app.post<{
    Body: {
      adminPassword?: string;
      yargPlacement?: YargPlacement;
      yargExecutable?: string;
    };
  }>("/api/setup", async (req, reply) => {
    if (getSettings().adminPassword) {
      return reply.code(409).send({ error: "Setup is already complete" });
    }
    try {
      const adminPassword = validateAdminPassword(req.body?.adminPassword);
      const yargPlacement = parsePlacement(req.body?.yargPlacement);
      const probe = probeYargPlacement(getSettings().yargExecutable);
      const requestedPath = req.body?.yargExecutable?.trim() ?? "";
      const yargExecutable =
        yargPlacement === "same-machine"
          ? requestedPath || probe.yargPath || ""
          : requestedPath;
      updateSettings({
        adminPassword,
        yargPlacement,
        yargExecutable,
      });
      return { ok: true, state: buildPublicState(), setup: setupPayload() };
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : "Setup failed",
      });
    }
  });

  app.get("/api/meta", async () => ({
    instruments: INSTRUMENTS,
    difficulties: DIFFICULTIES,
  }));

  app.get<{ Querystring: { q?: string } }>("/api/songs", async (req) => {
    return searchSongs(req.query.q ?? "");
  });

  app.get<{ Params: { hash: string } }>(
    "/api/songs/:hash/cover",
    async (req, reply) => {
      const filePath = resolveCoverPath(req.params.hash);
      if (!filePath) {
        return reply.code(404).send({ error: "Cover not found" });
      }
      reply.header("Cache-Control", "public, max-age=300");
      reply.type(coverContentType(filePath));
      return reply.send(fs.createReadStream(filePath));
    },
  );

  app.post("/api/library/scan", async (req, reply) => {
    if (!requireAdmin(req.headers["x-admin-password"])) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const songs = scanSongFolders();
    bridge.pushQueuePreview();
    return { count: songs.length, songs };
  });

  app.post<{
    Body: {
      name: string;
      songHash: string;
      instrument: Instrument;
      difficulty: Difficulty;
    };
  }>("/api/queue/join", async (req, reply) => {
    try {
      const request = joinQueue(req.body);
      bridge.pushQueuePreview();
      return { request, state: buildPublicState() };
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : "Join failed",
      });
    }
  });

  app.post<{ Params: { id: string } }>(
    "/api/queue/:id/cancel",
    async (req, reply) => {
      cancelRequest(req.params.id);
      bridge.pushQueuePreview();
      return buildPublicState();
    },
  );

  app.post("/api/admin/launch", async (req, reply) => {
    if (!requireAdmin(req.headers["x-admin-password"])) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    try {
      const set = bridge.launchNext();
      return { set, state: buildPublicState() };
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : "Launch failed",
      });
    }
  });

  app.post("/api/admin/skip-on-deck", async (req, reply) => {
    if (!requireAdmin(req.headers["x-admin-password"])) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    skipOnDeck();
    bridge.pushQueuePreview();
    return buildPublicState();
  });

  app.post("/api/admin/complete", async (req, reply) => {
    if (!requireAdmin(req.headers["x-admin-password"])) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    bridge.handleInbound({ type: "song.ended" });
    bridge.markIdleAfterScore();
    return buildPublicState();
  });

  app.post("/api/admin/yarg/launch", async (req, reply) => {
    if (!requireAdmin(req.headers["x-admin-password"])) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    try {
      // Prefer a live game connection over the simulator.
      bridge.stopSimulator();
      const launched = launchYargProcess();
      return {
        ...launched,
        bridgeUrl: buildYaqBridgeUrl(),
        state: buildPublicState(),
      };
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : "Failed to launch YARG",
      });
    }
  });

  app.get("/api/admin/yarg/status", async (req, reply) => {
    if (!requireAdmin(req.headers["x-admin-password"])) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    return {
      bridgeUrl: buildYaqBridgeUrl(),
      yargExecutable: getSettings().yargExecutable,
      launchedPid: getLaunchedYargPid(),
      yargConnected: bridge.yargConnected,
      yargState: bridge.yargState,
      eventModeEnabled: bridge.eventModeEnabled,
      simulatorRunning: bridge.isSimulatorRunning(),
    };
  });

  app.post<{
    Body: { enabled?: boolean };
  }>("/api/admin/yarg/event-mode", async (req, reply) => {
    if (!requireAdmin(req.headers["x-admin-password"])) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const enabled = req.body?.enabled !== false;
    try {
      bridge.setEventMode(enabled);
      return {
        ok: true,
        enabled,
        state: buildPublicState(),
      };
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : "Failed to set event mode",
      });
    }
  });

  app.get("/api/admin/settings", async (req, reply) => {
    if (!requireAdmin(req.headers["x-admin-password"])) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    return getSettings();
  });

  app.put<{
    Body: Partial<{
      songFolders: string[];
      instrumentCaps: Record<string, number>;
      yaqPublicUrl: string;
      yargExecutable: string;
      yargPlacement: YargPlacement | "";
      simulatorEnabled: boolean;
      adminPassword: string;
      eventFlags: Partial<{
        hotMic: boolean;
        showUpNextHud: boolean;
        skipMainMenu: boolean;
        openDifficultySelect: boolean;
      }>;
    }>;
  }>("/api/admin/settings", async (req, reply) => {
    if (!requireAdmin(req.headers["x-admin-password"])) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const body = req.body ?? {};
    let adminPassword: string | undefined;
    if (body.adminPassword !== undefined) {
      try {
        adminPassword = validateAdminPassword(body.adminPassword);
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : "Invalid password",
        });
      }
    }
    let yargPlacement: YargPlacement | undefined;
    if (body.yargPlacement) {
      try {
        yargPlacement = parsePlacement(body.yargPlacement);
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : "Invalid placement",
        });
      }
    }
    const {
      adminPassword: _incomingPassword,
      yargPlacement: _incomingPlacement,
      eventFlags,
      ...rest
    } = body;
    const next = updateSettings({
      ...rest,
      ...(adminPassword !== undefined ? { adminPassword } : {}),
      ...(yargPlacement !== undefined ? { yargPlacement } : {}),
      eventFlags: eventFlags
        ? { ...getSettings().eventFlags, ...eventFlags }
        : undefined,
    });
    if (next.simulatorEnabled && !bridge.hasYargClient) {
      bridge.startSimulator();
    } else if (!next.simulatorEnabled) {
      bridge.stopSimulator();
    }
    bridge.pushEventFlags();
    bridge.pushQueuePreview();
    return {
      songFolders: next.songFolders,
      instrumentCaps: next.instrumentCaps,
      hostPort: next.hostPort,
      bridgePort: next.bridgePort,
      yaqPublicUrl: next.yaqPublicUrl,
      yargExecutable: next.yargExecutable,
      yargPlacement: next.yargPlacement,
      simulatorEnabled: next.simulatorEnabled,
      eventFlags: next.eventFlags,
      hasAdminPassword: Boolean(next.adminPassword),
    };
  });

  app.post<{
    Body: { newPassword?: string };
  }>("/api/admin/password", async (req, reply) => {
    if (!requireAdmin(req.headers["x-admin-password"])) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    try {
      const adminPassword = validateAdminPassword(req.body?.newPassword);
      updateSettings({ adminPassword });
      return { ok: true };
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : "Failed to change password",
      });
    }
  });

  app.get("/api/qr", async (req) => {
    const settings = getSettings();
    const urls = lanAddresses(settings.hostPort);
    const target = settings.yaqPublicUrl || urls[0];
    const dataUrl = await QRCode.toDataURL(target, {
      margin: 1,
      width: 512,
      color: { dark: "#101820", light: "#f4f7fb" },
    });
    return { url: target, urls, dataUrl };
  });

  app.get("/api/bridge/preview", async () => buildQueuePreviewSafe());

  app.register(async (scoped) => {
    scoped.get("/ws", { websocket: true }, (socket, req) => {
      const role = (req.query as { role?: string }).role ?? "ui";
      if (role === "yarg") {
        bridge.attachYarg(socket);
        socket.send(
          JSON.stringify({ type: "hello", role: "yaq", version: "yaq-1" }),
        );
      } else {
        bridge.attachUi(socket);
        socket.send(
          JSON.stringify({ type: "state", state: buildPublicState() }),
        );
      }
    });
  });

  // SPA fallback
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api") || req.url.startsWith("/ws")) {
      return reply.code(404).send({ error: "Not found" });
    }
    const indexPath = path.join(clientDist, "index.html");
    if (!fs.existsSync(indexPath)) {
      return reply
        .code(503)
        .type("text/plain")
        .send("Client not built. Run: npm run build");
    }
    return reply.type("text/html").send(fs.readFileSync(indexPath, "utf8"));
  });

  const port = settings.hostPort;
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`YAQ listening on ${lanAddresses(port).join(", ")}`);
  console.log(`YARG bridge: ${buildYaqBridgeUrl(port)}`);
  if (!settings.adminPassword) {
    console.log("First-run setup required: open /setup to choose an admin password");
  } else {
    console.log("Admin is password-protected at /admin");
  }
}

function buildQueuePreviewSafe() {
  formSets();
  return getActiveQueueSnapshot().queuePreview;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
