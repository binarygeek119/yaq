import { describe, expect, it } from "vitest";
import { applyUiBridgeMessage, isPublicState } from "./liveState.js";
import type { PublicState } from "../types.js";

const base = {
  songs: [],
  requests: [],
  sets: [],
  settings: { hasAdminPassword: true },
  yargState: "idle",
  yargConnected: true,
  eventModeEnabled: true,
  hasYargClient: true,
  nowPlaying: null,
  onDeck: null,
  queuePreview: {
    setId: null,
    songHash: null,
    songName: null,
    songArtist: null,
    players: [],
  },
  lanUrls: [],
} as unknown as PublicState;

describe("applyUiBridgeMessage", () => {
  it("applies full public state payloads only", () => {
    expect(isPublicState({ yargState: "idle" })).toBe(false);
    expect(isPublicState("idle")).toBe(false);
    const full = { ...base, yargState: "playing" as const };
    const next = applyUiBridgeMessage(base, { type: "state", state: full });
    expect(next.refetch).toBe(false);
    expect(next.state?.yargState).toBe("playing");
  });

  it("does not treat a YARG idle string as public state", () => {
    const next = applyUiBridgeMessage(base, { type: "state", state: "idle" });
    expect(next.state).toEqual(base);
    expect(next.refetch).toBe(false);
  });

  it("patches event mode without refetching", () => {
    const off = applyUiBridgeMessage(base, {
      type: "eventmode.state",
      enabled: false,
    });
    expect(off.refetch).toBe(false);
    expect(off.state?.eventModeEnabled).toBe(false);
    expect(off.state?.hasYargClient).toBe(true);
    expect(off.state?.yargState).toBe("idle");
  });

  it("ignores simulator ticks and flag chatter", () => {
    for (const type of [
      "simulator.tick",
      "eventFlags.updated",
      "eventFlags.ack",
    ]) {
      const next = applyUiBridgeMessage(base, { type });
      expect(next.refetch).toBe(false);
      expect(next.state).toEqual(base);
    }
  });

  it("does not drop event mode on a non-disconnect yarg.state", () => {
    const next = applyUiBridgeMessage(base, {
      type: "yarg.state",
      state: "ready",
    });
    expect(next.refetch).toBe(false);
    expect(next.state?.yargState).toBe("ready");
    expect(next.state?.eventModeEnabled).toBe(true);
    expect(next.state?.hasYargClient).toBe(true);
  });
});
