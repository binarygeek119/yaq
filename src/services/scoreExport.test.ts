import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "yaq-export-"));
process.env.YAQ_DATA_DIR = dataDir;

type DbMod = typeof import("../db.js");
type ExportMod = typeof import("./scoreExport.js");
type EventMod = typeof import("./eventIdentity.js");

let dbMod: DbMod;
let exportMod: ExportMod;
let eventMod: EventMod;

const song = (hash: string, name: string) => ({
  hash,
  name,
  artist: "Band",
  album: "",
  year: "",
  genre: "",
  charter: "",
  folderPath: "",
  instruments: ["FiveFretGuitar"],
  diffs: {},
  source: "yarg" as const,
  verified: true,
});

beforeAll(async () => {
  dbMod = await import("../db.js");
  eventMod = await import("./eventIdentity.js");
  exportMod = await import("./scoreExport.js");
});

describe("event identity and signed score export", () => {
  beforeEach(() => {
    dbMod.initDb();
    dbMod.db.exec("DELETE FROM songs; DELETE FROM scores;");
    dbMod.updateSettings({ eventName: "Friday Night" });
    dbMod.upsertSongs([song("aaa", "One"), song("bbb", "Two")]);
  });

  it("hashes event name plus the YARG song list", () => {
    const first = eventMod.getEventIdentity();
    expect(first.name).toBe("Friday Night");
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.songCount).toBe(2);

    dbMod.updateSettings({ eventName: "Saturday Night" });
    const renamed = eventMod.getEventIdentity();
    expect(renamed.hash).not.toBe(first.hash);

    dbMod.updateSettings({ eventName: "Friday Night" });
    dbMod.upsertSongs([song("ccc", "Three")]);
    const moreSongs = eventMod.getEventIdentity();
    expect(moreSongs.hash).not.toBe(first.hash);
    expect(moreSongs.songCount).toBe(3);
  });

  it("assigns a random name when none is set", () => {
    dbMod.updateSettings({ eventName: "" });
    const identity = eventMod.getEventIdentity();
    expect(identity.name).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);
    expect(dbMod.getSettings().eventName).toBe(identity.name);
  });

  it("round-trips scores and rejects edited files", () => {
    const inserted = dbMod.insertScoreRun({
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: Date.now(),
      setId: "set-1",
      songHash: "aaa",
      songName: "One",
      songArtist: "Band",
      playerName: "Loopback Josh",
      instrument: "FiveFretGuitar",
      difficulty: "Expert",
      score: 120000,
      stars: 5,
      bandScore: 120000,
      bandStars: 5,
      imported: false,
      percent: 1,
      notesHit: 100,
      totalNotes: 100,
      maxCombo: 100,
      spPhrasesHit: 4,
      spPhrasesTotal: 4,
      avgMultiplier: 4,
      isFullCombo: true,
      isHighScore: true,
      notesMissed: 0,
      overstrums: 0,
      ghostInputs: 0,
      spUses: 1,
      timeInSp: 25,
      enginePreset: "Default Engine",
      modifiersUsed: false,
    });
    expect(inserted).toBe(true);

    const { filename, file } = exportMod.buildScoreExport("Loopback Josh");
    expect(filename).toMatch(/^yaq-scores-friday-night-\d{4}-\d{2}-\d{2}\.json$/);
    expect(file.payload.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(file.payload.eventName).toBe("Friday Night");
    expect(file.payload.runs).toHaveLength(1);

    dbMod.db.exec("DELETE FROM scores;");
    const imported = exportMod.importScoreExport(
      "Loopback Josh",
      JSON.parse(JSON.stringify(file)),
    );
    expect(imported.imported).toBe(1);
    expect(imported.eventName).toBe("Friday Night");
    expect(dbMod.listScoreRuns()).toHaveLength(1);

    const again = exportMod.importScoreExport("Loopback Josh", file);
    expect(again.imported).toBe(0);
    expect(again.skipped).toBe(1);

    const tampered = structuredClone(file);
    tampered.payload.runs[0].score = 999999;
    expect(() => exportMod.importScoreExport("Loopback Josh", tampered)).toThrow(
      /edited or is not a YAQ score export/,
    );
  });
});
