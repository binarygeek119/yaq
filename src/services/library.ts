import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import ini from "ini";
import { clearScanSongs, getSettings, listSongs, upsertSongs } from "../db.js";
import type { SongRecord } from "../types.js";

const INSTRUMENT_KEYS: Record<string, string> = {
  diff_guitar: "FiveFretGuitar",
  diff_bass: "FiveFretBass",
  diff_rhythm: "FiveFretRhythm",
  diff_guitarcoop: "FiveFretCoop",
  diff_keys: "Keys",
  diff_guitarghl: "SixFretGuitar",
  diff_bassghl: "SixFretBass",
  diff_drums: "FourLaneDrums",
  diff_drums_real: "ProDrums",
  diff_guitar_real: "ProGuitar_17",
  diff_bass_real: "ProBass_17",
  diff_keys_real: "ProKeys",
  diff_vocals: "Vocals",
  diff_harmony: "Harmony",
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

    const instruments: string[] = [];
    for (const [key, instrument] of Object.entries(INSTRUMENT_KEYS)) {
      const value = song[key];
      if (value !== undefined && Number(value) >= 0) {
        instruments.push(instrument);
      }
    }

    const hashSource = `${folderPath}|${name}|${artist}|${album}|${charter}`;
    const hash = crypto.createHash("sha1").update(hashSource).digest("hex");

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
      source: "scan",
      verified: false,
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
