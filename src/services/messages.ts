import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { dataRoot } from "../paths.js";

export type AudioMessage = {
  id: string;
  name: string;
  createdAt: number;
  durationMs: number;
  bytes: number;
};

function messagesDir(): string {
  const dir = path.join(dataRoot(), "messages");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function messagePath(id: string): string {
  return path.join(messagesDir(), `${id}.wav`);
}

function rowToMessage(row: {
  id: string;
  name: string;
  created_at: number;
  duration_ms: number;
  bytes: number;
}): AudioMessage {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    durationMs: row.duration_ms,
    bytes: row.bytes,
  };
}

export function listMessages(): AudioMessage[] {
  return (
    db
      .prepare(
        `SELECT id, name, created_at, duration_ms, bytes
         FROM messages ORDER BY created_at DESC`,
      )
      .all() as Array<{
      id: string;
      name: string;
      created_at: number;
      duration_ms: number;
      bytes: number;
    }>
  ).map(rowToMessage);
}

export function getMessage(id: string): AudioMessage | null {
  const row = db
    .prepare(
      `SELECT id, name, created_at, duration_ms, bytes FROM messages WHERE id = ?`,
    )
    .get(id) as
    | {
        id: string;
        name: string;
        created_at: number;
        duration_ms: number;
        bytes: number;
      }
    | undefined;
  return row ? rowToMessage(row) : null;
}

export function isWav(bytes: Buffer): boolean {
  return (
    bytes.length >= 44 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WAVE"
  );
}

export function saveMessage(
  name: string,
  wav: Buffer,
  durationMs: number,
): AudioMessage {
  if (!isWav(wav)) {
    throw new Error("Recording must be a WAV file");
  }
  const id = randomUUID();
  const file = messagePath(id);
  fs.writeFileSync(file, wav);
  const record: AudioMessage = {
    id,
    name: name.trim() || "Untitled message",
    createdAt: Date.now(),
    durationMs: Math.max(0, Math.floor(durationMs)),
    bytes: wav.length,
  };
  db.prepare(
    `INSERT INTO messages (id, name, created_at, duration_ms, bytes)
     VALUES (@id, @name, @createdAt, @durationMs, @bytes)`,
  ).run(record);
  return record;
}

export function deleteMessage(id: string): boolean {
  const existing = getMessage(id);
  if (!existing) return false;
  db.prepare("DELETE FROM messages WHERE id = ?").run(id);
  try {
    fs.unlinkSync(messagePath(id));
  } catch {
    // File may already be gone.
  }
  return true;
}

export function readMessageBytes(id: string): Buffer | null {
  if (!getMessage(id)) return null;
  const file = messagePath(id);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file);
}
