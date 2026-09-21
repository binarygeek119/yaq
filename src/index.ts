import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import QRCode from "qrcode";
import {
  getProfile,
  getSettings,
  initDb,
  listSets,
  listSongs,
  parseSongQueueCap,
  profilePhotoPath,
  updateSettings,
  upsertProfile,
  getSchemaInfo,
} from "./db.js";
import { clientDistRoot } from "./paths.js";
import { bridge } from "./services/bridge.js";
import { coverContentType, resolveCoverPath } from "./services/cover.js";
import { searchSongs, backfillSongDiffs } from "./services/library.js";
import {
  buildPlayerTurn,
  forgetReady,
  isMicInstrument,
  listReadyIds,
  markRequestReady,
} from "./services/playerTurn.js";
import {
  buildGuestProfile,
  cancelRequest,
  formSets,
  getActiveQueueSnapshot,
  joinQueue,
  leaveEvent,
  publicRequests,
  removeQueueItem,
  skipOnDeck,
} from "./services/queue.js";
import { parseInstrumentDefaults } from "./services/profileFields.js";
import {
  clearProfilePhoto,
  saveProfilePhoto,
} from "./services/profileMedia.js";
import { publicHomeUrl } from "./services/homeUrl.js";
import {
  bodyTooLargeMessage,
  isBodyTooLargeError,
} from "./services/httpErrors.js";
import { normalizeClientIp } from "./services/ip.js";
import {
  httpsListenPort,
  ipv4LanHosts,
  lanAddresses,
  yargLanBridgeUrl,
} from "./services/lanUrls.js";
import { ensureSelfSignedTls } from "./services/tls.js";
import { shouldRedirectToSetup } from "./services/setupGate.js";
import { buildLetterboard, scoresForPlayer } from "./services/scores.js";
import { probeYargPlacement, type YargPlacement } from "./services/placement.js";
import {
  ensureEventName,
  getEventIdentity,
} from "./services/eventIdentity.js";
import {
  buildScoreExport,
  importScoreExport,
} from "./services/scoreExport.js";
import {
  buildYaqBridgeUrl,
  getLaunchedYargPid,
  launchYargProcess,
} from "./services/yargLauncher.js";
import type {
  Difficulty,
  Instrument,
  PlayerTurn,
  PublicState,
} from "./types.js";
import { DIFFICULTIES, INSTRUMENTS } from "./types.js";
import { YAQ_VERSION, injectYaqVersionHtml } from "./version.js";

const MIN_ADMIN_PASSWORD_LENGTH = 4;

/** Bound after HTTPS listen succeeds; null keeps guest URLs on HTTP only. */
let activeHttpsPort: number | null = null;

function currentLanUrls(): string[] {
  return lanAddresses(getSettings().hostPort, activeHttpsPort);
}

function requestClientIp(req: { ip?: string }): string {
  return normalizeClientIp(req.ip);
}

