import { describe, expect, it } from "vitest";
import {
  buildSetPlayers,
  canClaimVenueSlot,
  openJoinParts,
  venueSlotsFromCaps,
} from "./eventProfiles.js";
import type { PlaySet, QueueRequest } from "../types.js";

function request(
  id: string,
  name: string,
  instrument: QueueRequest["instrument"],
  createdAt: number,
): QueueRequest {
  return {
    id,
    name,
    songHash: "abc",
    instrument,
    difficulty: "Expert",
    createdAt,
    setId: "set-1",
    status: "in_set",
    clientIp: `192.168.5.${createdAt}`,
  };
}

describe("venueSlotsFromCaps", () => {
  it("creates guitar_01 / mic_01 ids from per-instrument caps", () => {
    const slots = venueSlotsFromCaps({
      FiveFretGuitar: 1,
      FiveFretBass: 1,
      FourLaneDrums: 1,
      Vocals: 2,
    });
    expect(slots.map((slot) => slot.name)).toEqual([
      "guitar_01",
      "bass_01",
      "drums_01",
      "mic_01",
      "mic_02",
    ]);
    expect(slots.map((slot) => slot.slotId)).toEqual([
      "guitar_01",
      "bass_01",
      "drums_01",
      "mic_01",
      "mic_02",
    ]);
  });

  it("creates one slot per instrument cap with short ids", () => {
    const slots = venueSlotsFromCaps({
      FiveFretGuitar: 2,
      FiveFretBass: 1,
      FourLaneDrums: 0,
    });
    expect(slots.map((slot) => slot.name)).toEqual([
      "guitar_01",
      "guitar_02",
      "bass_01",
    ]);
    expect(slots.map((slot) => slot.slotId)).toEqual([
      "guitar_01",
      "guitar_02",
      "bass_01",
    ]);
  });

  it("uses grouped FiveFret caps for guitar cabinets only", () => {
    const slots = venueSlotsFromCaps({
      FiveFret: 2,
      Keys: 1,
      Vocals: 1,
    });
    expect(slots.map((slot) => slot.slotId)).toEqual([
      "guitar_01",
      "guitar_02",
      "keys_01",
      "mic_01",
    ]);
  });

  it("does not emit overflow or extra bot slot ids", () => {
    const slots = venueSlotsFromCaps({
      FiveFretGuitar: 1,
      Vocals: 1,
    });
    expect(slots.some((slot) => slot.slotId.includes("overflow"))).toBe(false);
    expect(slots.some((slot) => /bot/i.test(slot.slotId))).toBe(false);
  });
});

describe("canClaimVenueSlot", () => {
  const caps = { FiveFretGuitar: 1, Vocals: 1 };

  it("rejects a join when no matching cap slot is free", () => {
    expect(canClaimVenueSlot("FiveFretGuitar", [], caps)).toBe(true);
    expect(
      canClaimVenueSlot("FiveFretGuitar", ["FiveFretGuitar"], caps),
    ).toBe(false);
    expect(canClaimVenueSlot("Vocals", ["FiveFretGuitar"], caps)).toBe(true);
  });
});

describe("openJoinParts", () => {
  it("hides leftover cabinets the song does not have", () => {
    const { openParts } = openJoinParts(
      ["FiveFretGuitar"],
      { FiveFretGuitar: 1, Keys: 1, Vocals: 1 },
      { instruments: ["FiveFretGuitar", "Vocals"] },
    );
    expect(openParts).toContain("Vocals");
    expect(openParts).not.toContain("Keys");
  });
});

