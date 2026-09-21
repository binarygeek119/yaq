import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import ini from "ini";
import { clearScanSongs, getSettings, listSongs, upsertSongs } from "../db.js";
import type { SongRecord } from "../types.js";
import {
  readYargSongFields,
  yargSetlistSongFiles,
  yargSongFolderRoots,
} from "./yargSong.js";

const INSTRUMENT_KEYS: Record<string, string> = {
  diff_guitar: "FiveFretGuitar",
  diff_bass: "FiveFretBass",
  diff_rhythm: "FiveFretRhythm",
  diff_guitar_coop: "FiveFretCoop",
  diff_guitarcoop: "FiveFretCoop",
  diff_keys: "Keys",
  diff_guitarghl: "SixFretGuitar",
  diff_bassghl: "SixFretBass",
  diff_rhythm_ghl: "SixFretRhythm",
  diff_guitar_coop_ghl: "SixFretCoop",
  diff_drums: "FourLaneDrums",
  diff_drums_real: "ProDrums",
  diff_elite_drums: "EliteDrums",
  diff_guitar_real: "ProGuitar_17",
  diff_guitar_real_22: "ProGuitar_22",
  diff_bass_real: "ProBass_17",
  diff_bass_real_22: "ProBass_22",
  diff_keys_real: "ProKeys",
  diff_vocals: "Vocals",
  diff_vocals_harm: "Harmony",
  diff_harmony: "Harmony",
  diff_band: "Band",
};

function walkSongInis(root: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }

  const hasIni = entries.some(
    (e) => e.isFile() && e.name.toLowerCase() === "song.ini",
  );
  if (hasIni) {
    out.push(path.join(root, "song.ini"));
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    walkSongInis(path.join(root, entry.name), out);
  }
}

function iniField(
  song: Record<string, string | number | undefined>,
  key: string,
): string | number | undefined {
  if (song[key] !== undefined) return song[key];
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(song)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

export function songMatchKey(artist: string, name: string): string {
  const norm = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return `${norm(artist)}\n${norm(name)}`;
}

export function diffsFromIniRecord(
  song: Record<string, string | number | undefined>,
): Record<string, number> {
  const diffs: Record<string, number> = {};
  for (const [key, instrument] of Object.entries(INSTRUMENT_KEYS)) {
    const value = iniField(song, key);
    if (value === undefined) continue;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) continue;
    diffs[instrument] = Math.min(6, Math.max(0, Math.floor(n)));
  }
  return diffs;
}

function iniString(
  song: Record<string, string | number | undefined>,
  ...keys: string[]
): string {
  for (const key of keys) {
    const value = iniField(song, key);
    if (value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function iniNumber(
  song: Record<string, string | number | undefined>,
  ...keys: string[]
): number {
  for (const key of keys) {
    const value = iniField(song, key);
    if (value === undefined) continue;
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return 0;
}

function findCoverPath(folderPath: string): string {
  const names = [
    "album.png",
    "album.jpg",
    "album.jpeg",
    "cover.png",
    "cover.jpg",
    "folder.png",
    "folder.jpg",
  ];
  for (const name of names) {
    const filePath = path.join(folderPath, name);
    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return filePath;
    } catch {
      // ignore unreadable cover files
    }
  }
  return "";
}

function parseSongIni(iniPath: string): SongRecord | null {
  try {
    const raw = fs.readFileSync(iniPath, "utf8");
    const parsed = ini.parse(raw);
    const song = (parsed.song ?? parsed.Song ?? parsed) as Record<
      string,
      string | number | undefined
    >;
    const folderPath = path.dirname(iniPath);
    const name = String(song.name ?? song.Name ?? path.basename(folderPath));
    const artist = String(song.artist ?? song.Artist ?? "Unknown Artist");
    const album = String(song.album ?? song.Album ?? "");
    const year = String(song.year ?? song.Year ?? "");
    const genre = String(song.genre ?? song.Genre ?? "");
    const charter = String(song.charter ?? song.Charter ?? song.frets ?? "");
    const diffs = diffsFromIniRecord(song);
    const instruments = Object.keys(diffs);

    const hashSource = `${folderPath}|${name}|${artist}|${album}|${charter}`;
    const hash = crypto.createHash("sha1").update(hashSource).digest("hex");
    const previewSeconds = iniNumber(song, "preview_start_seconds", "previewStart");
    const previewStart =
      iniNumber(song, "preview_start_time", "preview_start") ||
      (previewSeconds > 0 ? previewSeconds * 1000 : 0);

    return {
      hash,
      name,
      artist,
      album,
      year,
      genre,
      charter,
      folderPath,
      instruments,
      diffs,
      source: "scan",
      verified: false,
      playlist: iniString(song, "playlist"),
      pack: iniString(song, "source"),
      icon: iniString(song, "icon"),
      loadingPhrase: iniString(song, "loading_phrase"),
      previewStart,
      songLength: iniNumber(song, "song_length"),
      albumTrack: iniNumber(song, "album_track"),
      playlistTrack: iniNumber(song, "playlist_track"),
      tags: iniString(song, "tags", "tag"),
      coverPath: findCoverPath(folderPath),
      video: iniString(song, "video"),
      subgenre: iniString(song, "subgenre", "sub_genre"),
    };
  } catch {
    return null;
  }
}

export function scanSongFolders(folders?: string[]): SongRecord[] {
  const settings = getSettings();
  const roots = folders ?? settings.songFolders;
  const iniFiles: string[] = [];
  for (const root of roots) {
    if (!root || !fs.existsSync(root)) continue;
    walkSongInis(root, iniFiles);
  }

  const songs: SongRecord[] = [];
  for (const iniPath of iniFiles) {
    const song = parseSongIni(iniPath);
    if (song) songs.push(song);
  }

  clearScanSongs();
  upsertSongs(songs);
  return listSongs();
}

export function searchSongs(query: string): SongRecord[] {
  const q = query.trim().toLowerCase();
  const songs = listSongs();
  if (!q) return songs;
  return songs.filter((song) => {
    const hay = `${song.name} ${song.artist} ${song.album} ${song.genre} ${song.charter}`.toLowerCase();
    return hay.includes(q);
  });
}

export function normalizeDiffs(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const diffs: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) diffs[key] = Math.min(6, Math.floor(n));
  }
  return diffs;
}

/** Pull 0–6 intensities from any shape YARG/scan already sent. Never invent Easy–Expert. */
export function diffsFromSyncPayload(song: Record<string, unknown>): Record<string, number> {
  const diffs: Record<string, number> = {
    ...normalizeDiffs(song.diffs),
    ...normalizeDiffs(song.difficulties),
    ...normalizeDiffs(song.parts),
  };
  for (const [key, instrument] of Object.entries(INSTRUMENT_KEYS)) {
    const n = Number(song[key]);
    if (Number.isFinite(n) && n >= 0) {
      diffs[instrument] = Math.min(6, Math.floor(n));
    }
  }
  if (Array.isArray(song.instruments)) {
    for (const item of song.instruments) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const name = String(row.name ?? row.instrument ?? "");
      const n = Number(row.diff ?? row.difficulty ?? row.intensity);
      if (name && Number.isFinite(n) && n >= 0) {
        diffs[name] = Math.min(6, Math.floor(n));
      }
    }
  }
  return diffs;
}

