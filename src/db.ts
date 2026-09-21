import Database from "better-sqlite3";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataRoot } from "./paths.js";
import { migrate, SCHEMA_VERSION, schemaUserVersion } from "./schema.js";
import type {
  AppSettings,
  Difficulty,
  EventFlags,
  EventRecord,
  Instrument,
  InstrumentCaps,
  Letterboard,
  PlaySet,
  QueueRequest,
  ScoreRun,
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
import { YAQ_VERSION } from "./version.js";

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
  migrate(db, YAQ_VERSION);
  ensureDefaultSettings();
}

export function getSchemaInfo(): { schemaVersion: number; appVersion: string } {
  return {
    schemaVersion: schemaUserVersion(db) || SCHEMA_VERSION,
    appVersion: getSetting("appVersion") || YAQ_VERSION,
  };
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
  set.run("eventName", "");
  set.run("allowImportedScores", "false");
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
    eventName: getSetting("eventName"),
    allowImportedScores: getSetting("allowImportedScores") === "true",
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
  setSetting("eventName", next.eventName);
  setSetting("allowImportedScores", String(Boolean(next.allowImportedScores)));
  return next;
}

function songExtras(song: SongRecord) {
  return {
    playlist: song.playlist ?? "",
    pack: song.pack ?? "",
    icon: song.icon ?? "",
    loadingPhrase: song.loadingPhrase ?? "",
    previewStart: Number(song.previewStart) || 0,
    songLength: Number(song.songLength) || 0,
    albumTrack: Number(song.albumTrack) || 0,
    playlistTrack: Number(song.playlistTrack) || 0,
    tags: song.tags ?? "",
    coverPath: song.coverPath ?? "",
    video: song.video ?? "",
    subgenre: song.subgenre ?? "",
  };
}

