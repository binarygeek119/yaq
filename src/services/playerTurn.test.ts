import { describe, expect, it } from "vitest";
import type { PlaySet, QueueRequest } from "../types.js";
import {
  assignMics,
  clearAllReady,
  emptyPlayerTurn,
  forgetReady,
  isMicInstrument,
  isRequestReady,
  isYourTurn,
  markRequestReady,
  selectMicRequest,
} from "./playerTurn.js";

function req(
  partial: Partial<QueueRequest> & Pick<QueueRequest, "id" | "instrument">,
): QueueRequest {
  return {
    name: partial.name ?? partial.id,
    songHash: partial.songHash ?? "song",
    difficulty: partial.difficulty ?? "Expert",
    createdAt: partial.createdAt ?? 1,
    setId: partial.setId ?? null,
    status: partial.status ?? "waiting",
    clientIp: partial.clientIp ?? "10.0.0.1",
    ...partial,
  };
}

function set(
  partial: Partial<PlaySet> & Pick<PlaySet, "id" | "status" | "playerIds">,
): PlaySet {
  return {
    songHash: "song",
    songName: "Half Measures",
    songArtist: "Artist",
    createdAt: 1,
    startedAt: null,
    finishedAt: null,
    ...partial,
  };
}

describe("mic assignment", () => {
  it("numbers vocals and harmony by join order", () => {
    const mics = assignMics([
      { id: "h", instrument: "Harmony", createdAt: 20 },
      { id: "v", instrument: "Vocals", createdAt: 10 },
      { id: "g", instrument: "FiveFretGuitar", createdAt: 1 },
    ]);
    expect([...mics.entries()]).toEqual([
      ["v", 1],
      ["h", 2],
    ]);
  });

  it("ignores non-mic parts", () => {
    expect(isMicInstrument("Vocals")).toBe(true);
    expect(isMicInstrument("Harmony")).toBe(true);
    expect(isMicInstrument("FiveFretGuitar")).toBe(false);
    expect(assignMics([{ id: "g", instrument: "Keys", createdAt: 1 }]).size).toBe(
      0,
    );
  });
});

describe("selectMicRequest", () => {
  const vocal = req({
    id: "v1",
    instrument: "Vocals",
    status: "in_set",
    setId: "deck",
    createdAt: 5,
  });
  const later = req({
    id: "v2",
    instrument: "Harmony",
    status: "waiting",
    createdAt: 9,
    songHash: "later",
  });

  it("prefers the on-deck or now-playing mic song", () => {
    const deck = set({ id: "deck", status: "on_deck", playerIds: ["v1"] });
    expect(selectMicRequest([later, vocal], null, deck)?.id).toBe("v1");
  });

  it("falls back to the oldest waiting mic request", () => {
    expect(selectMicRequest([later, vocal], null, null)?.id).toBe("v1");
  });

  it("ignores guitar requests", () => {
    const guitar = req({
      id: "g1",
      instrument: "FiveFretGuitar",
      status: "in_set",
      setId: "deck",
    });
    const deck = set({ id: "deck", status: "on_deck", playerIds: ["g1"] });
    expect(selectMicRequest([guitar], null, deck)).toBeNull();
  });
});

describe("isYourTurn", () => {
  const vocal = req({
    id: "v1",
    instrument: "Vocals",
    status: "in_set",
    setId: "deck",
  });

  it("is true on deck", () => {
    expect(
      isYourTurn(
        vocal,
        null,
        set({ id: "deck", status: "on_deck", playerIds: ["v1"] }),
        "idle",
      ),
    ).toBe(true);
  });

  it("is true while YARG is waiting at ready", () => {
    expect(
      isYourTurn(
        vocal,
        set({ id: "deck", status: "now_playing", playerIds: ["v1"] }),
        null,
        "ready",
      ),
    ).toBe(true);
  });

  it("is false once the song is playing", () => {
    expect(
      isYourTurn(
        vocal,
        set({ id: "deck", status: "now_playing", playerIds: ["v1"] }),
        null,
        "playing",
      ),
    ).toBe(false);
  });

  it("starts empty", () => {
    expect(emptyPlayerTurn().active).toBe(false);
    expect(emptyPlayerTurn().mic).toBeNull();
  });
});

describe("ready ids", () => {
  it("can mark and forget a request", () => {
    clearAllReady();
    markRequestReady("v1");
    expect(isRequestReady("v1")).toBe(true);
    forgetReady("v1");
    expect(isRequestReady("v1")).toBe(false);
  });
});
