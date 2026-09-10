import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
import { bridge } from "./services/bridge.js";
import { scanSongFolders, searchSongs } from "./services/library.js";
import {
  cancelRequest,
  formSets,
  getActiveQueueSnapshot,
  joinQueue,
  skipOnDeck,
} from "./services/queue.js";
import type {
  Difficulty,
  Instrument,
  PublicState,
} from "./types.js";
import { DIFFICULTIES, INSTRUMENTS } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  const token = Array.isArray(header) ? header[0] : header;
  return Boolean(token && token === settings.adminPassword);
}

async function main(): Promise<void> {
  initDb();
  const settings = getSettings();
  if (settings.simulatorEnabled) bridge.startSimulator();

  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  await app.register(websocket);

  const clientDist = path.resolve(__dirname, "../client/dist");
  if (fs.existsSync(clientDist)) {
    await app.register(fastifyStatic, {
      root: clientDist,
      prefix: "/",
      wildcard: false,
    });
  }

  app.get("/api/health", async () => ({ ok: true, name: "yaq" }));

  app.get("/api/state", async () => buildPublicState());

  app.get("/api/meta", async () => ({
    instruments: INSTRUMENTS,
    difficulties: DIFFICULTIES,
  }));

  app.get<{ Querystring: { q?: string } }>("/api/songs", async (req) => {
    return searchSongs(req.query.q ?? "");
  });

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
      simulatorEnabled: boolean;
      adminPassword: string;
    }>;
  }>("/api/admin/settings", async (req, reply) => {
    if (!requireAdmin(req.headers["x-admin-password"])) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const next = updateSettings(req.body);
    if (next.simulatorEnabled) bridge.startSimulator();
    else bridge.stopSimulator();
    bridge.pushQueuePreview();
    return next;
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
        socket.send(JSON.stringify({ type: "hello", role: "yaq" }));
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
  console.log(`Admin password: ${settings.adminPassword}`);
}

function buildQueuePreviewSafe() {
  formSets();
  return getActiveQueueSnapshot().queuePreview;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