function buildPublicState(): PublicState {
  formSets();
  const identity = getEventIdentity();
  const settings = getSettings();
  const snap = getActiveQueueSnapshot();
  const { adminPassword: _, ...publicSettings } = settings;
  return {
    songs: listSongs(),
    requests: publicRequests(),
    sets: listSets(),
    settings: {
      ...publicSettings,
      eventName: identity.name,
      hasAdminPassword: Boolean(settings.adminPassword),
    },
    yargState: bridge.yargState,
    yargConnected: bridge.yargConnected,
    eventModeEnabled: bridge.eventModeEnabled,
    eventHash: identity.hash,
    hasYargClient: bridge.hasYargClient,
    nowPlaying: snap.nowPlaying,
    onDeck: snap.onDeck,
    queuePreview: snap.queuePreview,
    queueBoard: snap.queueBoard,
    readyRequestIds: listReadyIds(),
    lanUrls: currentLanUrls(),
    version: YAQ_VERSION,
    schemaVersion: getSchemaInfo().schemaVersion,
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
  const urls = currentLanUrls();
  const probe = probeYargPlacement(settings.yargExecutable);
  return {
    needsSetup: !settings.adminPassword,
    hasAdminPassword: Boolean(settings.adminPassword),
    placement: probe,
    savedPlacement: settings.yargPlacement || probe.detected,
    yargExecutable: settings.yargExecutable || probe.yargPath || "",
    lanUrls: urls,
    sameMachineBridgeUrl: buildYaqBridgeUrl(port),
    secondMachineBridgeUrl: yargLanBridgeUrl(port),
  };
}

async function main(): Promise<void> {
  initDb();
  backfillSongDiffs();
  const settings = getSettings();
  if (settings.simulatorEnabled) bridge.startSimulator();
  bridge.requestLibrary();

  const httpPort = settings.hostPort;
  const httpsPort = httpsListenPort(httpPort);
  const lanHosts = ipv4LanHosts();
  const tls = ensureSelfSignedTls(lanHosts);
  const httpServer = http.createServer();
  const httpsServer =
    tls && httpsPort !== httpPort
      ? https.createServer({ key: tls.key, cert: tls.cert })
      : null;

  const app = Fastify({
    logger: true,
    bodyLimit: 2_000_000,
    serverFactory(handler) {
      httpServer.on("request", handler);
      if (httpsServer) {
        httpsServer.on("request", handler);
        httpsServer.on("upgrade", (req, socket, head) => {
          httpServer.emit("upgrade", req, socket, head);
        });
      }
      return httpServer;
    },
  });
  if (httpsServer) {
    app.addHook("onClose", async () => {
      await new Promise<void>((resolve, reject) => {
        httpsServer.close((err) => (err ? reject(err) : resolve()));
      });
    });
  }
  await app.register(cors, { origin: true });
  await app.register(websocket);

  app.setErrorHandler((err, req, reply) => {
    if (isBodyTooLargeError(err)) {
      return reply.code(413).send({ error: bodyTooLargeMessage(req.url) });
    }
    return reply.send(err);
  });

  app.addHook("onRequest", async (req, reply) => {
    if (req.method !== "GET" && req.method !== "HEAD") return;
    if (!shouldRedirectToSetup(req.url, getSettings().adminPassword)) return;
    return reply.redirect("/setup");
  });

  const clientDist = clientDistRoot();
  if (fs.existsSync(clientDist)) {
    await app.register(fastifyStatic, {
      root: clientDist,
      prefix: "/",
      wildcard: false,
      index: false,
    });
  }

  app.get("/api/health", async () => ({
    ok: true,
    name: "yaq",
    version: YAQ_VERSION,
  }));

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

  app.get("/api/profile", async (req, reply) => {
    const ip = requestClientIp(req);
    if (!ip) return reply.code(400).send({ error: "Device address required" });
    return buildGuestProfile(ip);
  });

  app.get("/api/player", async (req, reply) => {
    const ip = requestClientIp(req);
    if (!ip) return reply.code(400).send({ error: "Device address required" });
    formSets();
    return buildPlayerTurn(ip, bridge.yargState);
  });

  app.post("/api/player/ready", async (req, reply) => {
    const ip = requestClientIp(req);
    if (!ip) return reply.code(400).send({ error: "Device address required" });
    formSets();
    const turn = buildPlayerTurn(ip, bridge.yargState);
    if (!turn.active || !turn.requestId) {
      return reply.code(400).send({ error: "No mic song to ready" });
    }
    if (!isMicInstrument(turn.instrument)) {
      return reply.code(400).send({ error: "Ready from YAQ is for mic players" });
    }
    markRequestReady(turn.requestId);
    bridge.pushPlayerReady(turn.requestId);
    const next: PlayerTurn = { ...buildPlayerTurn(ip, bridge.yargState), ready: true };
    return { turn: next, state: buildPublicState() };
  });

  app.post("/api/player/unready", async (req, reply) => {
    const ip = requestClientIp(req);
    if (!ip) return reply.code(400).send({ error: "Device address required" });
    formSets();
    const turn = buildPlayerTurn(ip, bridge.yargState);
    if (!turn.active || !turn.requestId) {
      return reply.code(400).send({ error: "No mic song to unready" });
    }
    if (!isMicInstrument(turn.instrument)) {
      return reply.code(400).send({ error: "Ready from YAQ is for mic players" });
    }
    forgetReady(turn.requestId);
    bridge.pushPlayerUnready(turn.requestId);
    const next: PlayerTurn = { ...buildPlayerTurn(ip, bridge.yargState), ready: false };
    return { turn: next, state: buildPublicState() };
  });

  app.get("/api/scores", async (req, reply) => {
    const ip = requestClientIp(req);
    if (!ip) return reply.code(400).send({ error: "Device address required" });
    const profile = buildGuestProfile(ip);
    return { playerName: profile.name, runs: scoresForPlayer(profile.name) };
  });

  app.get("/api/letterboard", async () => buildLetterboard());

  app.get("/api/profile/scores/export", async (req, reply) => {
    const ip = requestClientIp(req);
    if (!ip) return reply.code(400).send({ error: "Device address required" });
    const profile = buildGuestProfile(ip);
    const exported = buildScoreExport(profile.name);
    return exported;
  });

  app.post("/api/profile/scores/import", async (req, reply) => {
    const ip = requestClientIp(req);
    if (!ip) return reply.code(400).send({ error: "Device address required" });
    if (!getSettings().allowImportedScores) {
      return reply.code(403).send({
        error: "Imported last-event scores are not allowed this event.",
      });
    }
    const profile = buildGuestProfile(ip);
    try {
      const result = importScoreExport(profile.name, req.body);
      return result;
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : "Import failed",
      });
    }
  });

  app.get("/api/profile/photo", async (req, reply) => {
    const ip = requestClientIp(req);
    if (!ip) return reply.code(400).send({ error: "Device address required" });
    const filePath = profilePhotoPath(ip);
    if (!filePath || !fs.existsSync(filePath)) {
      return reply.code(404).send({ error: "Photo not found" });
    }
    reply.header("Cache-Control", "private, max-age=60");
    reply.type(coverContentType(filePath));
    return reply.send(fs.createReadStream(filePath));
  });

  app.put<{
    Body: {
      name?: string;
      instrument?: Instrument;
      difficulty?: Difficulty;
      instrumentDefaults?: Record<string, string>;
      photoDataUrl?: string | null;
      onboarded?: boolean;
    };
  }>("/api/profile", async (req, reply) => {
    const ip = requestClientIp(req);
    if (!ip) return reply.code(400).send({ error: "Device address required" });
    const instrument = req.body?.instrument;
    const difficulty = req.body?.difficulty;
    if (instrument && !INSTRUMENTS.includes(instrument)) {
      return reply.code(400).send({ error: "Invalid instrument" });
    }
    if (difficulty && !DIFFICULTIES.includes(difficulty)) {
      return reply.code(400).send({ error: "Invalid difficulty" });
    }
    const instrumentDefaults = parseInstrumentDefaults(
      req.body?.instrumentDefaults,
    );
    let photoExt: string | undefined;
    let bumpPhotoRev = false;
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "photoDataUrl")) {
      try {
        const stored = getProfile(ip);
        if (req.body?.photoDataUrl) {
          const saved = saveProfilePhoto(
            ip,
            req.body.photoDataUrl,
            stored?.photoExt ?? "",
          );
          photoExt = saved.photoExt;
          bumpPhotoRev = true;
        } else {
          clearProfilePhoto(ip, stored?.photoExt ?? "");
          photoExt = "";
          bumpPhotoRev = true;
        }
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : "Invalid photo",
        });
      }
    }
    const onboarded = req.body?.onboarded === true;
    if (onboarded) {
      const name = (req.body?.name ?? getProfile(ip)?.name ?? "").trim();
      if (!name) {
        return reply.code(400).send({ error: "Name required" });
      }
    }
    upsertProfile({
      ip,
      name: req.body?.name,
      instrument,
      difficulty,
      instrumentDefaults,
      photoExt,
      bumpPhotoRev,
      ...(onboarded ? { onboarded: true } : {}),
    });
    bridge.pushQueuePreview();
    return buildGuestProfile(ip);
  });

  app.post<{
    Body: {
      name: string;
      songHash: string;
      instrument: Instrument;
      difficulty?: Difficulty;
    };
  }>("/api/queue/join", async (req, reply) => {
    try {
      const ip = requestClientIp(req);
      const request = joinQueue({ ...req.body, clientIp: ip });
      const { clientIp: _ip, ...publicRequest } = request;
      bridge.pushQueuePreview();
      return {
        request: publicRequest,
        state: buildPublicState(),
        profile: buildGuestProfile(ip),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Join failed";
      const code =
        message === "Song cap reached" || message === "Already in this song"
          ? 409
          : 400;
      return reply.code(code).send({ error: message });
    }
  });

  app.post<{ Params: { id: string } }>(
    "/api/queue/:id/cancel",
    async (req, reply) => {
      try {
        cancelRequest(req.params.id, requestClientIp(req));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Leave failed";
        const code = message === "Not your request" ? 403 : 400;
        return reply.code(code).send({ error: message });
      }
      bridge.pushQueuePreview();
      return buildPublicState();
    },
  );

  app.post("/api/queue/leave-event", async (req, reply) => {
    const ip = requestClientIp(req);
    if (!ip) return reply.code(400).send({ error: "Device address required" });
    const cancelled = leaveEvent(ip);
    bridge.pushQueuePreview();
    return {
      cancelled,
      state: buildPublicState(),
      profile: buildGuestProfile(ip),
    };
  });

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

  app.post<{
    Body: { setId?: string | null; playerIds?: string[] };
  }>("/api/admin/queue/remove", async (req, reply) => {
    if (!requireAdmin(req.headers["x-admin-password"])) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    try {
      removeQueueItem({
        setId: req.body?.setId,
        playerIds: req.body?.playerIds,
      });
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : "Remove failed",
      });
    }
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

  app.post("/api/admin/library/sync", async (req, reply) => {
    if (!requireAdmin(req.headers["x-admin-password"])) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    try {
      const result = await bridge.syncLibraryFromYarg();
      return {
        ...result,
        state: buildPublicState(),
      };
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : "Song sync failed",
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
      songQueueCap: number;
      songQueueCapEnabled: boolean;
      yaqPublicUrl: string;
      yargExecutable: string;
      yargPlacement: YargPlacement | "";
      simulatorEnabled: boolean;
      adminPassword: string;
      eventName: string;
      allowImportedScores: boolean;
      eventFlags: Partial<{
        hotMic: boolean;
        showUpNextHud: boolean;
        skipMainMenu: boolean;
        openDifficultySelect: boolean;
        addTestBots: boolean;
        noFail: boolean;
        noMute: boolean;
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
      songQueueCap: incomingCap,
      songQueueCapEnabled: incomingCapEnabled,
      eventName: incomingEventName,
      allowImportedScores: incomingAllowImported,
      ...rest
    } = body;
    if (typeof incomingEventName === "string") {
      ensureEventName(incomingEventName);
    }
    const next = updateSettings({
      ...rest,
      ...(adminPassword !== undefined ? { adminPassword } : {}),
      ...(yargPlacement !== undefined ? { yargPlacement } : {}),
      ...(incomingCap !== undefined
        ? { songQueueCap: parseSongQueueCap(incomingCap) }
        : {}),
      ...(typeof incomingCapEnabled === "boolean"
        ? { songQueueCapEnabled: incomingCapEnabled }
        : {}),
      ...(typeof incomingAllowImported === "boolean"
        ? { allowImportedScores: incomingAllowImported }
        : {}),
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
    bridge.pushVenueProfiles();
    bridge.pushQueuePreview();
    const identity = getEventIdentity();
    return {
      songFolders: next.songFolders,
      instrumentCaps: next.instrumentCaps,
      songQueueCap: next.songQueueCap,
      songQueueCapEnabled: next.songQueueCapEnabled,
      hostPort: next.hostPort,
      bridgePort: next.bridgePort,
      yaqPublicUrl: next.yaqPublicUrl,
      yargExecutable: next.yargExecutable,
      yargPlacement: next.yargPlacement,
      simulatorEnabled: next.simulatorEnabled,
      eventFlags: next.eventFlags,
      eventName: identity.name,
      eventHash: identity.hash,
      allowImportedScores: next.allowImportedScores,
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
    const urls = currentLanUrls();
    const target = publicHomeUrl(settings.yaqPublicUrl, urls);
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
    return reply
      .type("text/html")
      .send(injectYaqVersionHtml(fs.readFileSync(indexPath, "utf8")));
  });

  await app.listen({ port: httpPort, host: "0.0.0.0" });
  if (httpsServer) {
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (err: Error) => reject(err);
        httpsServer.once("error", onError);
        httpsServer.listen(httpsPort, "0.0.0.0", () => {
          httpsServer.off("error", onError);
          resolve();
        });
      });
      activeHttpsPort = httpsPort;
    } catch (err) {
      console.error(`YAQ HTTPS failed to bind :${httpsPort}`, err);
    }
  }
  console.log(`YAQ ${YAQ_VERSION} listening on ${currentLanUrls().join(", ")}`);
  console.log(`YARG bridge: ${buildYaqBridgeUrl(httpPort)}`);
  if (activeHttpsPort) {
    console.log(
      "Phones: open an https:// URL for system notifications (accept the self-signed cert warning).",
    );
  }
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
