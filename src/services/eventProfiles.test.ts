import { describe, expect, it } from "vitest";
import { buildSetPlayers, venueSlotsFromCaps } from "./eventProfiles.js";
import type { PlaySet, QueueRequest } from "../types.js";

describe("venueSlotsFromCaps", () => {
  it("creates one slot per instrument cap", () => {
    const slots = venueSlotsFromCaps({
      FiveFretGuitar: 2,
      FiveFretBass: 1,
      FourLaneDrums: 0,
    });
    expect(slots.map((slot) => slot.name)).toEqual(["Guitar 1", "Guitar 2", "Bass"]);
    expect(slots.map((slot) => slot.slotId)).toEqual([
      "FiveFretGuitar_1",
      "FiveFretGuitar_2",
      "FiveFretBass_1",
    ]);
  });

  it("uses grouped FiveFret caps for guitar cabinets only", () => {
    const slots = venueSlotsFromCaps({
      FiveFret: 2,
      Keys: 1,
      Vocals: 1,
    });
    expect(slots.map((slot) => slot.slotId)).toEqual([
      "FiveFretGuitar_1",
      "FiveFretGuitar_2",
      "Keys_1",
      "Vocals_1",
    ]);
  });
});

describe("buildSetPlayers", () => {
  const caps = { FiveFretGuitar: 1, FiveFretBass: 1, Vocals: 1 };
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
    {
      id: "r2",
      name: "Apprentice",
      songHash: "abc",
      instrument: "FiveFretBass",
      difficulty: "Hard",
      createdAt: 20,
      setId: "set-1",
      status: "in_set",
      clientIp: "192.168.5.20",
    },
    {
      id: "r1",
      name: "Master",
      songHash: "abc",
      instrument: "FiveFretGuitar",
      difficulty: "Expert",
      createdAt: 10,
      setId: "set-1",
      status: "in_set",
      clientIp: "192.168.5.10",
    },
  ];

  it("marks the oldest request as the real song master", () => {
    const players = buildSetPlayers(set, requests, caps, false);
    expect(players).toHaveLength(2);
    expect(players[0]).toMatchObject({
      name: "Master",
      isSongMaster: true,
      isBot: false,
      slotId: "FiveFretGuitar_1",
    });
    expect(players.filter((player) => player.isSongMaster)).toHaveLength(1);
    expect(players.every((player) => player.isBot === false)).toBe(true);
  });

  it("fills leftover guitar/bass/drums/vocals with one bot each", () => {
    const players = buildSetPlayers(set, requests, caps, true);
    expect(players.map((player) => player.name)).toEqual([
      "Master",
      "Apprentice",
      "Bot Drums",
      "Bot Vocals",
    ]);
    const bot = players.find((player) => player.isBot);
    expect(bot).toMatchObject({
      name: "Bot Drums",
      instrument: "FourLaneDrums",
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
  });
});
