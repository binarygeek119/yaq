import type { WebSocket } from "ws";
import { getSettings, listRequests, listSets, listSongs, profilePhotoPathForGuest, upsertSongs } from "../db.js";
import {
  backfillSongDiffs,
  diffsFromSyncPayload,
  parseInstrumentList,
} from "./library.js";
import type {
  EventFlags,
  PlaySet,
  QueuePreview,
  QueuePreviewPlayer,
  SongRecord,
  YargState,
} from "../types.js";
import {
  buildQueuePreview,
  completeNowPlaying,
  formSets,
  getNowPlaying,
  getOnDeck,
  promoteOnDeckToPlaying,
} from "./queue.js";
import { recordSongEnded } from "./scores.js";
import { buildSetPlayers, venueSlotsFromCaps } from "./eventProfiles.js";
import { isRequestReady, listReadyIds } from "./playerTurn.js";
import { portraitDataUrlFromFile } from "./profileMedia.js";
import {
  attachProfileImage,
  toPlayerImageMessage,
  type StreamProfileImage,
} from "./profileImage.js";

export type BridgeOutbound =
  | {
      type: "set.prepare";
      set: PlaySet;
      players: Array<{
        id: string;
        name: string;
        songHash: string;
        instrument: string;
        difficulty: string;
        slotId: string;
        isBot: boolean;
        isSongMaster: boolean;
      } & StreamProfileImage>;
    }
  | { type: "set.launch"; setId: string }
  | {
      type: "queue.preview";
      preview: Omit<QueuePreview, "players"> & {
        players: Array<QueuePreviewPlayer & StreamProfileImage & { isBot: boolean }>;
      };
    }
  | { type: "settings.update"; flags: EventFlags }
  | {
      type: "profiles.setup";
      addTestBots: boolean;
      profiles: Array<{
        slotId: string;
        name: string;
        instrument: string;
        isBot: boolean;
      } & StreamProfileImage>;
    }
  | {
      type: "player.image";
      playerId?: string;
      id?: string;
      name: string;
      dataUrl: string;
    }
  | {
      type: "player.images";
      players: Array<{
        playerId?: string;
        id?: string;
        name: string;
        dataUrl: string;
      }>;
    }
  | {
      type: "profile.images";
      players: Array<{
        playerId?: string;
        id?: string;
        name: string;
        dataUrl: string;
      }>;
    }
  | { type: "eventmode.enter" }
  | { type: "eventmode.exit" }
  | { type: "library.request" }
  | { type: "ping" }
  | {
      type: "player.ready";
      playerId: string;
      id?: string;
      slotId?: string;
      name: string;
      setId?: string | null;
    };

export type BridgeInbound =
  | { type: "hello"; version?: string; capabilities?: string[] }
  | { type: "library.sync"; songs: SongRecord[] }
  | { type: "state"; state: YargState }
  | { type: "song.ended"; setId?: string; scores?: unknown }
  | { type: "ready"; setId?: string }
  | { type: "set.requestLaunch"; setId?: string | null }
  | { type: "settings.ack"; flags: EventFlags }
  | { type: "settings.report"; flags: EventFlags }
  | { type: "eventmode.state"; enabled: boolean; suspended?: boolean }
  | {
      type: "error";
      code?: string;
      setId?: string;
      songHash?: string;
      message?: string;
    }
  | { type: "pong" };

type Listener = () => void;

/** Hold last YARG presence across brief reconnects so admin UI does not flicker. */
export const YARG_DISCONNECT_GRACE_MS = 2500;

export class BridgeHub {
  private yargSockets = new Set<WebSocket>();
  private uiSockets = new Set<WebSocket>();
  private listeners = new Set<Listener>();
  yargState: YargState = "disconnected";
  /** Whether YARG reports Event Mode behaviors as active (not suspended). */
  eventModeEnabled = false;
  lastYargError: BridgeInbound & { type: "error" } | null = null;
  /** Caps from YARG `hello` (`player.image`, `player.images`, `profile.image`). */
  private yargCapabilities = new Set<string>();
  private simulatorTimer: ReturnType<typeof setInterval> | null = null;
  private simTimeouts: ReturnType<typeof setTimeout>[] = [];
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;

  get yargConnected(): boolean {
    return (
      this.yargSockets.size > 0 ||
      this.isSimulatorRunning() ||
      this.disconnectTimer !== null
    );
  }

