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
