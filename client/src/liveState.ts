import type { PublicState } from "./api";

export type UiBridgeMessage = {
  type: string;
  state?: unknown;
  enabled?: boolean;
  preview?: PublicState["queuePreview"];
  requestId?: string;
  readyRequestIds?: string[];
};

const REFETCH_TYPES = new Set([
  "library.updated",
  "set.launched",
  "song.ended",
]);

export function isPublicState(value: unknown): value is PublicState {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return (
    typeof rec.yargState === "string" &&
    typeof rec.eventModeEnabled === "boolean" &&
    typeof rec.hasYargClient === "boolean" &&
    rec.settings !== null &&
    typeof rec.settings === "object"
  );
}

/**
 * Apply a UI websocket payload. Chatter (event mode, yarg state, ticks)
 * patches locally instead of refetching /api/state, which raced and flickered
 * the admin Stream / Event Mode controls.
 */
export function applyUiBridgeMessage(
  prev: PublicState | null,
  msg: UiBridgeMessage,
): { state: PublicState | null; refetch: boolean } {
  if (msg.type === "state" && isPublicState(msg.state)) {
    return { state: msg.state, refetch: false };
  }
  if (!prev) {
    return { state: prev, refetch: REFETCH_TYPES.has(msg.type) };
  }
  switch (msg.type) {
    case "eventmode.state":
      return {
        state: { ...prev, eventModeEnabled: Boolean(msg.enabled) },
        refetch: false,
      };
    case "yarg.state": {
      if (typeof msg.state !== "string") {
        return { state: prev, refetch: false };
      }
      const yargState = msg.state;
      const disconnected = yargState === "disconnected";
      return {
        state: {
          ...prev,
          yargState,
          yargConnected: !disconnected,
          hasYargClient: disconnected ? false : prev.hasYargClient,
          eventModeEnabled: disconnected ? false : prev.eventModeEnabled,
        },
        refetch: false,
      };
    }
    case "queue.updated":
      if (!msg.preview) return { state: prev, refetch: true };
      return {
        state: { ...prev, queuePreview: msg.preview },
        refetch: true,
      };
    case "player.ready":
    case "player.unready": {
      const readyRequestIds = Array.isArray(msg.readyRequestIds)
        ? msg.readyRequestIds.map(String)
        : msg.requestId
          ? msg.type === "player.unready"
            ? (prev.readyRequestIds ?? []).filter((id) => id !== msg.requestId)
            : [...new Set([...(prev.readyRequestIds ?? []), msg.requestId])]
          : prev.readyRequestIds ?? [];
      return {
        state: { ...prev, readyRequestIds },
        refetch: false,
      };
    }
    case "simulator.tick":
    case "eventFlags.updated":
    case "eventFlags.ack":
    case "yarg.error":
    case "ping":
    case "pong":
      return { state: prev, refetch: false };
    default:
      return { state: prev, refetch: REFETCH_TYPES.has(msg.type) };
  }
}