export function upsertSongs(songs: SongRecord[]): void {
  const stmt = db.prepare(`
    INSERT INTO songs (
      hash, name, artist, album, year, genre, charter, folder_path,
      instruments, diffs, source, verified,
      playlist, pack, icon, loading_phrase, preview_start, song_length,
      album_track, playlist_track, tags, cover_path, video, subgenre
    )
    VALUES (
      @hash, @name, @artist, @album, @year, @genre, @charter, @folderPath,
      @instruments, @diffs, @source, @verified,
      @playlist, @pack, @icon, @loadingPhrase, @previewStart, @songLength,
      @albumTrack, @playlistTrack, @tags, @coverPath, @video, @subgenre
    )
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
      verified = MAX(songs.verified, excluded.verified),
      playlist = CASE WHEN excluded.playlist = '' THEN songs.playlist ELSE excluded.playlist END,
      pack = CASE WHEN excluded.pack = '' THEN songs.pack ELSE excluded.pack END,
      icon = CASE WHEN excluded.icon = '' THEN songs.icon ELSE excluded.icon END,
      loading_phrase = CASE WHEN excluded.loading_phrase = '' THEN songs.loading_phrase ELSE excluded.loading_phrase END,
      preview_start = CASE WHEN excluded.preview_start = 0 THEN songs.preview_start ELSE excluded.preview_start END,
      song_length = CASE WHEN excluded.song_length = 0 THEN songs.song_length ELSE excluded.song_length END,
      album_track = CASE WHEN excluded.album_track = 0 THEN songs.album_track ELSE excluded.album_track END,
      playlist_track = CASE WHEN excluded.playlist_track = 0 THEN songs.playlist_track ELSE excluded.playlist_track END,
      tags = CASE WHEN excluded.tags = '' THEN songs.tags ELSE excluded.tags END,
      cover_path = CASE WHEN excluded.cover_path = '' THEN songs.cover_path ELSE excluded.cover_path END,
      video = CASE WHEN excluded.video = '' THEN songs.video ELSE excluded.video END,
      subgenre = CASE WHEN excluded.subgenre = '' THEN songs.subgenre ELSE excluded.subgenre END
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
        ...songExtras(song),
      });
    }
  });
  tx(songs);
}

export function clearScanSongs(): void {
  db.prepare("DELETE FROM songs WHERE source = 'scan' AND verified = 0").run();
}

export function replaceSongs(songs: SongRecord[]): {
  imported: number;
  removed: number;
} {
  const incoming = songs
    .map((song) => ({
      ...song,
      hash: (song.hash ?? "").toLowerCase(),
    }))
    .filter((song) => Boolean(song.hash));
  upsertSongs(incoming);
  const keep = new Set(incoming.map((song) => song.hash));
  const stale = listSongs().filter((song) => !keep.has(song.hash.toLowerCase()));
  const del = db.prepare("DELETE FROM songs WHERE hash = ?");
  const tx = db.transaction(() => {
    for (const song of stale) {
      del.run(song.hash);
    }
  });
  tx();
  return { imported: incoming.length, removed: stale.length };
}

export function listSongs(): SongRecord[] {
  const rows = db
    .prepare(
      `SELECT hash, name, artist, album, year, genre, charter,
              folder_path as folderPath, instruments, diffs, source, verified,
              playlist, pack, icon, loading_phrase as loadingPhrase,
              preview_start as previewStart, song_length as songLength,
              album_track as albumTrack, playlist_track as playlistTrack,
              tags, cover_path as coverPath, video, subgenre
       FROM songs
       ORDER BY artist COLLATE NOCASE, name COLLATE NOCASE`,
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
    playlist: row.playlist ?? "",
    pack: row.pack ?? "",
    icon: row.icon ?? "",
    loadingPhrase: row.loadingPhrase ?? "",
    previewStart: Number(row.previewStart) || 0,
    songLength: Number(row.songLength) || 0,
    albumTrack: Number(row.albumTrack) || 0,
    playlistTrack: Number(row.playlistTrack) || 0,
    tags: row.tags ?? "",
    coverPath: row.coverPath ?? "",
    video: row.video ?? "",
    subgenre: row.subgenre ?? "",
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
  const key = (hash ?? "").toLowerCase();
  if (!key) return null;
  return listSongs().find((s) => s.hash.toLowerCase() === key) ?? null;
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

function mapQueueRow(
  row: Omit<PlaySet, "playerIds"> & { playerIds: string },
): PlaySet {
  return {
    ...row,
    playerIds: JSON.parse(row.playerIds) as string[],
    eventId: row.eventId ?? "",
  };
}

export function listSets(): PlaySet[] {
  const rows = db
    .prepare(
      `SELECT id, event_id as eventId, song_hash as songHash, song_name as songName,
              song_artist as songArtist, player_ids as playerIds, status,
              created_at as createdAt, started_at as startedAt, finished_at as finishedAt
       FROM queue
       ORDER BY position ASC, created_at ASC`,
    )
    .all() as Array<Omit<PlaySet, "playerIds"> & { playerIds: string }>;
  return rows.map(mapQueueRow);
}

export const listQueue = listSets;

function nextQueuePosition(): number {
  const row = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS n FROM queue").get() as {
    n: number;
  };
  return Number(row?.n) || 0;
}

export function insertSet(set: PlaySet): void {
  db.prepare(
    `INSERT INTO queue (
       id, event_id, song_hash, song_name, song_artist, player_ids,
       status, position, created_at, started_at, finished_at
     ) VALUES (
       @id, @eventId, @songHash, @songName, @songArtist, @playerIds,
       @status, @position, @createdAt, @startedAt, @finishedAt
     )`,
  ).run({
    ...set,
    eventId: set.eventId || getActiveEvent()?.id || "",
    playerIds: JSON.stringify(set.playerIds),
    position: nextQueuePosition(),
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
    "UPDATE queue SET status = ?, started_at = ?, finished_at = ?, player_ids = ? WHERE id = ?",
  ).run(
    next.status,
    next.startedAt,
    next.finishedAt,
    JSON.stringify(next.playerIds),
    id,
  );
}

function mapEventRow(row: {
  id: string;
  name: string;
  hash: string;
  songCount: number;
  allowImportedScores: number;
  startedAt: number;
  endedAt: number | null;
}): EventRecord {
  return {
    id: row.id,
    name: row.name,
    hash: row.hash,
    songCount: Number(row.songCount) || 0,
    allowImportedScores: Boolean(row.allowImportedScores),
    startedAt: row.startedAt,
    endedAt: row.endedAt,
  };
}

export function getActiveEvent(): EventRecord | null {
  const row = db
    .prepare(
      `SELECT id, name, hash, song_count as songCount,
              allow_imported_scores as allowImportedScores,
              started_at as startedAt, ended_at as endedAt
       FROM events
       WHERE ended_at IS NULL
       ORDER BY started_at DESC
       LIMIT 1`,
    )
    .get() as
    | {
        id: string;
        name: string;
        hash: string;
        songCount: number;
        allowImportedScores: number;
        startedAt: number;
        endedAt: number | null;
      }
    | undefined;
  return row ? mapEventRow(row) : null;
}

export function upsertActiveEvent(input: {
  name: string;
  hash: string;
  songCount: number;
  allowImportedScores?: boolean;
}): EventRecord {
  const allowImported =
    input.allowImportedScores ?? getSettings().allowImportedScores;
  const current = getActiveEvent();
  if (
    current &&
    current.hash === input.hash &&
    current.name === input.name
  ) {
    if (current.songCount !== input.songCount || current.allowImportedScores !== allowImported) {
      db.prepare(
        `UPDATE events
         SET song_count = ?, allow_imported_scores = ?
         WHERE id = ?`,
      ).run(input.songCount, allowImported ? 1 : 0, current.id);
      return { ...current, songCount: input.songCount, allowImportedScores: allowImported };
    }
    return current;
  }
  const now = Date.now();
  if (current) {
    db.prepare("UPDATE events SET ended_at = ? WHERE id = ?").run(now, current.id);
  }
  const next: EventRecord = {
    id: randomUUID(),
    name: input.name,
    hash: input.hash,
    songCount: input.songCount,
    allowImportedScores: allowImported,
    startedAt: now,
    endedAt: null,
  };
  db.prepare(
    `INSERT INTO events (
       id, name, hash, song_count, allow_imported_scores, started_at, ended_at
     ) VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  ).run(next.id, next.name, next.hash, next.songCount, next.allowImportedScores ? 1 : 0, next.startedAt);
  return next;
}

