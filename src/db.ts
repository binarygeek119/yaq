import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { dataRoot } from "./paths.js";
import type {
  AppSettings,
  Difficulty,
  EventFlags,
  Instrument,
  InstrumentCaps,
  PlaySet,
  QueueRequest,
  SongRecord,
  YargPlacement,
} from "./types.js";
import {
  DEFAULT_EVENT_FLAGS,
  DEFAULT_SONG_QUEUE_CAP,
  MAX_SONG_QUEUE_CAP,
  MIN_SONG_QUEUE_CAP,
} from "./types.js";
import {
  mergeInstrumentDefaults,
  parseInstrumentDefaults,
  type InstrumentDefaults,
} from "./services/profileFields.js";
import { avatarPath } from "./services/profileMedia.js";

const dataDir = dataRoot();
const dbPath = path.join(dataDir, "yaq.sqlite");

fs.mkdirSync(dataDir, { recursive: true });

export const db: Database.Database = new Database(dbPath);
db.pragma("journal_mode = WAL");

const DEFAULT_CAPS: InstrumentCaps = {
  FiveFret: 2,
  SixFret: 0,
  ProGuitar: 0,
  Keys: 1,
  ProKeys: 1,
  FourLaneDrums: 1,
  ProDrums: 1,
  FiveLaneDrums: 0,
  EliteDrums: 0,
  Vocals: 2,
};

export function initDb(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS songs (
      hash TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      artist TEXT NOT NULL,
      album TEXT NOT NULL,
      year TEXT NOT NULL,
      genre TEXT NOT NULL,
      charter TEXT NOT NULL,
      folder_path TEXT NOT NULL,
      instruments TEXT NOT NULL,
      source TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      song_hash TEXT NOT NULL,
      instrument TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      set_id TEXT,
      status TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sets (
      id TEXT PRIMARY KEY,
      song_hash TEXT NOT NULL,
      song_name TEXT NOT NULL,
      song_artist TEXT NOT NULL,
      player_ids TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      finished_at INTEGER
    );
  `);

  ensureDefaultSettings();
  ensureSongDiffsColumn();
  ensureRequestClientIpColumn();
  ensureProfilesTable();
}

function ensureSongDiffsColumn(): void {
  const cols = db.prepare("PRAGMA table_info(songs)").all() as Array<{
    name: string;
  }>;
  if (!cols.some((col) => col.name === "diffs")) {
    db.exec("ALTER TABLE songs ADD COLUMN diffs TEXT NOT NULL DEFAULT '{}'");
  }
}

function ensureRequestClientIpColumn(): void {
  const cols = db.prepare("PRAGMA table_info(requests)").all() as Array<{
    name: string;
  }>;
  if (!cols.some((col) => col.name === "client_ip")) {
    db.exec("ALTER TABLE requests ADD COLUMN client_ip TEXT NOT NULL DEFAULT ''");
  }
}

function ensureProfilesTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      ip TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      instrument TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      instrument_defaults TEXT NOT NULL DEFAULT '{}',
      photo_ext TEXT NOT NULL DEFAULT '',
      photo_rev INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
  `);
  const cols = db.prepare("PRAGMA table_info(profiles)").all() as Array<{
    name: string;
  }>;
  if (!cols.some((col) => col.name === "instrument_defaults")) {
    db.exec(
      "ALTER TABLE profiles ADD COLUMN instrument_defaults TEXT NOT NULL DEFAULT '{}'",
    );
  }
  if (!cols.some((col) => col.name === "photo_ext")) {
    db.exec("ALTER TABLE profiles ADD COLUMN photo_ext TEXT NOT NULL DEFAULT ''");
  }
  if (!cols.some((col) => col.name === "photo_rev")) {
    db.exec("ALTER TABLE profiles ADD COLUMN photo_rev INTEGER NOT NULL DEFAULT 0");
  }
}