describe("buildSetPlayers", () => {
  const caps = {
    FiveFretGuitar: 1,
    FiveFretBass: 1,
    FourLaneDrums: 1,
    Vocals: 1,
  };
  const set: PlaySet = {
    id: "set-1",
    songHash: "abc",
    songName: "Song",
    songArtist: "Artist",
    playerIds: ["r1", "r2"],
    status: "on_deck",
    createdAt: 1,
    startedAt: null,
    finishedAt: null,
  };
  const requests: QueueRequest[] = [
    request("r2", "Apprentice", "FiveFretBass", 20),
    request("r1", "Master", "FiveFretGuitar", 10),
  ];

  it("marks the oldest request as the real song master", () => {
    const players = buildSetPlayers(set, requests, caps, false);
    expect(players).toHaveLength(2);
    expect(players[0]).toMatchObject({
      name: "Master",
      isSongMaster: true,
      isBot: false,
      slotId: "guitar_01",
    });
    expect(players.filter((player) => player.isSongMaster)).toHaveLength(1);
    expect(players.every((player) => player.isBot === false)).toBe(true);
  });

  it("fills leftover guitar/bass/drums/vocals with unused cap slots", () => {
    const players = buildSetPlayers(set, requests, caps, true);
    expect(players.map((player) => player.name)).toEqual([
      "Master",
      "Apprentice",
      "Bot Drums",
      "Bot Vocals",
    ]);
    expect(players.find((player) => player.isBot)).toMatchObject({
      name: "Bot Drums",
      instrument: "FourLaneDrums",
      slotId: "drums_01",
      isSongMaster: false,
    });
    expect(players.find((player) => player.isSongMaster)?.isBot).toBe(false);
  });

  it("does not seat bots on instruments the song does not have", () => {
    const players = buildSetPlayers(set, requests, caps, true, [
      "FiveFretGuitar",
      "FiveFretBass",
    ]);
    expect(players.map((player) => player.instrument)).toEqual([
      "FiveFretGuitar",
      "FiveFretBass",
    ]);
    expect(players.some((player) => player.isBot)).toBe(false);
  });

  it("does not fill leftover keys/pro keys/pro drums slots with bots", () => {
    const wideCaps = {
      FiveFretGuitar: 2,
      Keys: 1,
      ProKeys: 1,
      FourLaneDrums: 1,
      ProDrums: 1,
      Vocals: 2,
    };
    const players = buildSetPlayers(set, requests, wideCaps, true, [
      "FiveFretGuitar",
      "FiveFretBass",
      "Keys",
      "ProKeys",
      "FourLaneDrums",
      "ProDrums",
      "Vocals",
    ]);
    expect(players.filter((player) => !player.isBot).map((player) => player.name)).toEqual([
      "Master",
      "Apprentice",
    ]);
    expect(players.filter((player) => player.isBot).map((player) => player.name)).toEqual([
      "Bot Drums",
      "Bot Vocals",
    ]);
    expect(players.every((player) => !player.slotId.includes("overflow"))).toBe(
      true,
    );
  });

  it("seats Mike plus empty G/B/D/V bots and leaves extra mics sitting out", () => {
    const venueCaps = {
      FiveFretGuitar: 1,
      FiveFretBass: 1,
      FourLaneDrums: 1,
      Vocals: 2,
    };
    const song = ["FiveFretGuitar", "FiveFretBass", "FourLaneDrums", "Vocals"];
    const mikeSet: PlaySet = { ...set, playerIds: ["r-mike"] };
    const players = buildSetPlayers(
      mikeSet,
      [request("r-mike", "Mike", "FiveFretGuitar", 1)],
      venueCaps,
      true,
      song,
    );
    expect(players.map((player) => `${player.name}:${player.slotId}`)).toEqual([
      "Mike:guitar_01",
      "Bot Bass:bass_01",
      "Bot Drums:drums_01",
      "Bot Vocals:mic_01",
    ]);
    expect(players.some((player) => player.slotId === "mic_02")).toBe(false);
  });

  it("fills extra mics only when the chart has Harmony, capped by vocals", () => {
    const venueCaps = { Vocals: 2, FiveFretGuitar: 0, FiveFretBass: 0, FourLaneDrums: 0 };
    const setOnly = { ...set, playerIds: [] };
    const solo = buildSetPlayers(setOnly, [], venueCaps, true, ["Vocals"]);
    expect(solo.filter((player) => player.isBot).map((p) => p.slotId)).toEqual([
      "mic_01",
    ]);
    const harmony = buildSetPlayers(setOnly, [], venueCaps, true, ["Harmony"]);
    expect(harmony.filter((player) => player.isBot).map((p) => p.slotId)).toEqual([
      "mic_01",
      "mic_02",
    ]);
  });

  it("does not add a second guitar bot unless the chart has rhythm/coop", () => {
    const twoGuitars = { FiveFretGuitar: 2, FiveFretBass: 1, Vocals: 0 };
    const guitarOnly = buildSetPlayers(
      { ...set, playerIds: ["r1"] },
      [request("r1", "Mike", "FiveFretGuitar", 1)],
      twoGuitars,
      true,
      ["FiveFretGuitar", "FiveFretBass"],
    );
    expect(guitarOnly.filter((player) => player.isBot).map((p) => p.slotId)).toEqual([
      "bass_01",
    ]);

    const withRhythm = buildSetPlayers(
      { ...set, playerIds: ["r1"] },
      [request("r1", "Mike", "FiveFretGuitar", 1)],
      twoGuitars,
      true,
      ["FiveFretGuitar", "FiveFretRhythm", "FiveFretBass"],
    );
    expect(withRhythm.filter((player) => player.isBot).map((p) => p.slotId)).toEqual([
      "guitar_02",
      "bass_01",
    ]);
  });

  it("never invents overflow slot ids when humans exceed caps", () => {
    const tight = { FiveFretGuitar: 1, Vocals: 0 };
    const overflowSet: PlaySet = { ...set, playerIds: ["r1", "r2"] };
    const players = buildSetPlayers(
      overflowSet,
      [
        request("r1", "Mike", "FiveFretGuitar", 1),
        request("r2", "Will", "FiveFretGuitar", 2),
      ],
      tight,
      true,
      ["FiveFretGuitar"],
    );
    expect(players.map((player) => player.slotId)).toEqual(["guitar_01"]);
    expect(players.map((player) => player.name)).toEqual(["Mike"]);
  });
});