export function listEvents(): EventRecord[] {
  return (
    db
      .prepare(
        `SELECT id, name, hash, song_count as songCount,
                allow_imported_scores as allowImportedScores,
                started_at as startedAt, ended_at as endedAt
         FROM events
         ORDER BY started_at DESC`,
      )
      .all() as Array<{
      id: string;
      name: string;
      hash: string;
      songCount: number;
      allowImportedScores: number;
      startedAt: number;
      endedAt: number | null;
    }>
  ).map(mapEventRow);
}

export function saveLetterboard(eventId: string, board: Letterboard): void {
  if (!eventId) return;
  const now = Date.now();
  db.prepare(
    `INSERT INTO letterboards (event_id, overall, songs, created_at, updated_at)
     VALUES (@eventId, @overall, @songs, @createdAt, @updatedAt)
     ON CONFLICT(event_id) DO UPDATE SET
       overall = excluded.overall,
       songs = excluded.songs,
       updated_at = excluded.updated_at`,
  ).run({
    eventId,
    overall: JSON.stringify(board.overall),
    songs: JSON.stringify(board.songs),
    createdAt: now,
    updatedAt: now,
  });
}

export function getLetterboard(eventId: string): Letterboard | null {
  if (!eventId) return null;
  const row = db
    .prepare(
      `SELECT overall, songs FROM letterboards WHERE event_id = ?`,
    )
    .get(eventId) as { overall: string; songs: string } | undefined;
  if (!row) return null;
  try {
    return {
      overall: JSON.parse(row.overall) as Letterboard["overall"],
      songs: JSON.parse(row.songs) as Letterboard["songs"],
    };
  } catch {
    return null;
  }
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
  onboarded: boolean;
};

