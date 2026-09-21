import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "yaq-cover-"));
process.env.YAQ_DATA_DIR = dataDir;

describe("resolveCoverPath", () => {
  let resolveCoverPath: (typeof import("./cover.js"))["resolveCoverPath"];
  let initDb: (typeof import("../db.js"))["initDb"];
  let upsertSongs: (typeof import("../db.js"))["upsertSongs"];
  let db: (typeof import("../db.js"))["db"];

  beforeAll(async () => {
    const dbMod = await import("../db.js");
    const coverMod = await import("./cover.js");
    initDb = dbMod.initDb;
    upsertSongs = dbMod.upsertSongs;
    db = dbMod.db;
    resolveCoverPath = coverMod.resolveCoverPath;
  });

  beforeEach(() => {
    initDb();
    db.exec("DELETE FROM songs;");
  });

  function insertSong(hash: string, folderPath: string): void {
    upsertSongs([
      {
        hash,
        name: "Half Measures",
        artist: "Aaron Musslewhite",
        album: "",
        year: "",
        genre: "",
        charter: "",
        folderPath,
        instruments: ["FiveFretGuitar"],
        diffs: {},
        source: "yarg",
        verified: true,
      },
    ]);
  }

  it("finds album.png from song.ini cover=", () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "yaq-art-"));
    const art = path.join(folder, "front.jpg");
    fs.writeFileSync(art, "jpeg");
    fs.writeFileSync(path.join(folder, "song.ini"), "[song]\ncover = front.jpg\n");
    insertSong("aaa", folder);
    expect(resolveCoverPath("aaa")).toBe(art);
  });

  it("finds Cover.JPG when album.png is missing", () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "yaq-art-"));
    const art = path.join(folder, "Cover.JPG");
    fs.writeFileSync(art, "jpeg");
    insertSong("bbb", folder);
    expect(resolveCoverPath("bbb")).toBe(art);
  });

  it("finds folder.png", () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "yaq-art-"));
    const art = path.join(folder, "folder.png");
    fs.writeFileSync(art, "png");
    insertSong("ccc", folder);
    expect(resolveCoverPath("ccc")).toBe(art);
  });

  it("returns null without a folder path", () => {
    insertSong("ddd", "");
    expect(resolveCoverPath("ddd")).toBeNull();
  });
});
