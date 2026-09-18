import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "yaq-lib-"));
process.env.YAQ_DATA_DIR = dataDir;

describe("song.ini diffs", () => {
  let scanSongFolders: (typeof import("./library.js"))["scanSongFolders"];
  let backfillSongDiffs: (typeof import("./library.js"))["backfillSongDiffs"];
  let diffsFromIniRecord: (typeof import("./library.js"))["diffsFromIniRecord"];
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
    diffsFromIniRecord = lib.diffsFromIniRecord;
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
    expect(backfillSongDiffs({ songFolders: [], yargSongFiles: [] })).toBe(1);
    expect(listSongs().find((s) => s.hash === "old-row")?.diffs).toEqual({
      FourLaneDrums: 3,
    });
  });

  it("reads band and coop intensities from song.ini keys", () => {
    expect(
      diffsFromIniRecord({
        diff_guitar: 4,
        diff_guitar_coop: 2,
        diff_band: 5,
        diff_drums: -1,
      }),
    ).toEqual({
      FiveFretGuitar: 4,
      FiveFretCoop: 2,
      Band: 5,
    });
  });

  it("backfills diffs by artist and title when folderPath is not a directory", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "yaq-match-"));
    fs.writeFileSync(
      path.join(root, "song.ini"),
      [
        "[Song]",
        "name = All of a Sudden",
        "artist = Adamic",
        "diff_guitar = 3",
        "diff_drums = 4",
        "diff_band = 3",
        "diff_vocals = 1",
      ].join("\n"),
    );
    upsertSongs([
      {
        hash: "adamic-sudden",
        name: "All of a Sudden",
        artist: "Adamic",
        album: "",
        year: "",
        genre: "",
        charter: "",
        folderPath: "Nashville, TN, USA",
        instruments: ["FiveFretGuitar", "FourLaneDrums", "Vocals", "Band"],
        diffs: {},
        source: "yarg",
        verified: true,
      },
    ]);
    expect(
      backfillSongDiffs({ songFolders: [root], yargSongFiles: [] }),
    ).toBe(1);
    expect(listSongs().find((s) => s.hash === "adamic-sudden")?.diffs).toEqual({
      FiveFretGuitar: 3,
      FourLaneDrums: 4,
      Band: 3,
      Vocals: 1,
    });
  });
});
