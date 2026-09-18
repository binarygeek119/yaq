import { createHmac, timingSafeEqual } from "node:crypto";
import { getScoreExportSecret, insertScoreRun } from "../db.js";
import type { ScoreRun } from "../types.js";
import { canonicalJson } from "./canonicalJson.js";
import {
  eventFilenameSlug,
  getEventIdentity,
} from "./eventIdentity.js";
import { scoresForPlayer } from "./scores.js";

export const SCORE_EXPORT_VERSION = 1;
export const SCORE_EXPORT_KIND = "yaq-score-export";

export type ScoreExportRun = {
  id: string;
  createdAt: number;
  setId: string;
  songHash: string;
  songName: string;
  songArtist: string;
  playerName: string;
  instrument: string;
  difficulty: string;
  score: number;
  stars: number;
  bandScore: number;
  bandStars: number;
};

export type ScoreExportPayload = {
  kind: typeof SCORE_EXPORT_KIND;
  exportedAt: string;
  exportedAtMs: number;
  eventName: string;
  eventHash: string;
  songCount: number;
  playerName: string;
  runs: ScoreExportRun[];
};

export type SignedScoreExport = {
  v: number;
  payload: ScoreExportPayload;
  signature: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function signPayload(payload: ScoreExportPayload): string {
  return createHmac("sha256", getScoreExportSecret())
    .update(canonicalJson(payload))
    .digest("hex");
}

function signaturesMatch(expected: string, actual: string): boolean {
  if (typeof actual !== "string" || actual.length !== expected.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));
  } catch {
    return false;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length > max) return null;
  return trimmed;
}

function asInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

function asFinite(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

function parseRun(raw: unknown): ScoreExportRun | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const id = asString(rec.id, 36);
  if (!id || !UUID_RE.test(id)) return null;
  const createdAt = asInt(rec.createdAt, 1, 4102444800000);
  const score = asInt(rec.score, 0, 99_999_999);
  const bandScore = asInt(rec.bandScore, 0, 99_999_999);
  const stars = asFinite(rec.stars, 0, 6);
  const bandStars = asFinite(rec.bandStars, 0, 6);
  const setId = asString(rec.setId, 80);
  const songHash = asString(rec.songHash, 128);
  const songName = asString(rec.songName, 200);
  const songArtist = asString(rec.songArtist, 200);
  const playerName = asString(rec.playerName, 32);
  const instrument = asString(rec.instrument, 40);
  const difficulty = asString(rec.difficulty, 20);
  if (
    createdAt == null ||
    score == null ||
    bandScore == null ||
    stars == null ||
    bandStars == null ||
    setId == null ||
    songHash == null ||
    songName == null ||
    songArtist == null ||
    playerName == null ||
    instrument == null ||
    difficulty == null
  ) {
    return null;
  }
  return {
    id,
    createdAt,
    setId,
    songHash,
    songName,
    songArtist,
    playerName,
    instrument,
    difficulty,
    score,
    stars,
    bandScore,
    bandStars,
  };
}

function parsePayload(raw: unknown): ScoreExportPayload | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  if (rec.kind !== SCORE_EXPORT_KIND) return null;
  const exportedAt = asString(rec.exportedAt, 40);
  const exportedAtMs = asInt(rec.exportedAtMs, 1, 4102444800000);
  const eventName = asString(rec.eventName, 64);
  const eventHash = asString(rec.eventHash, 64);
  const songCount = asInt(rec.songCount, 0, 1_000_000);
  const playerName = asString(rec.playerName, 32);
  if (
    !exportedAt ||
    exportedAtMs == null ||
    !eventName ||
    !eventHash ||
    !/^[0-9a-f]{64}$/i.test(eventHash) ||
    songCount == null ||
    playerName == null ||
    !Array.isArray(rec.runs)
  ) {
    return null;
  }
  const runs: ScoreExportRun[] = [];
  for (const item of rec.runs) {
    const run = parseRun(item);
    if (!run) return null;
    runs.push(run);
  }
  return {
    kind: SCORE_EXPORT_KIND,
    exportedAt,
    exportedAtMs,
    eventName,
    eventHash,
    songCount,
    playerName,
    runs,
  };
}

export function buildScoreExport(playerName: string): {
  filename: string;
  file: SignedScoreExport;
} {
  const identity = getEventIdentity();
  const name = playerName.trim() || "Guest";
  const now = Date.now();
  const payload: ScoreExportPayload = {
    kind: SCORE_EXPORT_KIND,
    exportedAt: new Date(now).toISOString(),
    exportedAtMs: now,
    eventName: identity.name,
    eventHash: identity.hash,
    songCount: identity.songCount,
    playerName: name,
    runs: scoresForPlayer(name).map((run) => ({
      id: run.id,
      createdAt: run.createdAt,
      setId: run.setId,
      songHash: run.songHash,
      songName: run.songName,
      songArtist: run.songArtist,
      playerName: run.playerName,
      instrument: run.instrument,
      difficulty: run.difficulty,
      score: run.score,
      stars: run.stars,
      bandScore: run.bandScore,
      bandStars: run.bandStars,
    })),
  };
  const file: SignedScoreExport = {
    v: SCORE_EXPORT_VERSION,
    payload,
    signature: signPayload(payload),
  };
  const day = payload.exportedAt.slice(0, 10);
  const filename = `yaq-scores-${eventFilenameSlug(identity.name)}-${day}.json`;
  return { filename, file };
}

export function importScoreExport(
  playerName: string,
  raw: unknown,
): {
  imported: number;
  skipped: number;
  eventName: string;
  exportedAt: string;
} {
  const rec = asRecord(raw);
  if (!rec || rec.v !== SCORE_EXPORT_VERSION) {
    throw new Error("This file was edited or is not a YAQ score export.");
  }
  const signature = typeof rec.signature === "string" ? rec.signature : "";
  let expected = "";
  try {
    expected = createHmac("sha256", getScoreExportSecret())
      .update(canonicalJson(rec.payload))
      .digest("hex");
  } catch {
    throw new Error("This file was edited or is not a YAQ score export.");
  }
  const payload = parsePayload(rec.payload);
  if (!payload || !signaturesMatch(expected, signature)) {
    throw new Error("This file was edited or is not a YAQ score export.");
  }

  const owner = playerName.trim() || payload.playerName || "Guest";
  let imported = 0;
  let skipped = 0;
  for (const run of payload.runs) {
    const next: ScoreRun = {
      ...run,
      playerName: owner,
      imported: true,
      percent: 0,
      notesHit: 0,
      totalNotes: 0,
      maxCombo: 0,
      spPhrasesHit: 0,
      spPhrasesTotal: 0,
      avgMultiplier: 0,
      isFullCombo: false,
      isHighScore: false,
      notesMissed: 0,
      overstrums: 0,
      ghostInputs: 0,
      spUses: 0,
      timeInSp: 0,
      enginePreset: "",
      modifiersUsed: false,
    };
    if (insertScoreRun(next)) imported += 1;
    else skipped += 1;
  }
  return {
    imported,
    skipped,
    eventName: payload.eventName,
    exportedAt: payload.exportedAt,
  };
}
