import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "yaq-lib-"));
process.env.YAQ_DATA_DIR = dataDir;

describe("song.ini diffs", () => {
  let scanSongFolders: (typeof import("./library.js"))["scanSongFolders"];
  let backfillSongDiffs: (typeof import("./library.js"))["backfillSongDiffs"];
  let initDb: (typeof import("../db.js"))["initDb"];
  let listSongs: (typeof import("../db.js"))["listSongs"];
  let upsertSongs: (typeof import("../db.js"))["upsertSongs"];
  let db: (typeof import("../db.js"))["db"];

  beforeAll(async () => {
    const dbMod = await import("../db.js");
    const lib = await import("./library.js");
    initDb = dbMod.initDb;
    listSongs = dbMod.listSongs;
    upsertSongs = dbMod.upsertSongs;
    db = dbMod.db;
    scanSongFolders = lib.scanSongFolders;
    backfillSongDiffs = lib.backfillSongDiffs;
  });

  beforeEach(() => {
    initDb();
    db.exec("DELETE FROM songs;");
  });

  it("stores 0-6 intensities from song.ini", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "yaq-ini-"));
    fs.writeFileSync(
      path.join(root, "song.ini"),
      [
        "[Song]",
        "name = Diff Song",
        "artist = Chart Band",
        "genre = Metal",
        "diff_guitar = 4",
        "diff_vocals = 5",
        "diff_bass = -1",
      ].join("\n"),
    );
    scanSongFolders([root]);
    const song = listSongs().find((s) => s.name === "Diff Song");
    expect(song).toBeTruthy();
    expect(song!.instruments).toEqual(["FiveFretGuitar", "Vocals"]);
    expect(song!.diffs).toEqual({ FiveFretGuitar: 4, Vocals: 5 });
  });

  it("backfills diffs for rows that only have a folder path", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "yaq-bf-"));
    fs.writeFileSync(
      path.join(root, "song.ini"),
      "[Song]\nname = Old Row\nartist = Band\ndiff_drums = 3\n",
    );
    upsertSongs([
      {
        hash: "old-row",
        name: "Old Row",
        artist: "Band",
        album: "",
        year: "",
        genre: "",
        charter: "",
        folderPath: root,
        instruments: ["FourLaneDrums"],
        diffs: {},
        source: "yarg",
        verified: true,
      },
    ]);
    expect(backfillSongDiffs()).toBe(1);
    expect(listSongs().find((s) => s.hash === "old-row")?.diffs).toEqual({
      FourLaneDrums: 3,
    });
  });
});
