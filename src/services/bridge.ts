import type { WebSocket } from "ws";
import { getSettings, listRequests, listSongs, upsertSongs } from "../db.js";
import {
  backfillSongDiffs,
  diffsFromSyncPayload,
  parseInstrumentList,
} from "./library.js";
import type {
  EventFlags,
  PlaySet,
  QueuePreview,
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
      }>;
    }
  | { type: "set.launch"; setId: string }
  | { type: "queue.preview"; preview: QueuePreview }
  | { type: "settings.update"; flags: EventFlags }
  | { type: "eventmode.enter" }
  | { type: "eventmode.exit" }
  | { type: "library.request" }
  | { type: "ping" };

export type BridgeInbound =
  | { type: "hello"; version?: string }
  | { type: "library.sync"; songs: SongRecord[] }
  | { type: "state"; state: YargState }
  | { type: "song.ended"; setId?: string; scores?: unknown }
  | { type: "ready"; setId?: string }
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

  pushEventFlags(): void {
    const flags = getSettings().eventFlags;
    this.sendYarg({ type: "settings.update", flags });
    this.broadcastUi({ type: "eventFlags.updated", flags });
  }

  setEventMode(enabled: boolean): boolean {
    if (this.yargSockets.size === 0) {
      throw new Error("No YARG client connected");
    }
    this.sendYarg({ type: enabled ? "eventmode.enter" : "eventmode.exit" });
    // Optimistic — YARG confirms via eventmode.state.
    this.eventModeEnabled = enabled;
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
    this.sendYarg({ type: "queue.preview", preview });
    this.broadcastUi({ type: "queue.updated", preview });
    this.emit();
  }

  requestLibrary(): void {
    this.sendYarg({ type: "library.request" });
  }

  sendPrepare(set: PlaySet): void {
    const players = listRequests()
      .filter((r) => set.playerIds.includes(r.id))
      .map((r) => ({
        id: r.id,
        name: r.name,
        songHash: r.songHash,
        instrument: r.instrument,
        difficulty: r.difficulty,
      }));
    this.sendYarg({ type: "set.prepare", set, players });
    this.sendYarg({ type: "set.launch", setId: set.id });
  }

  handleInbound(msg: BridgeInbound): void {
    switch (msg.type) {
      case "hello":
        this.yargState = "idle";
        this.pushEventFlags();
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
        this.emit();
        break;
      }
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
        this.simTimeouts.push(
          setTimeout(() => this.markIdleAfterScore(), 2000),
        );
      }, 8000),
    );
  }
}

export const bridge = new BridgeHub();