export function getProfile(ip: string): StoredProfile | null {
  if (!ip) return null;
  const row = db
    .prepare(
      `SELECT ip, name, instrument, difficulty,
              instrument_defaults as instrumentDefaults,
              photo_ext as photoExt, photo_rev as photoRev,
              onboarded
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
        onboarded: number;
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
    onboarded: Boolean(row.onboarded),
  };
}

export function profilePhotoPath(ip: string): string | null {
  const stored = getProfile(ip);
  if (!stored?.photoExt) return null;
  return avatarPath(ip, stored.photoExt);
}

/** Prefer the device IP; fall back to the latest profile with this guest name. */
export function profilePhotoPathForGuest(
  clientIp?: string,
  name?: string,
): string | null {
  const fromIp = profilePhotoPath(clientIp ?? "");
  if (fromIp) return fromIp;
  const trimmed = (name ?? "").trim();
  if (!trimmed) return null;
  const row = db
    .prepare(
      `SELECT ip FROM profiles
       WHERE name = ? COLLATE NOCASE AND IFNULL(photo_ext, '') != ''
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(trimmed) as { ip: string } | undefined;
  return row ? profilePhotoPath(row.ip) : null;
}

export function upsertProfile(input: {
  ip: string;
  name?: string;
  instrument?: Instrument;
  difficulty?: Difficulty;
  instrumentDefaults?: InstrumentDefaults;
  photoExt?: string;
  bumpPhotoRev?: boolean;
  onboarded?: boolean;
}): StoredProfile {
  const current = getProfile(input.ip);
  const photoExt =
    input.photoExt !== undefined ? input.photoExt : (current?.photoExt ?? "");
  const photoRev = input.bumpPhotoRev
    ? (current?.photoRev ?? 0) + 1
    : (current?.photoRev ?? 0);
  const onboarded =
    input.onboarded === true
      ? 1
      : input.onboarded === false
        ? 0
        : current?.onboarded
          ? 1
          : 0;
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
    onboarded,
    updated_at: Date.now(),
  };
  db.prepare(
    `INSERT INTO profiles (ip, name, instrument, difficulty, instrument_defaults, photo_ext, photo_rev, onboarded, updated_at)
     VALUES (@ip, @name, @instrument, @difficulty, @instrument_defaults, @photo_ext, @photo_rev, @onboarded, @updated_at)
     ON CONFLICT(ip) DO UPDATE SET
       name = excluded.name,
       instrument = excluded.instrument,
       difficulty = excluded.difficulty,
       instrument_defaults = excluded.instrument_defaults,
       photo_ext = excluded.photo_ext,
       photo_rev = excluded.photo_rev,
       onboarded = excluded.onboarded,
       updated_at = excluded.updated_at`,
  ).run(next);
  return getProfile(input.ip)!;
}