function ensureDefaultSettings(): void {
  const set = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING",
  );

  set.run("adminPassword", "");
  set.run("songFolders", JSON.stringify([]));
  set.run("instrumentCaps", JSON.stringify(DEFAULT_CAPS));
  set.run("songQueueCap", String(DEFAULT_SONG_QUEUE_CAP));
  set.run("songQueueCapEnabled", "true");
  set.run("hostPort", "3000");
  set.run("bridgePort", "8765");
  set.run("yaqPublicUrl", "");
  set.run("yargExecutable", "");
  set.run("yargPlacement", "");
  set.run("simulatorEnabled", "false");
  set.run("eventFlags", JSON.stringify(DEFAULT_EVENT_FLAGS));
}

function parseYargPlacement(raw: string): YargPlacement | "" {
  if (raw === "same-machine" || raw === "second-machine") return raw;
  return "";
}

export function parseSongQueueCap(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return DEFAULT_SONG_QUEUE_CAP;
  return Math.min(MAX_SONG_QUEUE_CAP, Math.max(MIN_SONG_QUEUE_CAP, n));
}

function parseSongQueueCapEnabled(raw: string): boolean {
  return raw !== "false";
}

function getSetting(key: string): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? "";
}

function setSetting(key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

export function getSettings(): AppSettings {
  let eventFlags: EventFlags = { ...DEFAULT_EVENT_FLAGS };
  try {
    const raw = getSetting("eventFlags");
    if (raw) {
      eventFlags = { ...DEFAULT_EVENT_FLAGS, ...(JSON.parse(raw) as Partial<EventFlags>) };
    }
  } catch {
    eventFlags = { ...DEFAULT_EVENT_FLAGS };
  }

  return {
    adminPassword: getSetting("adminPassword"),
    songFolders: JSON.parse(getSetting("songFolders") || "[]") as string[],
    instrumentCaps: JSON.parse(
      getSetting("instrumentCaps") || JSON.stringify(DEFAULT_CAPS),
    ) as InstrumentCaps,
    songQueueCap: parseSongQueueCap(
      getSetting("songQueueCap") || DEFAULT_SONG_QUEUE_CAP,
    ),
    songQueueCapEnabled: parseSongQueueCapEnabled(
      getSetting("songQueueCapEnabled") || "true",
    ),
    hostPort: Number(getSetting("hostPort") || 3000),
    bridgePort: Number(getSetting("bridgePort") || 8765),
    yaqPublicUrl: getSetting("yaqPublicUrl"),
    yargExecutable: getSetting("yargExecutable"),
    yargPlacement: parseYargPlacement(getSetting("yargPlacement")),
    // Missing key → false (real YARG is preferred; enable simulator explicitly).
    simulatorEnabled: getSetting("simulatorEnabled") === "true",
    eventFlags,
  };
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const next = {
    ...current,
    ...partial,
    eventFlags: {
      ...current.eventFlags,
      ...(partial.eventFlags ?? {}),
    },
  };
  setSetting("adminPassword", next.adminPassword);
  setSetting("songFolders", JSON.stringify(next.songFolders));
  setSetting("instrumentCaps", JSON.stringify(next.instrumentCaps));
  setSetting("songQueueCap", String(parseSongQueueCap(next.songQueueCap)));
  setSetting("songQueueCapEnabled", String(Boolean(next.songQueueCapEnabled)));
  setSetting("hostPort", String(next.hostPort));
  setSetting("bridgePort", String(next.bridgePort));
  setSetting("yaqPublicUrl", next.yaqPublicUrl);
  setSetting("yargExecutable", next.yargExecutable);
  setSetting("yargPlacement", next.yargPlacement);
  setSetting("simulatorEnabled", String(next.simulatorEnabled));
  setSetting("eventFlags", JSON.stringify(next.eventFlags));
  return next;
}

export function upsertSongs(songs: SongRecord[]): void {
  const stmt = db.prepare(`
    INSERT INTO songs (hash, name, artist, album, year, genre, charter, folder_path, instruments, diffs, source, verified)
    VALUES (@hash, @name, @artist, @album, @year, @genre, @charter, @folderPath, @instruments, @diffs, @source, @verified)
    ON CONFLICT(hash) DO UPDATE SET
      name = excluded.name,
      artist = excluded.artist,
      album = excluded.album,
      year = excluded.year,
      genre = excluded.genre,
      charter = excluded.charter,
      folder_path = excluded.folder_path,
      instruments = excluded.instruments,
      diffs = CASE
        WHEN excluded.diffs = '{}' THEN songs.diffs
        ELSE excluded.diffs
      END,
      source = excluded.source,
      verified = MAX(songs.verified, excluded.verified)
  `);

  const tx = db.transaction((rows: SongRecord[]) => {
    for (const song of rows) {
      stmt.run({
        hash: song.hash,
        name: song.name,
        artist: song.artist,
        album: song.album,
        year: song.year,
        genre: song.genre,
        charter: song.charter,
        folderPath: song.folderPath,
        instruments: JSON.stringify(song.instruments),
        diffs: JSON.stringify(song.diffs ?? {}),
        source: song.source,
        verified: song.verified ? 1 : 0,
      });
    }
  });
  tx(songs);
}

export function clearScanSongs(): void {
  db.prepare("DELETE FROM songs WHERE source = 'scan' AND verified = 0").run();
}

export function listSongs(): SongRecord[] {
  const rows = db
    .prepare(
      "SELECT hash, name, artist, album, year, genre, charter, folder_path as folderPath, instruments, diffs, source, verified FROM songs ORDER BY artist COLLATE NOCASE, name COLLATE NOCASE",
    )
    .all() as Array<
    Omit<SongRecord, "instruments" | "diffs" | "verified"> & {
      instruments: string;
      diffs: string;
      verified: number;
    }
  >;
  return rows.map((row) => ({
    ...row,
    instruments: JSON.parse(row.instruments) as string[],
    diffs: parseDiffs(row.diffs),
    verified: Boolean(row.verified),
  }));
}

function parseDiffs(raw: string | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const diffs: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) diffs[key] = Math.min(6, Math.floor(n));
    }
    return diffs;
  } catch {
    return {};
  }
}

