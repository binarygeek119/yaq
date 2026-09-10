import type { WebSocket } from "ws";
import { listRequests, listSongs, upsertSongs } from "../db.js";
import type {
  PlaySet,
  QueuePreview,
  QueueRequest,
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

export type BridgeOutbound =
  | { type: "set.prepare"; set: PlaySet; players: QueueRequest[] }
  | { type: "set.launch"; setId: string }
  | { type: "queue.preview"; preview: QueuePreview }
  | { type: "ping" };

export type BridgeInbound =
  | { type: "hello"; version?: string }
  | { type: "library.sync"; songs: SongRecord[] }
  | { type: "state"; state: YargState }
  | { type: "song.ended"; setId?: string; scores?: unknown }
  | { type: "ready"; setId?: string }
  | { type: "pong" };

type Listener = () => void;

class BridgeHub {
  private yargSockets = new Set<WebSocket>();
  private uiSockets = new Set<WebSocket>();
  private listeners = new Set<Listener>();
  yargState: YargState = "disconnected";
  private simulatorTimer: ReturnType<typeof setInterval> | null = null;
  private simTimeouts: ReturnType<typeof setTimeout>[] = [];

  get yargConnected(): boolean {
    return this.yargSockets.size > 0 || this.isSimulatorRunning();
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
    this.yargSockets.add(socket);
    if (this.yargState === "disconnected") this.yargState = "idle";
    this.emit();
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
        this.yargState = "disconnected";
      }
      this.emit();
    });
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

  pushQueuePreview(): void {
    formSets();
    const preview = buildQueuePreview(getOnDeck());
    this.sendYarg({ type: "queue.preview", preview });
    this.broadcastUi({ type: "queue.updated", preview });
    this.emit();
  }

  sendPrepare(set: PlaySet): void {
    const players = listRequests().filter((r) => set.playerIds.includes(r.id));
    this.sendYarg({ type: "set.prepare", set, players });
    this.sendYarg({ type: "set.launch", setId: set.id });
  }

  handleInbound(msg: BridgeInbound): void {
    switch (msg.type) {
      case "hello":
        this.yargState = "idle";
        this.pushQueuePreview();
        break;
      case "library.sync": {
        const songs = (msg.songs ?? []).map((song) => ({
          ...song,
          source: "yarg" as const,
          verified: true,
          instruments: song.instruments ?? [],
          album: song.album ?? "",
          year: song.year ?? "",
          genre: song.genre ?? "",
          charter: song.charter ?? "",
          folderPath: song.folderPath ?? "",
        }));
        upsertSongs(songs);
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
      case "song.ended":
        this.yargState = "score";
        completeNowPlaying();
        this.pushQueuePreview();
        this.broadcastUi({ type: "song.ended" });
        this.emit();
        break;
      default:
        break;
    }
  }

  launchNext(): PlaySet {
    const set = promoteOnDeckToPlaying();
    if (!set) throw new Error("No set on deck");
    this.sendPrepare(set);
    this.yargState = "ready";
    this.pushQueuePreview();
    this.broadcastUi({ type: "set.launched", set });
    this.emit();
    if (this.isSimulatorRunning()) this.simulatePlaythrough(set.id);
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