export function insertScoreRun(run: ScoreRun): boolean {
  const info = db
    .prepare(
      `INSERT OR IGNORE INTO scores (
         id, created_at, set_id, event_id, song_hash, song_name, song_artist,
         player_name, instrument, difficulty, score, stars, band_score, band_stars,
         imported, percent, notes_hit, total_notes, max_combo,
         sp_phrases_hit, sp_phrases_total, avg_multiplier,
         is_full_combo, is_high_score, notes_missed, overstrums, ghost_inputs,
         sp_uses, time_in_sp, engine_preset, modifiers_used
       ) VALUES (
         @id, @createdAt, @setId, @eventId, @songHash, @songName, @songArtist,
         @playerName, @instrument, @difficulty, @score, @stars, @bandScore, @bandStars,
         @imported, @percent, @notesHit, @totalNotes, @maxCombo,
         @spPhrasesHit, @spPhrasesTotal, @avgMultiplier,
         @isFullCombo, @isHighScore, @notesMissed, @overstrums, @ghostInputs,
         @spUses, @timeInSp, @enginePreset, @modifiersUsed
       )`,
    )
    .run({
      ...run,
      eventId: run.eventId || getActiveEvent()?.id || "",
      imported: run.imported ? 1 : 0,
      percent: Number(run.percent) || 0,
      notesHit: Number(run.notesHit) || 0,
      totalNotes: Number(run.totalNotes) || 0,
      maxCombo: Number(run.maxCombo) || 0,
      spPhrasesHit: Number(run.spPhrasesHit) || 0,
      spPhrasesTotal: Number(run.spPhrasesTotal) || 0,
      avgMultiplier: Number(run.avgMultiplier) || 0,
      isFullCombo: run.isFullCombo ? 1 : 0,
      isHighScore: run.isHighScore ? 1 : 0,
      notesMissed: Number(run.notesMissed) || 0,
      overstrums: Number(run.overstrums) || 0,
      ghostInputs: Number(run.ghostInputs) || 0,
      spUses: Number(run.spUses) || 0,
      timeInSp: Number(run.timeInSp) || 0,
      enginePreset: run.enginePreset || "",
      modifiersUsed: run.modifiersUsed ? 1 : 0,
    });
  return info.changes > 0;
}

export function getScoreExportSecret(): string {
  let secret = getSetting("scoreExportSecret");
  if (!/^[0-9a-f]{64}$/i.test(secret)) {
    secret = randomBytes(32).toString("hex");
    setSetting("scoreExportSecret", secret);
  }
  return secret;
}

export function listScoreRuns(): ScoreRun[] {
  return db
    .prepare(
      `SELECT id, created_at as createdAt, set_id as setId, event_id as eventId,
              song_hash as songHash,
              song_name as songName, song_artist as songArtist,
              player_name as playerName, instrument, difficulty, score, stars,
              band_score as bandScore, band_stars as bandStars,
              imported, percent, notes_hit as notesHit, total_notes as totalNotes,
              max_combo as maxCombo, sp_phrases_hit as spPhrasesHit,
              sp_phrases_total as spPhrasesTotal, avg_multiplier as avgMultiplier,
              is_full_combo as isFullCombo, is_high_score as isHighScore,
              notes_missed as notesMissed, overstrums, ghost_inputs as ghostInputs,
              sp_uses as spUses, time_in_sp as timeInSp, engine_preset as enginePreset,
              modifiers_used as modifiersUsed
       FROM scores
       ORDER BY created_at DESC`,
    )
    .all()
    .map((row) => {
      const rec = row as ScoreRun & {
        imported: number | boolean;
        isFullCombo: number | boolean;
        isHighScore: number | boolean;
        modifiersUsed: number | boolean;
      };
      return {
        ...rec,
        imported: Boolean(rec.imported),
        isFullCombo: Boolean(rec.isFullCombo),
        isHighScore: Boolean(rec.isHighScore),
        modifiersUsed: Boolean(rec.modifiersUsed),
        percent: Number(rec.percent) || 0,
        notesHit: Number(rec.notesHit) || 0,
        totalNotes: Number(rec.totalNotes) || 0,
        maxCombo: Number(rec.maxCombo) || 0,
        spPhrasesHit: Number(rec.spPhrasesHit) || 0,
        spPhrasesTotal: Number(rec.spPhrasesTotal) || 0,
        avgMultiplier: Number(rec.avgMultiplier) || 0,
        notesMissed: Number(rec.notesMissed) || 0,
        overstrums: Number(rec.overstrums) || 0,
        ghostInputs: Number(rec.ghostInputs) || 0,
        spUses: Number(rec.spUses) || 0,
        timeInSp: Number(rec.timeInSp) || 0,
        enginePreset: rec.enginePreset || "",
        eventId: rec.eventId || "",
      };
    });
}
