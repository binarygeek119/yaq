import { DIFFICULTIES, type Difficulty } from "../types.js";

export type SongParts = {
  instruments?: string[];
  diffs?: Record<string, number>;
  chartDiffs?: Record<string, readonly string[]>;
};

/** Align YARG enum names (ProGuitar_17Fret, FiveFretCoopGuitar) with YAQ ids. */
export function canonicalPart(id: string): string {
  return id.replace(/CoopGuitar$/i, "Coop").replace(/_(\d+)Fret$/i, "_$1");
}

export function samePart(a: string, b: string): boolean {
  return canonicalPart(a).toLowerCase() === canonicalPart(b).toLowerCase();
}

export function songPartIds(song: SongParts): string[] {
  const parts = [...(song.instruments ?? [])];
  for (const key of Object.keys(song.diffs ?? {})) {
    if (!parts.includes(key)) parts.push(key);
  }
  for (const key of Object.keys(song.chartDiffs ?? {})) {
    if (!parts.includes(key)) parts.push(key);
  }
  return parts.filter((part) => part && part !== "Band");
}

export function parseDifficultyList(raw: unknown): Difficulty[] {
  if (!Array.isArray(raw)) return [];
  const wanted = new Set(
    raw
      .map((item) => String(item).trim())
      .filter(Boolean)
      .map((item) => item.toLowerCase()),
  );
  return DIFFICULTIES.filter((difficulty) => wanted.has(difficulty.toLowerCase()));
}

export function parseChartDiffs(raw: unknown): Record<string, Difficulty[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const chartDiffs: Record<string, Difficulty[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = String(key).trim();
    const diffs = parseDifficultyList(value);
    if (name && diffs.length > 0) chartDiffs[name] = diffs;
  }
  return chartDiffs;
}

export function parseChartDiffsFromSong(
  song: Record<string, unknown>,
): Record<string, Difficulty[]> {
  const chartDiffs = {
    ...parseChartDiffs(song.chartDiffs),
    ...parseChartDiffs(song.chart_diffs),
  };
  if (!Array.isArray(song.instruments)) return chartDiffs;
  for (const item of song.instruments) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name = String(row.name ?? row.instrument ?? "").trim();
    const diffs = parseDifficultyList(row.difficulties ?? row.chartDiffs);
    if (name && diffs.length > 0) chartDiffs[name] = diffs;
  }
  return chartDiffs;
}

export function playableInstruments<T extends string>(
  song: SongParts,
  catalog: readonly T[],
): T[] {
  const parts = songPartIds(song);
  if (parts.length === 0) return [...catalog];
  return catalog.filter((instrument) =>
    parts.some((part) => samePart(part, instrument)),
  );
}

export function playableDifficulties<T extends string>(
  song: SongParts,
  instrument: string,
  catalog: readonly T[],
): T[] {
  const chartDiffs = song.chartDiffs ?? {};
  let listed: readonly string[] | undefined;
  for (const [key, diffs] of Object.entries(chartDiffs)) {
    if (samePart(key, instrument) && diffs.length > 0) {
      listed = diffs;
      break;
    }
  }
  if (!listed) return [...catalog];
  const wanted = new Set(listed.map((item) => item.toLowerCase()));
  return catalog.filter((difficulty) => wanted.has(difficulty.toLowerCase()));
}

export function songOffersInstrument(
  song: SongParts,
  instrument: string,
): boolean {
  const parts = songPartIds(song);
  if (parts.length === 0) return true;
  return parts.some((part) => samePart(part, instrument));
}

export function songOffersDifficulty(
  song: SongParts,
  instrument: string,
  difficulty: string,
): boolean {
  return playableDifficulties(song, instrument, DIFFICULTIES).includes(
    difficulty as Difficulty,
  );
}

export function pickAvailable<T extends string>(
  options: readonly T[],
  preferred: T,
  fallback?: T,
): T {
  if (options.includes(preferred)) return preferred;
  if (fallback && options.includes(fallback)) return fallback;
  return options[0] ?? preferred;
}

export function pickAvailableDifficulty<T extends string>(
  options: readonly T[],
  preferred: T,
): T {
  if (options.includes(preferred)) return preferred;
  if (options.includes("Expert" as T)) return "Expert" as T;
  return options[options.length - 1] ?? preferred;
}
