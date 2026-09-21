import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { assetRoot, dataRoot } from "../paths.js";
import {
  DEFAULT_MESSAGE_CUES,
  isDefaultCueId,
  type DefaultCueId,
} from "./messageCues.js";

export type AudioMessage = {
  id: string;
  name: string;
  createdAt: number;
  durationMs: number;
  bytes: number;
  kind: "default" | "custom";
};

function messagesDir(): string {
  const dir = path.join(dataRoot(), "messages");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function defaultMessagesDir(): string {
  return path.join(assetRoot(), "messages", "Default");
}

export function defaultMessagePath(id: DefaultCueId): string {
  const cue = DEFAULT_MESSAGE_CUES.find((row) => row.id === id);
  return path.join(defaultMessagesDir(), cue?.file ?? `${id}.mp3`);
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
    kind: "custom",
  };
}

/** 128 kbps CBR estimate used by the shipped default MP3s. */
export function estimateMp3DurationMs(bytes: number): number {
  return Math.max(1000, Math.round((bytes * 8) / 128));
}

function defaultMessageFromDisk(id: DefaultCueId): AudioMessage | null {
  const file = defaultMessagePath(id);
  if (!fs.existsSync(file)) return null;
  const cue = DEFAULT_MESSAGE_CUES.find((row) => row.id === id);
  const bytes = fs.statSync(file).size;
  return {
    id,
    name: cue?.name ?? id,
    createdAt: 0,
    durationMs: estimateMp3DurationMs(bytes),
    bytes,
    kind: "default",
  };
}

export function listDefaultMessages(): AudioMessage[] {
  return DEFAULT_MESSAGE_CUES.map((cue) => defaultMessageFromDisk(cue.id)).filter(
    (row): row is AudioMessage => row !== null,
  );
}

export function listMessages(): AudioMessage[] {
  const custom = (
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
  )
    .map(rowToMessage)
    .filter((row) => !isDefaultCueId(row.id));
  return [...listDefaultMessages(), ...custom];
}

export function getMessage(id: string): AudioMessage | null {
  if (isDefaultCueId(id)) {
    return defaultMessageFromDisk(id);
  }
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

export function isMp3(bytes: Buffer): boolean {
  if (bytes.length >= 3 && bytes.toString("ascii", 0, 3) === "ID3") return true;
  return bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

export function messageAudioContentType(bytes: Buffer): string {
  if (isWav(bytes)) return "audio/wav";
  if (isMp3(bytes)) return "audio/mpeg";
  return "application/octet-stream";
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
    kind: "custom",
  };
  db.prepare(
    `INSERT INTO messages (id, name, created_at, duration_ms, bytes)
     VALUES (@id, @name, @createdAt, @durationMs, @bytes)`,
  ).run({
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    durationMs: record.durationMs,
    bytes: record.bytes,
  });
  return record;
}

export function deleteMessage(id: string): boolean {
  if (isDefaultCueId(id)) {
    throw new Error("Default messages cannot be removed");
  }
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
  if (isDefaultCueId(id)) {
    const file = defaultMessagePath(id);
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file);
  }
  if (!getMessage(id)) return null;
  const file = messagePath(id);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file);
}
