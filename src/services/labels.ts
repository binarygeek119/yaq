/** Guest-facing instrument name. Keeps YARG enum values on the wire. */
export function instrumentLabel(instrument: string): string {
  return instrument
    .replace(/_(?:17|22)(?:Fret)?$/i, "")
    .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type SongPartChip = {
  instrument: string;
  label: string;
  intensity: number | null;
};

const PART_ORDER = [
  "FiveFretGuitar",
  "FiveFretBass",
  "FiveFretRhythm",
  "FiveFretCoop",
  "SixFretGuitar",
  "SixFretBass",
  "ProGuitar_17",
  "ProGuitar_17Fret",
  "ProGuitar_22",
  "ProGuitar_22Fret",
  "ProBass_17",
  "ProBass_17Fret",
  "ProBass_22",
  "ProBass_22Fret",
  "FourLaneDrums",
  "ProDrums",
  "FiveLaneDrums",
  "EliteDrums",
  "Keys",
  "ProKeys",
  "Vocals",
  "Harmony",
  "Band",
];

function intensityFor(
  instrument: string,
  diffs: Record<string, number>,
): number | null {
  if (diffs[instrument] != null && Number.isFinite(diffs[instrument])) {
    return diffs[instrument];
  }
  const want = instrument.replace(/_(?:17|22)(?:Fret)?$/i, "");
  for (const [key, value] of Object.entries(diffs)) {
    if (key.replace(/_(?:17|22)(?:Fret)?$/i, "") === want) return value;
  }
  return null;
}

/** Parts the song has, with 0–6 intensity when YAQ already stored it. */
export function songPartChips(song: {
  instruments?: string[];
  diffs?: Record<string, number>;
}): SongPartChip[] {
  const diffs = song.diffs ?? {};
  const parts = [...(song.instruments ?? [])];
  for (const key of Object.keys(diffs)) {
    if (!parts.includes(key)) parts.push(key);
  }
  const rank = (id: string) => {
    const index = PART_ORDER.indexOf(id);
    return index === -1 ? PART_ORDER.length : index;
  };
  parts.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return parts.map((instrument) => ({
    instrument,
    label: instrumentLabel(instrument),
    intensity: intensityFor(instrument, diffs),
  }));
}
