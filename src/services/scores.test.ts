import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data-test-scores");
fs.mkdirSync(dataDir, { recursive: true });
process.env.YAQ_DATA_DIR = dataDir;

type DbMod = typeof import("../db.js");
type ScoresMod = typeof import("./scores.js");

let dbMod: DbMod;
let scoresMod: ScoresMod;

beforeAll(async () => {
  dbMod = await import("../db.js");
  scoresMod = await import("./scores.js");
});

describe("score payload and letterboard", () => {
  beforeEach(() => {
    dbMod.initDb();
    dbMod.db.exec("DELETE FROM scores;");
  });

  it("maps YARG profile cards onto queued guest names", () => {
    const runs = scoresMod.recordSongEnded({
      setId: "set-1",
      nowPlaying: {
        id: "set-1",
        songHash: "abc",
        songName: "Slow Ride",
        songArtist: "Foghat",
        playerIds: ["r1", "r2"],
        status: "now_playing",
        createdAt: 1,
        startedAt: 1,
        finishedAt: null,
      },
      members: [
        {
          id: "r1",
          name: "Loopback Josh",
          songHash: "abc",
          instrument: "FiveFretGuitar",
          difficulty: "Expert",
          createdAt: 1,
          setId: "set-1",
          status: "playing",
          clientIp: "127.0.0.1",
        },
        {
          id: "r2",
          name: "emily",
          songHash: "abc",
          instrument: "Vocals",
          difficulty: "Hard",
          createdAt: 2,
          setId: "set-1",
          status: "playing",
          clientIp: "192.168.5.10",
        },
      ],
      scores: {
        bandScore: 200000,
        bandStars: 5,
        players: [
          {
            name: "guitar_01",
            instrument: "FiveFretGuitar",
            difficulty: "Expert",
            score: 120000,
            stars: 5,
            isBot: false,
          },
          {
            name: "vocals_01",
            instrument: "Vocals",
            difficulty: "Hard",
            score: 80000,
            stars: 4,
            isBot: false,
          },
        ],
      },
    });
    expect(runs.map((r) => r.playerName)).toEqual(["Loopback Josh", "emily"]);
    expect(scoresMod.scoresForPlayer("loopback josh")).toHaveLength(1);

    const board = scoresMod.buildLetterboard();
    expect(board.overall[0]?.playerName).toBe("Loopback Josh");
    expect(board.overall[0]?.totalScore).toBe(120000);
    expect(board.songs[0]?.entries[0]?.playerName).toBe("Loopback Josh");
  });

  it("stores YARG percent, combo, and full-combo flags", () => {
    const [run] = scoresMod.recordSongEnded({
      setId: "set-fc",
      nowPlaying: {
        id: "set-fc",
        songHash: "fc",
        songName: "The Outsider",
        songArtist: "A Perfect Circle",
        playerIds: ["r1"],
        status: "now_playing",
        createdAt: 1,
        startedAt: 1,
        finishedAt: null,
      },
      members: [
        {
          id: "r1",
          name: "Loopback Josh",
          songHash: "fc",
          instrument: "FiveFretGuitar",
          difficulty: "Expert",
          createdAt: 1,
          setId: "set-fc",
          status: "playing",
          clientIp: "127.0.0.1",
        },
      ],
      scores: {
        bandScore: 99999,
        bandStars: 5,
        players: [
          {
            name: "Loopback Josh",
            instrument: "FiveFretGuitar",
            difficulty: "Expert",
            score: 99999,
            stars: 5,
            percent: 1,
            notesHit: 834,
            totalNotes: 834,
            maxCombo: 834,
            starPowerPhrasesHit: 27,
            totalStarPowerPhrases: 27,
            averageMultiplier: 4.2,
            isFullCombo: true,
            isHighScore: true,
            isBot: false,
            notesMissed: 0,
            overstrums: 1,
            ghostInputs: 0,
            starPowerActivations: 1,
            timeInStarPower: 25,
            enginePreset: "Precision Engine",
            modifiersUsed: true,
          },
        ],
      },
    });
    expect(run?.percent).toBe(1);
    expect(run?.notesHit).toBe(834);
    expect(run?.isFullCombo).toBe(true);
    expect(run?.isHighScore).toBe(true);
    expect(run?.avgMultiplier).toBeCloseTo(4.2);
    expect(run?.notesMissed).toBe(0);
    expect(run?.overstrums).toBe(1);
    expect(run?.spUses).toBe(1);
    expect(run?.timeInSp).toBe(25);
    expect(run?.enginePreset).toBe("Precision Engine");
    expect(run?.modifiersUsed).toBe(true);

    const board = scoresMod.buildLetterboard();
    expect(board.overall[0]?.fullCombos).toBe(1);
    expect(board.overall[0]?.goldStars).toBe(1);
    expect(board.overall[0]?.lastPlayed?.songName).toBe("The Outsider");
    expect(board.overall[0]?.mostPlayed?.songName).toBe("The Outsider");
    expect(board.songs[0]?.entries[0]).toMatchObject({
      playerName: "Loopback Josh",
      percent: 1,
      isFullCombo: true,
      stars: 5,
      isHighScore: true,
    });
  });

  it("skips empty or bot-only payloads", () => {
    expect(
      scoresMod.recordSongEnded({
        scores: null,
        nowPlaying: null,
        members: [],
      }),
    ).toEqual([]);
    expect(
      scoresMod.recordSongEnded({
        scores: { players: [{ name: "bot", score: 1, isBot: true }] },
        nowPlaying: null,
        members: [],
      }),
    ).toEqual([]);
  });

  it("keeps imported scores off the letterboard until admin allows them", () => {
    scoresMod.recordSongEnded({
      setId: "set-1",
      nowPlaying: {
        id: "set-1",
        songHash: "abc",
        songName: "Slow Ride",
        songArtist: "Foghat",
        playerIds: ["r1"],
        status: "now_playing",
        createdAt: 1,
        startedAt: 1,
        finishedAt: null,
      },
      members: [
        {
          id: "r1",
          name: "Loopback Josh",
          songHash: "abc",
          instrument: "FiveFretGuitar",
          difficulty: "Expert",
          createdAt: 1,
          setId: "set-1",
          status: "playing",
          clientIp: "127.0.0.1",
        },
      ],
      scores: {
        bandScore: 120000,
        bandStars: 5,
        players: [
          {
            name: "guitar_01",
            instrument: "FiveFretGuitar",
            difficulty: "Expert",
            score: 120000,
            stars: 5,
            isBot: false,
          },
        ],
      },
    });
    dbMod.insertScoreRun({
      id: "22222222-2222-4222-8222-222222222222",
      createdAt: Date.now(),
      setId: "imported",
      songHash: "old",
      songName: "Old Song",
      songArtist: "Band",
      playerName: "Loopback Josh",
      instrument: "Vocals",
      difficulty: "Easy",
      score: 50000,
      stars: 4,
      bandScore: 50000,
      bandStars: 4,
      imported: true,
      percent: 0,
      notesHit: 0,
      totalNotes: 0,
      maxCombo: 0,
      spPhrasesHit: 0,
      spPhrasesTotal: 0,
      avgMultiplier: 0,
      isFullCombo: false,
      isHighScore: false,
      notesMissed: 0,
      overstrums: 0,
      ghostInputs: 0,
      spUses: 0,
      timeInSp: 0,
      enginePreset: "",
      modifiersUsed: false,
    });
    dbMod.updateSettings({ allowImportedScores: false });
    expect(scoresMod.scoresForPlayer("Loopback Josh")).toHaveLength(1);
    expect(scoresMod.buildLetterboard().overall[0]?.totalScore).toBe(120000);

    dbMod.updateSettings({ allowImportedScores: true });
    expect(scoresMod.scoresForPlayer("Loopback Josh")).toHaveLength(2);
    expect(scoresMod.buildLetterboard().overall[0]?.totalScore).toBe(170000);
  });
});
