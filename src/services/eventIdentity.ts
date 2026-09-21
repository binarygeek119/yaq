import { createHash, randomBytes } from "node:crypto";
import { getSettings, listSongs, updateSettings, upsertActiveEvent } from "../db.js";
import type { SongRecord } from "../types.js";

export const MAX_EVENT_NAME_LENGTH = 64;

const ADJECTIVES = [
  "amber",
  "copper",
  "ember",
  "forest",
  "golden",
  "ivory",
  "lunar",
  "maple",
  "north",
  "olive",
  "pearl",
  "rapid",
  "silver",
  "steel",
  "velvet",
  "willow",
];

const NOUNS = [
  "anchor",
  "beacon",
  "cinder",
  "falcon",
  "harbor",
  "lantern",
  "meadow",
  "orchid",
  "pebble",
  "quartz",
  "ridge",
  "stage",
  "timber",
  "valley",
  "wagon",
  "zephyr",
];

export function randomEventName(): string {
  const bytes = randomBytes(3);
  const adjective = ADJECTIVES[bytes[0] % ADJECTIVES.length];
  const noun = NOUNS[bytes[1] % NOUNS.length];
  const n = 10 + (bytes[2] % 90);
  return `${adjective}-${noun}-${n}`;
}

export function sanitizeEventName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\u0000-\u001f]/g, "").trim().slice(0, MAX_EVENT_NAME_LENGTH);
}

export function songHashesForEvent(songs: SongRecord[] = listSongs()): string[] {
  const verified = songs.filter((song) => song.verified);
  const list = verified.length > 0 ? verified : songs;
  return [...new Set(list.map((song) => song.hash).filter(Boolean))].sort();
}

export function computeEventHash(eventName: string, songHashes: string[]): string {
  const body = `${eventName}\n${songHashes.join("\n")}`;
  return createHash("sha256").update(body).digest("hex");
}

export type EventIdentity = {
  name: string;
  hash: string;
  songCount: number;
};

export function ensureEventName(requested?: string): string {
  if (requested !== undefined) {
    const sanitized = sanitizeEventName(requested);
    if (sanitized) {
      if (getSettings().eventName !== sanitized) {
        updateSettings({ eventName: sanitized });
      }
      return sanitized;
    }
    const generated = randomEventName();
    updateSettings({ eventName: generated });
    return generated;
  }
  const current = sanitizeEventName(getSettings().eventName);
  if (current) return current;
  const generated = randomEventName();
  updateSettings({ eventName: generated });
  return generated;
}

export function getEventIdentity(): EventIdentity {
  const name = ensureEventName();
  const songHashes = songHashesForEvent();
  const hash = computeEventHash(name, songHashes);
  upsertActiveEvent({
    name,
    hash,
    songCount: songHashes.length,
    allowImportedScores: getSettings().allowImportedScores,
  });
  return {
    name,
    hash,
    songCount: songHashes.length,
  };
}

export function eventFilenameSlug(eventName: string): string {
  return (
    eventName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "event"
  );
}
