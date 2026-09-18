import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data-test");
fs.mkdirSync(dataDir, { recursive: true });
process.env.YAQ_DATA_DIR = dataDir;

type DbMod = typeof import("../db.js");
type QueueMod = typeof import("./queue.js");

let dbMod: DbMod;
let queueMod: QueueMod;

beforeAll(async () => {
  dbMod = await import("../db.js");
  queueMod = await import("./queue.js");
});

function reset(): void {
  dbMod.initDb();
  dbMod.db.exec("DELETE FROM requests; DELETE FROM sets; DELETE FROM songs; DELETE FROM profiles;");
  dbMod.updateSettings({
    songQueueCap: 5,
    songQueueCapEnabled: true,
    instrumentCaps: {
      FiveFret: 8,
      Vocals: 8,
    },
  });
}

function seedSong(hash: string): void {
  dbMod.upsertSongs([
    {
      hash,
      name: hash,
      artist: "Artist",
      album: "",
      year: "",
      genre: "",
      charter: "",
      folderPath: `/tmp/${hash}`,
      instruments: ["FiveFretGuitar", "Vocals"],
      diffs: { FiveFretGuitar: 4, Vocals: 5 },
      source: "scan",
      verified: false,
    },
  ]);
}

function join(
  name: string,
  songHash: string,
  instrument: "FiveFretGuitar" | "Vocals" = "FiveFretGuitar",
) {
  return queueMod.joinQueue({
    name,
    songHash,
    instrument,
    difficulty: "Expert",
    clientIp: `10.0.0.${Math.abs(name.trim().toLowerCase().charCodeAt(0))}`,
  });
}

describe("queue pairing", () => {
  beforeEach(() => {
    reset();
  });

  it("pairs same-song players onto one on-deck set", () => {
    seedSong("abc123");

    join("A", "abc123", "FiveFretGuitar");
    join("B", "abc123", "Vocals");

    const onDeck = queueMod.getOnDeck();
    expect(onDeck).not.toBeNull();
    expect(onDeck!.playerIds.length).toBe(2);
    const preview = queueMod.buildQueuePreview(onDeck);
    expect(preview.players.map((p) => p.name).sort()).toEqual(["A", "B"]);
  });
});