export function parseInstrumentList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const names: string[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.trim()) {
      names.push(item);
      continue;
    }
    if (item && typeof item === "object") {
      const row = item as Record<string, unknown>;
      const name = String(row.name ?? row.instrument ?? "").trim();
      if (name) names.push(name);
    }
  }
  return names;
}

function isSongDirectory(folderPath: string): boolean {
  if (!folderPath || !path.isAbsolute(folderPath)) return false;
  try {
    return fs.statSync(folderPath).isDirectory();
  } catch {
    return false;
  }
}

type DiffIndexEntry = {
  diffs: Record<string, number>;
  folderPath?: string;
};

function buildDiffIndex(
  songFolders: string[],
  yargSongFiles: string[],
): Map<string, DiffIndexEntry> {
  const index = new Map<string, DiffIndexEntry>();
  const add = (
    artist: string,
    name: string,
    diffs: Record<string, number>,
    folderPath?: string,
  ) => {
    if (Object.keys(diffs).length === 0) return;
    const key = songMatchKey(artist, name);
    if (!key.trim() || index.has(key)) return;
    index.set(key, { diffs, folderPath });
  };

  const iniFiles: string[] = [];
  for (const root of songFolders) {
    walkSongInis(root, iniFiles);
  }
  for (const iniPath of iniFiles) {
    const parsed = parseSongIni(iniPath);
    if (parsed) add(parsed.artist, parsed.name, parsed.diffs, parsed.folderPath);
  }

  for (const file of yargSongFiles) {
    const fields = readYargSongFields(file);
    if (!fields) continue;
    add(
      fields.artist ?? fields.Artist ?? "",
      fields.name ?? fields.Name ?? "",
      diffsFromIniRecord(fields),
    );
  }
  return index;
}

/** Fill empty diffs from song.ini / official setlist charts next to YARG. */
export function backfillSongDiffs(options?: {
  songFolders?: string[];
  yargSongFiles?: string[];
}): number {
  const songs = listSongs();
  const missing = songs.filter((song) => Object.keys(song.diffs).length === 0);
  if (missing.length === 0) return 0;

  const index = buildDiffIndex(
    options?.songFolders ?? yargSongFolderRoots(),
    options?.yargSongFiles ?? yargSetlistSongFiles(),
  );
  const updated: SongRecord[] = [];
  for (const song of missing) {
    let diffs: Record<string, number> | null = null;
    let folderPath = song.folderPath;
    if (isSongDirectory(song.folderPath)) {
      const iniPath = path.join(song.folderPath, "song.ini");
      if (fs.existsSync(iniPath)) {
        const parsed = parseSongIni(iniPath);
        if (parsed && Object.keys(parsed.diffs).length > 0) {
          diffs = parsed.diffs;
        }
      }
    }
    if (!diffs) {
      const hit = index.get(songMatchKey(song.artist, song.name));
      if (hit) {
        diffs = hit.diffs;
        if (hit.folderPath && isSongDirectory(hit.folderPath)) {
          folderPath = hit.folderPath;
        }
      }
    }
    if (!diffs) continue;
    updated.push({
      ...song,
      diffs,
      folderPath,
    });
  }
  if (updated.length > 0) upsertSongs(updated);
  return updated.length;
}
