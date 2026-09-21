import type Database from "better-sqlite3";

/** SQLite schema version. Bump this and add a migration when YAQ's tables change. */
export const SCHEMA_VERSION = 2;

export type SchemaMigration = {
  version: number;
  name: string;
  up: (database: Database.Database) => void;
};

function tableExists(database: Database.Database, name: string): boolean {
  const row = database
    .prepare(
      "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .get(name) as { ok: number } | undefined;
  return Boolean(row);
}

function columnNames(database: Database.Database, table: string): Set<string> {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  return new Set(rows.map((row) => row.name));
}

function addColumn(
  database: Database.Database,
  table: string,
  name: string,
  spec: string,
): void {
  if (!tableExists(database, table)) return;
  if (columnNames(database, table).has(name)) return;
  database.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${spec}`);
}

function migrateV1(database: Database.Database): void {
  database.exec(`
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
      diffs TEXT NOT NULL DEFAULT '{}',
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
      status TEXT NOT NULL,
      client_ip TEXT NOT NULL DEFAULT ''
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
    CREATE TABLE IF NOT EXISTS profiles (
      ip TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      instrument TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      instrument_defaults TEXT NOT NULL DEFAULT '{}',
      photo_ext TEXT NOT NULL DEFAULT '',
      photo_rev INTEGER NOT NULL DEFAULT 0,
      onboarded INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scores (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      set_id TEXT NOT NULL,
      song_hash TEXT NOT NULL,
      song_name TEXT NOT NULL,
      song_artist TEXT NOT NULL,
      player_name TEXT NOT NULL,
      instrument TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      score INTEGER NOT NULL,
      stars REAL NOT NULL,
      band_score INTEGER NOT NULL,
      band_stars REAL NOT NULL,
      imported INTEGER NOT NULL DEFAULT 0,
      percent REAL NOT NULL DEFAULT 0,
      notes_hit INTEGER NOT NULL DEFAULT 0,
      total_notes INTEGER NOT NULL DEFAULT 0,
      max_combo INTEGER NOT NULL DEFAULT 0,
      sp_phrases_hit INTEGER NOT NULL DEFAULT 0,
      sp_phrases_total INTEGER NOT NULL DEFAULT 0,
      avg_multiplier REAL NOT NULL DEFAULT 0,
      is_full_combo INTEGER NOT NULL DEFAULT 0,
      is_high_score INTEGER NOT NULL DEFAULT 0,
      notes_missed INTEGER NOT NULL DEFAULT 0,
      overstrums INTEGER NOT NULL DEFAULT 0,
      ghost_inputs INTEGER NOT NULL DEFAULT 0,
      sp_uses INTEGER NOT NULL DEFAULT 0,
      time_in_sp REAL NOT NULL DEFAULT 0,
      engine_preset TEXT NOT NULL DEFAULT '',
      modifiers_used INTEGER NOT NULL DEFAULT 0
    );
  `);

  addColumn(database, "songs", "diffs", "TEXT NOT NULL DEFAULT '{}'");
  addColumn(database, "requests", "client_ip", "TEXT NOT NULL DEFAULT ''");
  addColumn(
    database,
    "profiles",
    "instrument_defaults",
    "TEXT NOT NULL DEFAULT '{}'",
  );
  addColumn(database, "profiles", "photo_ext", "TEXT NOT NULL DEFAULT ''");
  addColumn(database, "profiles", "photo_rev", "INTEGER NOT NULL DEFAULT 0");
  if (tableExists(database, "profiles") && !columnNames(database, "profiles").has("onboarded")) {
    database.exec(
      "ALTER TABLE profiles ADD COLUMN onboarded INTEGER NOT NULL DEFAULT 0",
    );
    database.exec("UPDATE profiles SET onboarded = 1");
  }

  const scoreExtras: Array<[string, string]> = [
    ["imported", "INTEGER NOT NULL DEFAULT 0"],
    ["percent", "REAL NOT NULL DEFAULT 0"],
    ["notes_hit", "INTEGER NOT NULL DEFAULT 0"],
    ["total_notes", "INTEGER NOT NULL DEFAULT 0"],
    ["max_combo", "INTEGER NOT NULL DEFAULT 0"],
    ["sp_phrases_hit", "INTEGER NOT NULL DEFAULT 0"],
    ["sp_phrases_total", "INTEGER NOT NULL DEFAULT 0"],
    ["avg_multiplier", "REAL NOT NULL DEFAULT 0"],
    ["is_full_combo", "INTEGER NOT NULL DEFAULT 0"],
    ["is_high_score", "INTEGER NOT NULL DEFAULT 0"],
    ["notes_missed", "INTEGER NOT NULL DEFAULT 0"],
    ["overstrums", "INTEGER NOT NULL DEFAULT 0"],
    ["ghost_inputs", "INTEGER NOT NULL DEFAULT 0"],
    ["sp_uses", "INTEGER NOT NULL DEFAULT 0"],
    ["time_in_sp", "REAL NOT NULL DEFAULT 0"],
    ["engine_preset", "TEXT NOT NULL DEFAULT ''"],
    ["modifiers_used", "INTEGER NOT NULL DEFAULT 0"],
  ];
  for (const [name, spec] of scoreExtras) {
    addColumn(database, "scores", name, spec);
  }
}

function migrateV2(database: Database.Database): void {
  const songExtras: Array<[string, string]> = [
    ["playlist", "TEXT NOT NULL DEFAULT ''"],
    ["pack", "TEXT NOT NULL DEFAULT ''"],
    ["icon", "TEXT NOT NULL DEFAULT ''"],
    ["loading_phrase", "TEXT NOT NULL DEFAULT ''"],
    ["preview_start", "INTEGER NOT NULL DEFAULT 0"],
    ["song_length", "INTEGER NOT NULL DEFAULT 0"],
    ["album_track", "INTEGER NOT NULL DEFAULT 0"],
    ["playlist_track", "INTEGER NOT NULL DEFAULT 0"],
    ["tags", "TEXT NOT NULL DEFAULT ''"],
    ["cover_path", "TEXT NOT NULL DEFAULT ''"],
    ["video", "TEXT NOT NULL DEFAULT ''"],
    ["subgenre", "TEXT NOT NULL DEFAULT ''"],
  ];
  for (const [name, spec] of songExtras) {
    addColumn(database, "songs", name, spec);
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      hash TEXT NOT NULL,
      song_count INTEGER NOT NULL DEFAULT 0,
      allow_imported_scores INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER NOT NULL,
      ended_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS events_hash_idx ON events (hash);
    CREATE INDEX IF NOT EXISTS events_active_idx ON events (ended_at);

    CREATE TABLE IF NOT EXISTS queue (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL DEFAULT '',
      song_hash TEXT NOT NULL,
      song_name TEXT NOT NULL,
      song_artist TEXT NOT NULL,
      player_ids TEXT NOT NULL,
      status TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      finished_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS queue_status_idx ON queue (status);
    CREATE INDEX IF NOT EXISTS queue_event_position_idx ON queue (event_id, position);

    CREATE TABLE IF NOT EXISTS letterboards (
      event_id TEXT PRIMARY KEY,
      overall TEXT NOT NULL,
      songs TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  addColumn(database, "scores", "event_id", "TEXT NOT NULL DEFAULT ''");
  database.exec(
    "CREATE INDEX IF NOT EXISTS scores_event_idx ON scores (event_id, created_at)",
  );

  if (tableExists(database, "sets")) {
    const rows = database
      .prepare(
        `SELECT id, song_hash, song_name, song_artist, player_ids, status,
                created_at, started_at, finished_at
         FROM sets
         ORDER BY created_at ASC`,
      )
      .all() as Array<{
      id: string;
      song_hash: string;
      song_name: string;
      song_artist: string;
      player_ids: string;
      status: string;
      created_at: number;
      started_at: number | null;
      finished_at: number | null;
    }>;
    const insert = database.prepare(`
      INSERT OR IGNORE INTO queue (
        id, event_id, song_hash, song_name, song_artist, player_ids,
        status, position, created_at, started_at, finished_at
      ) VALUES (
        @id, '', @song_hash, @song_name, @song_artist, @player_ids,
        @status, @position, @created_at, @started_at, @finished_at
      )
    `);
    rows.forEach((row, index) => {
      insert.run({ ...row, position: index });
    });
    database.exec("DROP TABLE IF EXISTS sets");
  }
}

export const MIGRATIONS: Record<number, SchemaMigration> = {
  1: { version: 1, name: "initial-yaq-tables", up: migrateV1 },
  2: {
    version: 2,
    name: "events-queue-letterboards-song-meta",
    up: migrateV2,
  },
};

export function schemaUserVersion(database: Database.Database): number {
  return Number(database.pragma("user_version", { simple: true })) || 0;
}

/** Apply pending schema migrations. Safe to run on every YAQ boot. */
export function migrate(
  database: Database.Database,
  appVersion: string,
): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      app_version TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_versions (
      version TEXT PRIMARY KEY,
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    );
  `);

  const current = schemaUserVersion(database);
  if (current > SCHEMA_VERSION) {
    throw new Error(
      `YAQ database schema ${current} is newer than this build (supports ${SCHEMA_VERSION}). Update YAQ.`,
    );
  }

  for (let version = current + 1; version <= SCHEMA_VERSION; version += 1) {
    const migration = MIGRATIONS[version];
    if (!migration) {
      throw new Error(`Missing YAQ schema migration ${version}`);
    }
    database.transaction(() => {
      migration.up(database);
      database
        .prepare(
          `INSERT INTO schema_migrations (version, name, app_version, applied_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(version, migration.name, appVersion, Date.now());
      database.pragma(`user_version = ${version}`);
    })();
  }

  const now = Date.now();
  database
    .prepare(
      `INSERT INTO app_versions (version, first_seen_at, last_seen_at)
       VALUES (?, ?, ?)
       ON CONFLICT(version) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
    )
    .run(appVersion, now, now);

  if (tableExists(database, "settings")) {
    const set = database.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    );
    set.run("schemaVersion", String(SCHEMA_VERSION));
    set.run("appVersion", appVersion);
  }
}

export function listedMigrations(database: Database.Database): Array<{
  version: number;
  name: string;
  appVersion: string;
  appliedAt: number;
}> {
  return (
    database
      .prepare(
        `SELECT version, name, app_version as appVersion, applied_at as appliedAt
         FROM schema_migrations
         ORDER BY version ASC`,
      )
      .all() as Array<{
      version: number;
      name: string;
      appVersion: string;
      appliedAt: number;
    }>
  );
}
