import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import {
  SCHEMA_VERSION,
  listedMigrations,
  migrate,
  schemaUserVersion,
} from "./schema.js";

function openMemory(): Database.Database {
  const database = new Database(":memory:");
  database.pragma("journal_mode = WAL");
  return database;
}

function seedLegacyV0(database: Database.Database): void {
  database.exec(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE songs (
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
    CREATE TABLE requests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      song_hash TEXT NOT NULL,
      instrument TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      set_id TEXT,
      status TEXT NOT NULL
    );
    CREATE TABLE sets (
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
    CREATE TABLE profiles (
      ip TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      instrument TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE scores (
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
      band_stars REAL NOT NULL
    );
  `);
  database
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
    .run("eventName", "Legacy Night");
  database
    .prepare(
      `INSERT INTO songs (hash, name, artist, album, year, genre, charter, folder_path, instruments, source, verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "abc",
      "Slow Ride",
      "Foghat",
      "Fool for the City",
      "1975",
      "Rock",
      "Someone",
      "/charts/slow-ride",
      '["FiveFretGuitar"]',
      "scan",
      1,
    );
  database
    .prepare(
      `INSERT INTO sets (id, song_hash, song_name, song_artist, player_ids, status, created_at, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run("set-1", "abc", "Slow Ride", "Foghat", '["r1"]', "on_deck", 100, null, null);
  database
    .prepare(
      `INSERT INTO profiles (ip, name, instrument, difficulty, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run("127.0.0.1", "Josh", "FiveFretGuitar", "Expert", 100);
}

function tableNames(database: Database.Database): string[] {
  return (
    database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all() as Array<{ name: string }>
  ).map((row) => row.name);
}

function columns(database: Database.Database, table: string): string[] {
  return (
    database.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name: string;
    }>
  ).map((row) => row.name);
}

describe("YAQ sqlite schema migrations", () => {
  it("creates versioned tables on a fresh database", () => {
    const database = openMemory();
    migrate(database, "1.1.0");
    expect(schemaUserVersion(database)).toBe(SCHEMA_VERSION);
    expect(tableNames(database)).toEqual(
      expect.arrayContaining([
        "settings",
        "songs",
        "queue",
        "events",
        "scores",
        "letterboards",
        "profiles",
        "requests",
        "messages",
        "schema_migrations",
        "app_versions",
      ]),
    );
    expect(tableNames(database)).not.toContain("sets");
    expect(columns(database, "songs")).toEqual(
      expect.arrayContaining([
        "hash",
        "name",
        "artist",
        "album",
        "year",
        "genre",
        "charter",
        "folder_path",
        "instruments",
        "diffs",
        "playlist",
        "pack",
        "loading_phrase",
        "song_length",
        "cover_path",
      ]),
    );
    expect(columns(database, "profiles")).toEqual(
      expect.arrayContaining(["ip", "name", "photo_ext", "photo_rev"]),
    );
    expect(columns(database, "profiles").some((name) => /blob|photo_data|image/i.test(name))).toBe(
      false,
    );
    const migrations = listedMigrations(database);
    expect(migrations.map((row) => row.version)).toEqual([1, 2, 3]);
    expect(migrations[1]?.appVersion).toBe("1.1.0");
    const app = database
      .prepare("SELECT version FROM app_versions")
      .all() as Array<{ version: string }>;
    expect(app.map((row) => row.version)).toEqual(["1.1.0"]);
    database.close();
  });

  it("upgrades a legacy database and moves sets into queue", () => {
    const database = openMemory();
    seedLegacyV0(database);
    expect(schemaUserVersion(database)).toBe(0);
    migrate(database, "1.1.0");
    expect(schemaUserVersion(database)).toBe(SCHEMA_VERSION);
    expect(tableNames(database)).toContain("queue");
    expect(tableNames(database)).toContain("messages");
    expect(tableNames(database)).not.toContain("sets");
    const queued = database
      .prepare("SELECT id, song_name as songName, status, position FROM queue")
      .all() as Array<{
      id: string;
      songName: string;
      status: string;
      position: number;
    }>;
    expect(queued).toEqual([
      { id: "set-1", songName: "Slow Ride", status: "on_deck", position: 0 },
    ]);
    expect(columns(database, "songs")).toContain("diffs");
    expect(columns(database, "songs")).toContain("cover_path");
    expect(columns(database, "profiles")).toContain("photo_ext");
    expect(columns(database, "scores")).toContain("event_id");
    const onboarded = database
      .prepare("SELECT onboarded FROM profiles WHERE ip = ?")
      .get("127.0.0.1") as { onboarded: number };
    expect(onboarded.onboarded).toBe(1);
    database.close();
  });

  it("records a new app version without re-running schema migrations", () => {
    const database = openMemory();
    migrate(database, "1.1.0");
    migrate(database, "1.2.0");
    expect(schemaUserVersion(database)).toBe(SCHEMA_VERSION);
    expect(listedMigrations(database)).toHaveLength(3);
    const apps = database
      .prepare("SELECT version FROM app_versions ORDER BY version")
      .all() as Array<{ version: string }>;
    expect(apps.map((row) => row.version)).toEqual(["1.1.0", "1.2.0"]);
    const settings = Object.fromEntries(
      (
        database.prepare("SELECT key, value FROM settings").all() as Array<{
          key: string;
          value: string;
        }>
      ).map((row) => [row.key, row.value]),
    );
    expect(settings.schemaVersion).toBe(String(SCHEMA_VERSION));
    expect(settings.appVersion).toBe("1.2.0");
    database.close();
  });
});
