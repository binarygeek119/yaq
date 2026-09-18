import { DIFFICULTIES, INSTRUMENTS, type Difficulty, type Instrument } from "../types.js";

export type InstrumentDefaults = Partial<Record<Instrument, Difficulty>>;

export function parseInstrumentDefaults(raw: unknown): InstrumentDefaults {
  let source = raw;
  if (typeof raw === "string") {
    try {
      source = JSON.parse(raw) as unknown;
    } catch {
      return {};
    }
  }
  if (!source || typeof source !== "object") return {};
  const next: InstrumentDefaults = {};
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (!INSTRUMENTS.includes(key as Instrument)) continue;
    if (typeof value !== "string" || !DIFFICULTIES.includes(value as Difficulty)) {
      continue;
    }
    next[key as Instrument] = value as Difficulty;
  }
  return next;
}

export function mergeInstrumentDefaults(
  current: InstrumentDefaults | undefined,
  patch: InstrumentDefaults | undefined,
): InstrumentDefaults {
  return { ...(current ?? {}), ...(patch ?? {}) };
}