export function getSong(hash: string): SongRecord | null {
  return listSongs().find((s) => s.hash === hash) ?? null;
}

export function listRequests(): QueueRequest[] {
  const rows = db
    .prepare(
      "SELECT id, name, song_hash as songHash, instrument, difficulty, created_at as createdAt, set_id as setId, status, client_ip as clientIp FROM requests ORDER BY created_at ASC",
    )
    .all() as QueueRequest[];
  return rows.map((row) => ({
    ...row,
    clientIp: row.clientIp ?? "",
  }));
}

export function insertRequest(request: QueueRequest): void {
  db.prepare(
    `INSERT INTO requests (id, name, song_hash, instrument, difficulty, created_at, set_id, status, client_ip)
     VALUES (@id, @name, @songHash, @instrument, @difficulty, @createdAt, @setId, @status, @clientIp)`,
  ).run(request);
}

export function updateRequest(
  id: string,
  patch: Partial<Pick<QueueRequest, "setId" | "status">>,
): void {
  const current = listRequests().find((r) => r.id === id);
  if (!current) return;
  const next = { ...current, ...patch };
  db.prepare(
    "UPDATE requests SET set_id = ?, status = ? WHERE id = ?",
  ).run(next.setId, next.status, id);
}

export function listSets(): PlaySet[] {
  const rows = db
    .prepare(
      "SELECT id, song_hash as songHash, song_name as songName, song_artist as songArtist, player_ids as playerIds, status, created_at as createdAt, started_at as startedAt, finished_at as finishedAt FROM sets ORDER BY created_at ASC",
    )
    .all() as Array<Omit<PlaySet, "playerIds"> & { playerIds: string }>;
  return rows.map((row) => ({
    ...row,
    playerIds: JSON.parse(row.playerIds) as string[],
  }));
}

export function insertSet(set: PlaySet): void {
  db.prepare(
    `INSERT INTO sets (id, song_hash, song_name, song_artist, player_ids, status, created_at, started_at, finished_at)
     VALUES (@id, @songHash, @songName, @songArtist, @playerIds, @status, @createdAt, @startedAt, @finishedAt)`,
  ).run({
    ...set,
    playerIds: JSON.stringify(set.playerIds),
  });
}