describe("song master cap", () => {
  beforeEach(() => {
    reset();
    seedSong("s1");
    seedSong("s2");
    seedSong("s3");
    seedSong("s4");
  });

  it("counts distinct songs where the player is master", () => {
    join("Alex", "s1");
    join("Alex", "s2");
    join("alex", "s1", "Vocals");
    expect(queueMod.masterSongCount("Alex")).toBe(2);
    expect(queueMod.masterSongCount("alex")).toBe(2);
    expect(queueMod.isExistingSong("s1")).toBe(true);
    expect(queueMod.isExistingSong("s4")).toBe(false);
  });

  it("does not count apprentices toward the cap", () => {
    join("A", "s1");
    join("B", "s1", "Vocals");
    expect(queueMod.masterSongCount("A")).toBe(1);
    expect(queueMod.masterSongCount("B")).toBe(0);
    expect(queueMod.songMaster("s1")?.name).toBe("A");
  });

  it("rejects a new song when the player is at the cap", () => {
    dbMod.updateSettings({ songQueueCap: 2, songQueueCapEnabled: true });
    join("A", "s1");
    join("A", "s2");
    expect(() => join("A", "s3")).toThrow("Song cap reached");
    expect(queueMod.isExistingSong("s3")).toBe(false);
  });

  it("allows joining an existing song at the cap", () => {
    dbMod.updateSettings({ songQueueCap: 1, songQueueCapEnabled: true });
    join("A", "s1");
    join("C", "s2");
    const apprentice = join("A", "s2", "Vocals");
    expect(apprentice.songHash).toBe("s2");
    expect(queueMod.masterSongCount("A")).toBe(1);
    expect(queueMod.songMaster("s2")?.name).toBe("C");
  });

  it("skips the cap when it is disabled", () => {
    dbMod.updateSettings({ songQueueCap: 1, songQueueCapEnabled: false });
    join("A", "s1");
    join("A", "s2");
    join("A", "s3");
    expect(queueMod.masterSongCount("A")).toBe(3);
  });

  it("promotes the next player to master when the master cancels", () => {
    const a = join("A", "s1");
    join("B", "s1", "Vocals");
    expect(queueMod.masterSongCount("A")).toBe(1);
    expect(queueMod.masterSongCount("B")).toBe(0);
    queueMod.cancelRequest(a.id);
    expect(queueMod.masterSongCount("A")).toBe(0);
    expect(queueMod.masterSongCount("B")).toBe(1);
    expect(queueMod.songMaster("s1")?.name).toBe("B");
  });

  it("keeps a promoted master even if they are over the cap", () => {
    dbMod.updateSettings({ songQueueCap: 1, songQueueCapEnabled: true });
    join("B", "s2");
    const a = join("A", "s1");
    join("B", "s1", "Vocals");
    queueMod.cancelRequest(a.id);
    expect(queueMod.masterSongCount("B")).toBe(2);
    expect(() => join("B", "s3")).toThrow("Song cap reached");
    expect(join("B", "s1", "Vocals").songHash).toBe("s1");
  });

  it("removes the song when the last player leaves", () => {
    const a = join("A", "s1");
    expect(queueMod.getOnDeck()?.songHash).toBe("s1");
    queueMod.cancelRequest(a.id);
    expect(queueMod.isExistingSong("s1")).toBe(false);
    expect(queueMod.getOnDeck()?.songHash === "s1").toBe(false);
  });

  it("keeps the song and promotes the next player when someone leaves", () => {
    const a = join("A", "s1");
    const b = join("B", "s1", "Vocals");
    queueMod.cancelRequest(a.id);
    expect(queueMod.isExistingSong("s1")).toBe(true);
    expect(queueMod.songMaster("s1")?.id).toBe(b.id);
    const onDeck = queueMod.getOnDeck();
    expect(onDeck?.songHash).toBe("s1");
    expect(onDeck?.playerIds).toEqual([b.id]);
  });

  it("counts the song cap per device IP, not display name", () => {
    dbMod.updateSettings({ songQueueCap: 1, songQueueCapEnabled: true });
    queueMod.joinQueue({
      name: "Alex",
      songHash: "s1",
      instrument: "FiveFretGuitar",
      difficulty: "Expert",
      clientIp: "10.0.0.11",
    });
    queueMod.joinQueue({
      name: "Alex",
      songHash: "s2",
      instrument: "FiveFretGuitar",
      difficulty: "Expert",
      clientIp: "10.0.0.12",
    });
    expect(queueMod.masterSongCountForIp("10.0.0.11")).toBe(1);
    expect(queueMod.masterSongCountForIp("10.0.0.12")).toBe(1);
    expect(queueMod.buildGuestProfile("10.0.0.11").name).toBe("Alex");
    expect(queueMod.buildGuestProfile("10.0.0.11").started).toBe(1);
  });

  it("rejects leaving someone else's request", () => {
    const a = join("A", "s1");
    expect(() => queueMod.cancelRequest(a.id, "10.9.9.9")).toThrow(
      "Not your request",
    );
    expect(queueMod.isExistingSong("s1")).toBe(true);
  });

  it("lets the same device IP cancel its own request", () => {
    const a = join("A", "s1");
    queueMod.cancelRequest(a.id, a.clientIp);
    expect(queueMod.isExistingSong("s1")).toBe(false);
  });

  it("leaves the event by dropping this device's queued songs", () => {
    seedSong("s1");
    seedSong("s2");
    const a1 = join("A", "s1");
    join("A", "s2");
    join("B", "s1", "Vocals");
    const cancelled = queueMod.leaveEvent(a1.clientIp);
    expect(cancelled).toBe(2);
    expect(queueMod.buildGuestProfile(a1.clientIp).requestIds).toEqual([]);
    expect(queueMod.isExistingSong("s1")).toBe(true);
    expect(queueMod.isExistingSong("s2")).toBe(false);
  });

  it("fills an empty display name from the device IP", () => {
    const req = queueMod.joinQueue({
      name: "  ",
      songHash: "s1",
      instrument: "FiveFretGuitar",
      difficulty: "Expert",
      clientIp: "192.168.5.42",
    });
    expect(req.name).toBe("Guest 42");
    expect(req.clientIp).toBe("192.168.5.42");
    expect(queueMod.publicRequests()[0]).not.toHaveProperty("clientIp");
  });

  it("reuses the stored name for later joins from the same IP", () => {
    queueMod.joinQueue({
      name: "Alex",
      songHash: "s1",
      instrument: "FiveFretGuitar",
      difficulty: "Expert",
      clientIp: "10.0.0.9",
    });
    const second = queueMod.joinQueue({
      name: "",
      songHash: "s2",
      instrument: "Vocals",
      difficulty: "Hard",
      clientIp: "10.0.0.9",
    });
    expect(second.name).toBe("Alex");
    const profile = queueMod.buildGuestProfile("10.0.0.9");
    expect(profile.name).toBe("Alex");
    expect(profile.instrument).toBe("Vocals");
    expect(profile.difficulty).toBe("Hard");
    expect(profile.requestIds).toHaveLength(2);
  });

  it("auto-selects stored difficulty for an instrument", () => {
    dbMod.upsertProfile({
      ip: "10.0.0.21",
      name: "Sam",
      instrumentDefaults: { Vocals: "Easy", FiveFretGuitar: "ExpertPlus" },
    });
    const req = queueMod.joinQueue({
      name: "Sam",
      songHash: "s1",
      instrument: "Vocals",
      clientIp: "10.0.0.21",
    });
    expect(req.difficulty).toBe("Easy");
    expect(queueMod.buildGuestProfile("10.0.0.21").instrumentDefaults.Vocals).toBe(
      "Easy",
    );
  });
});