  /** True when a real YARG WebSocket client is attached (not the simulator). */
  get hasYargClient(): boolean {
    return this.yargSockets.size > 0 || this.disconnectTimer !== null;
  }

  isSimulatorRunning(): boolean {
    return this.simulatorTimer !== null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  attachUi(socket: WebSocket): void {
    this.uiSockets.add(socket);
    socket.on("close", () => this.uiSockets.delete(socket));
  }

  attachYarg(socket: WebSocket): void {
    // Real YARG owns the stream — stop the fake client if it was running.
    if (this.isSimulatorRunning()) this.stopSimulator();

    this.clearDisconnectTimer();
    this.yargSockets.add(socket);
    if (this.yargState === "disconnected") this.yargState = "idle";
    this.emit();
    this.pushEventFlags();
    this.pushVenueProfiles();
    this.pushQueuePreview();
    const now = getNowPlaying();
    if (now) this.sendPrepare(now);

    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as BridgeInbound;
        this.handleInbound(msg);
      } catch (err) {
        console.error("Invalid YARG bridge message", err);
      }
    });

    socket.on("close", () => {
      this.yargSockets.delete(socket);
      if (this.yargSockets.size === 0 && !this.isSimulatorRunning()) {
        this.yargCapabilities.clear();
        this.scheduleYargDisconnect();
        return;
      }
      this.emit();
    });
  }

  private clearDisconnectTimer(): void {
    if (!this.disconnectTimer) return;
    clearTimeout(this.disconnectTimer);
    this.disconnectTimer = null;
  }

  private scheduleYargDisconnect(): void {
    if (this.disconnectTimer) return;
    this.disconnectTimer = setTimeout(() => {
      this.disconnectTimer = null;
      if (this.yargSockets.size > 0 || this.isSimulatorRunning()) return;
      this.yargState = "disconnected";
      this.eventModeEnabled = false;
      this.broadcastUi({ type: "yarg.state", state: "disconnected" });
      this.broadcastUi({
        type: "eventmode.state",
        enabled: false,
        suspended: true,
      });
      this.emit();
    }, YARG_DISCONNECT_GRACE_MS);
  }

  broadcastUi(payload: unknown): void {
    const data = JSON.stringify(payload);
    for (const socket of this.uiSockets) {
      if (socket.readyState === socket.OPEN) socket.send(data);
    }
  }

  private sendYarg(msg: BridgeOutbound): void {
    const data = JSON.stringify(msg);
    for (const socket of this.yargSockets) {
      if (socket.readyState === socket.OPEN) socket.send(data);
    }
  }

  private yargSupports(capability: string): boolean {
    return this.yargCapabilities.has(capability);
  }

  private rememberCapabilities(capabilities: string[] | undefined): void {
    this.yargCapabilities = new Set(
      (capabilities ?? []).map((cap) => String(cap).trim()).filter(Boolean),
    );
  }

  private pushPlayerImages(
    players: Array<{ id?: string; name: string; dataUrl: string; isBot?: boolean }>,
  ): void {
    if (players.length === 0) return;
    const payload = players.map(toPlayerImageMessage);
    if (this.yargSupports("player.images") || this.yargCapabilities.size === 0) {
      this.sendYarg({ type: "player.images", players: payload });
      return;
    }
    if (this.yargSupports("player.image") || this.yargSupports("profile.image")) {
      for (const player of payload) {
        this.sendYarg({ type: "player.image", ...player });
      }
    }
  }

  pushEventFlags(): void {
    const flags = getSettings().eventFlags;
    this.sendYarg({ type: "settings.update", flags });
    this.broadcastUi({ type: "eventFlags.updated", flags });
  }

  pushVenueProfiles(): void {
    const settings = getSettings();
    const profiles = venueSlotsFromCaps(settings.instrumentCaps).map((slot) => ({
      slotId: slot.slotId,
      name: slot.name,
      instrument: slot.instrument,
      isBot: false,
    }));
    const withPortraits = profiles.map((slot) =>
      withGuestPortrait({ ...slot, id: slot.slotId }),
    );
    this.sendYarg({
      type: "profiles.setup",
      addTestBots: Boolean(settings.eventFlags.addTestBots),
      profiles: withPortraits,
    });
    this.pushPlayerImages(withPortraits);
    this.broadcastUi({ type: "profiles.setup", profiles });
  }

  setEventMode(enabled: boolean): boolean {
    if (this.yargSockets.size === 0) {
      throw new Error("No YARG client connected");
    }
    this.sendYarg({ type: enabled ? "eventmode.enter" : "eventmode.exit" });
    // Optimistic — YARG confirms via eventmode.state.
    this.eventModeEnabled = enabled;
    if (enabled) this.pushVenueProfiles();
    this.broadcastUi({
      type: "eventmode.state",
      enabled,
      suspended: !enabled,
    });
    this.emit();
    return true;
  }

  pushQueuePreview(): void {
    formSets();
    const preview = buildQueuePreview(getOnDeck());
    const byId = requestsById();
    const players = preview.players.map((player) =>
      withGuestPortrait(
        { ...player, isBot: false },
        byId.get(player.id)?.clientIp,
      ),
    );
    this.sendYarg({
      type: "queue.preview",
      preview: {
        ...preview,
        players,
      },
    });
    this.pushPlayerImages(players);
    this.syncReadyPlayers();
    this.broadcastUi({ type: "queue.updated", preview });
    this.emit();
  }

  requestLibrary(): void {
    this.sendYarg({ type: "library.request" });
  }

  sendPrepare(set: PlaySet): void {
    const settings = getSettings();
    const requests = listRequests();
    const byId = new Map(requests.map((request) => [request.id, request]));
    const players = buildSetPlayers(
      set,
      requests,
      settings.instrumentCaps,
      Boolean(settings.eventFlags.addTestBots),
    ).map((player) => withGuestPortrait(player, byId.get(player.id)?.clientIp));
    this.sendYarg({ type: "set.prepare", set, players });
    this.pushPlayerImages(players);
    this.sendYarg({ type: "set.launch", setId: set.id });
    this.syncReadyPlayers(set);
  }

  pushPlayerReady(requestId: string): void {
    const request = listRequests().find((row) => row.id === requestId);
    if (!request) return;
    const set =
      listSets().find((row) => row.id === request.setId) ??
      getNowPlaying() ??
      getOnDeck();
    const slotId = this.slotIdForRequest(request.id, set);
    this.sendYarg({
      type: "player.ready",
      playerId: request.id,
      id: request.id,
      slotId,
      name: request.name,
      setId: set?.id ?? request.setId,
    });
    this.broadcastUi({
      type: "player.ready",
      requestId: request.id,
      readyRequestIds: listReadyIds(),
    });
    this.emit();
  }

  private slotIdForRequest(requestId: string, set: PlaySet | null): string | undefined {
    if (!set) return undefined;
    const players = buildSetPlayers(
      set,
      listRequests(),
      getSettings().instrumentCaps,
      false,
    );
    return players.find((player) => player.id === requestId)?.slotId;
  }

  private syncReadyPlayers(set?: PlaySet | null): void {
    const featured = set ?? getNowPlaying() ?? getOnDeck();
    const ids = new Set(
      featured?.playerIds ??
        buildQueuePreview(getOnDeck()).players.map((player) => player.id),
    );
    for (const requestId of listReadyIds()) {
      if (ids.size > 0 && !ids.has(requestId)) continue;
      if (!isRequestReady(requestId)) continue;
      this.pushPlayerReady(requestId);
    }
  }

  handleInbound(msg: BridgeInbound): void {
    switch (msg.type) {
      case "hello":
        this.yargState = "idle";
        this.rememberCapabilities(msg.capabilities);
        this.pushEventFlags();
        this.pushVenueProfiles();
        this.pushQueuePreview();
        this.sendYarg({ type: "library.request" });
        break;
      case "library.sync": {
        const songs = (msg.songs ?? []).map((song) => ({
          ...song,
          source: "yarg" as const,
          verified: true,
          instruments: parseInstrumentList(song.instruments),
          diffs: diffsFromSyncPayload(song as unknown as Record<string, unknown>),
          album: song.album ?? "",
          year: song.year ?? "",
          genre: song.genre ?? "",
          charter: song.charter ?? "",
          folderPath: song.folderPath ?? "",
        }));
        upsertSongs(songs);
        backfillSongDiffs();
        this.broadcastUi({ type: "library.updated", count: listSongs().length });
        this.emit();
        break;
      }
      case "state":
        this.yargState = msg.state;
        this.broadcastUi({ type: "yarg.state", state: msg.state });
        this.emit();
        break;
      case "ready":
        this.yargState = "ready";
        this.broadcastUi({ type: "yarg.state", state: "ready" });
        this.emit();
        break;
      case "song.ended": {
        this.yargState = "score";
        const now = getNowPlaying();
        const members = now
          ? listRequests().filter((r) => now.playerIds.includes(r.id))
          : [];
        recordSongEnded({
          setId: msg.setId,
          scores: msg.scores,
          nowPlaying: now,
          members,
        });
        completeNowPlaying();
        this.pushQueuePreview();
        this.broadcastUi({ type: "song.ended", scores: msg.scores });
        this.tryLaunchNext(false);
        this.emit();
        break;
      }
      case "set.requestLaunch":
        this.tryLaunchNext(true);
        break;
      case "settings.ack":
      case "settings.report":
        this.broadcastUi({ type: "eventFlags.ack", flags: msg.flags });
        this.emit();
        break;
      case "eventmode.state":
        this.eventModeEnabled = Boolean(msg.enabled);
        this.broadcastUi({
          type: "eventmode.state",
          enabled: this.eventModeEnabled,
          suspended: Boolean(msg.suspended),
        });
        this.emit();
        break;
      case "error":
        this.lastYargError = msg;
        console.error("YARG bridge error", msg);
        this.broadcastUi({ type: "yarg.error", error: msg });
        this.emit();
        break;
      default:
        break;
    }
  }

  launchNext(): PlaySet {
    if (this.hasYargClient && !this.eventModeEnabled) {
      throw new Error("YARG Event Mode is off — enter Event Mode first");
    }
    const set = promoteOnDeckToPlaying();
    if (!set) throw new Error("No set on deck");
    this.sendPrepare(set);
    this.yargState = "ready";
    this.pushQueuePreview();
    this.broadcastUi({ type: "set.launched", set });
    this.emit();
    // Only fake a playthrough when no real YARG client is connected.
    if (this.isSimulatorRunning() && this.yargSockets.size === 0) {
      this.simulatePlaythrough(set.id);
    }
    return set;
  }

  /** Prepare the on-deck set, or re-send prepare for the set already playing. */
  private tryLaunchNext(forcePrepare: boolean): void {
    try {
      const now = getNowPlaying();
      if (now) {
        if (forcePrepare) this.sendPrepare(now);
        return;
      }
      if (!getOnDeck()) {
        this.markIdleAfterScore();
        return;
      }
      this.launchNext();
    } catch (err) {
      console.error("YAQ launch next failed", err);
    }
  }

  markIdleAfterScore(): void {
    this.yargState = this.yargConnected ? "idle" : "disconnected";
    this.broadcastUi({ type: "yarg.state", state: this.yargState });
    this.emit();
  }

  startSimulator(): void {
    if (this.simulatorTimer) return;
    this.yargState = "idle";
    this.simulatorTimer = setInterval(() => {
      this.broadcastUi({ type: "simulator.tick", state: this.yargState });
    }, 5000);
    this.emit();
  }

  stopSimulator(): void {
    for (const t of this.simTimeouts) clearTimeout(t);
    this.simTimeouts = [];
    if (this.simulatorTimer) {
      clearInterval(this.simulatorTimer);
      this.simulatorTimer = null;
    }
    if (this.yargSockets.size === 0) this.yargState = "disconnected";
    this.emit();
  }

  private simulatePlaythrough(setId: string): void {
    for (const t of this.simTimeouts) clearTimeout(t);
    this.simTimeouts = [];
    this.yargState = "ready";
    this.broadcastUi({ type: "yarg.state", state: "ready" });
    this.simTimeouts.push(
      setTimeout(() => {
        this.yargState = "playing";
        this.broadcastUi({ type: "yarg.state", state: "playing" });
      }, 1500),
    );
    this.simTimeouts.push(
      setTimeout(() => {
        this.handleInbound({ type: "song.ended", setId });
      }, 8000),
    );
  }
}

function requestsById(): Map<string, { id: string; clientIp: string }> {
  return new Map(listRequests().map((request) => [request.id, request]));
}

function withGuestPortrait<
  T extends { name: string; isBot?: boolean; dataUrl?: string },
>(row: T, clientIp?: string): T & StreamProfileImage {
  const stored = portraitDataUrlFromFile(
    profilePhotoPathForGuest(clientIp, row.name),
  );
  return attachProfileImage({
    ...row,
    dataUrl: row.dataUrl ?? stored?.dataUrl,
  });
}

export const bridge = new BridgeHub();