export function updateSet(
  id: string,
  patch: Partial<Pick<PlaySet, "status" | "startedAt" | "finishedAt" | "playerIds">>,
): void {
  const current = listSets().find((s) => s.id === id);
  if (!current) return;
  const next = { ...current, ...patch };
  db.prepare(
    "UPDATE sets SET status = ?, started_at = ?, finished_at = ?, player_ids = ? WHERE id = ?",
  ).run(
    next.status,
    next.startedAt,
    next.finishedAt,
    JSON.stringify(next.playerIds),
    id,
  );
}

const DEFAULT_PROFILE_INSTRUMENT: Instrument = "FiveFretGuitar";
const DEFAULT_PROFILE_DIFFICULTY: Difficulty = "Expert";

export type StoredProfile = {
  ip: string;
  name: string;
  instrument: Instrument;
  difficulty: Difficulty;
  instrumentDefaults: InstrumentDefaults;
  photoExt: string;
  photoRev: number;
};

export function getProfile(ip: string): StoredProfile | null {
  if (!ip) return null;
  const row = db
    .prepare(
      `SELECT ip, name, instrument, difficulty,
              instrument_defaults as instrumentDefaults,
              photo_ext as photoExt, photo_rev as photoRev
       FROM profiles WHERE ip = ?`,
    )
    .get(ip) as
    | {
        ip: string;
        name: string;
        instrument: Instrument;
        difficulty: Difficulty;
        instrumentDefaults: string;
        photoExt: string;
        photoRev: number;
      }
    | undefined;
  if (!row) return null;
  return {
    ip: row.ip,
    name: row.name,
    instrument: row.instrument,
    difficulty: row.difficulty,
    instrumentDefaults: parseInstrumentDefaults(row.instrumentDefaults),
    photoExt: row.photoExt ?? "",
    photoRev: Number(row.photoRev) || 0,
  };
}

export function profilePhotoPath(ip: string): string | null {
  const stored = getProfile(ip);
  if (!stored?.photoExt) return null;
  return avatarPath(ip, stored.photoExt);
}

export function upsertProfile(input: {
  ip: string;
  name?: string;
  instrument?: Instrument;
  difficulty?: Difficulty;
  instrumentDefaults?: InstrumentDefaults;
  photoExt?: string;
  bumpPhotoRev?: boolean;
}): StoredProfile {
  const current = getProfile(input.ip);
  const photoExt =
    input.photoExt !== undefined ? input.photoExt : (current?.photoExt ?? "");
  const photoRev = input.bumpPhotoRev
    ? (current?.photoRev ?? 0) + 1
    : (current?.photoRev ?? 0);
  const next = {
    ip: input.ip,
    name: (input.name ?? current?.name ?? "").trim().slice(0, 32),
    instrument: input.instrument ?? current?.instrument ?? DEFAULT_PROFILE_INSTRUMENT,
    difficulty: input.difficulty ?? current?.difficulty ?? DEFAULT_PROFILE_DIFFICULTY,
    instrument_defaults: JSON.stringify(
      mergeInstrumentDefaults(current?.instrumentDefaults, input.instrumentDefaults),
    ),
    photo_ext: photoExt,
    photo_rev: photoRev,
    updated_at: Date.now(),
  };
  db.prepare(
    `INSERT INTO profiles (ip, name, instrument, difficulty, instrument_defaults, photo_ext, photo_rev, updated_at)
     VALUES (@ip, @name, @instrument, @difficulty, @instrument_defaults, @photo_ext, @photo_rev, @updated_at)
     ON CONFLICT(ip) DO UPDATE SET
       name = excluded.name,
       instrument = excluded.instrument,
       difficulty = excluded.difficulty,
       instrument_defaults = excluded.instrument_defaults,
       photo_ext = excluded.photo_ext,
       photo_rev = excluded.photo_rev,
       updated_at = excluded.updated_at`,
  ).run(next);
  return getProfile(input.ip)!;
}
