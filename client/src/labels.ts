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

const INTENSITY_FAMILIES = [
  [
    "FiveFretGuitar",
    "ProGuitar_17",
    "ProGuitar_17Fret",
    "ProGuitar_22",
    "ProGuitar_22Fret",
  ],
  [
    "FiveFretBass",
    "ProBass_17",
    "ProBass_17Fret",
    "ProBass_22",
    "ProBass_22Fret",
  ],
  ["Keys", "ProKeys"],
  ["FourLaneDrums", "ProDrums", "FiveLaneDrums", "EliteDrums"],
  ["Vocals", "Harmony"],
];

function lookupDiff(
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

function intensityFor(
  instrument: string,
  diffs: Record<string, number>,
): number | null {
  const direct = lookupDiff(instrument, diffs);
  if (direct != null) return direct;
  const key = partKey(instrument);
  for (const family of INTENSITY_FAMILIES) {
    if (!family.some((id) => partKey(id) === key)) continue;
    for (const id of family) {
      const value = lookupDiff(id, diffs);
      if (value != null) return value;
    }
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

export type ClassicRingStyle = {
  active: boolean;
  fill: number;
  tone: "white" | "red";
  number: string;
};

/** YARG Classic DifficultyRing fill: 5-segment arc, red at intensity 6. */
export function classicRingStyle(
  present: boolean,
  intensity: number | null,
): ClassicRingStyle {
  if (!present) {
    return { active: false, fill: 0, tone: "white", number: "" };
  }
  const n = intensity == null ? 0 : intensity;
  if (n < 1) return { active: true, fill: 0, tone: "white", number: "" };
  if (n > 5) {
    return {
      active: true,
      fill: 1,
      tone: "red",
      number: n > 6 ? String(n) : "",
    };
  }
  return {
    active: true,
    fill: (1 + ((n - 1) % 5)) / 5,
    tone: "white",
    number: "",
  };
}

export type DifficultyRingSlot = {
  instrument: string;
  icon: string;
  abbrev: string;
  label: string;
  present: boolean;
  intensity: number | null;
};

function partKey(id: string): string {
  return id.replace(/_(?:17|22)(?:Fret)?$/i, "").toLowerCase();
}

function hasPart(parts: string[], ...ids: string[]): boolean {
  const keys = new Set(parts.map(partKey));
  return ids.some((id) => keys.has(partKey(id)));
}

function slot(
  parts: string[],
  diffs: Record<string, number>,
  instrument: string,
  icon: string,
  abbrev: string,
  present = hasPart(parts, instrument),
): DifficultyRingSlot {
  return {
    instrument,
    icon,
    abbrev,
    label: instrumentLabel(instrument),
    present,
    intensity: present ? intensityFor(instrument, diffs) : null,
  };
}

function firstPresent(
  parts: string[],
  diffs: Record<string, number>,
  choices: Array<[string, string, string]>,
  fallback: [string, string, string],
): DifficultyRingSlot {
  for (const [instrument, icon, abbrev] of choices) {
    if (hasPart(parts, instrument)) {
      return slot(parts, diffs, instrument, icon, abbrev, true);
    }
  }
  return slot(parts, diffs, fallback[0], fallback[1], fallback[2]);
}

/** Same 10-slot grid as YARG Classic music-library sidebar rings. */
export function songDifficultyRings(song: {
  instruments?: string[];
  diffs?: Record<string, number>;
}): DifficultyRingSlot[] {
  const diffs = song.diffs ?? {};
  const parts = [...(song.instruments ?? [])];
  for (const key of Object.keys(diffs)) {
    if (!parts.includes(key)) parts.push(key);
  }

  const vocalsId =
    !hasPart(parts, "Vocals") && hasPart(parts, "Harmony")
      ? "Harmony"
      : "Vocals";

  return [
    slot(parts, diffs, "FiveFretGuitar", "guitar", "G"),
    slot(parts, diffs, "FiveFretBass", "bass", "B"),
    firstPresent(
      parts,
      diffs,
      [
        ["FiveLaneDrums", "ghDrums", "5"],
        ["ProDrums", "realDrums", "D"],
      ],
      ["FourLaneDrums", "drums", "D"],
    ),
    slot(parts, diffs, "Keys", "keys", "K"),
    slot(
      parts,
      diffs,
      vocalsId,
      hasPart(parts, "Harmony") ? "harmVocals" : "vocals",
      "V",
    ),
    firstPresent(
      parts,
      diffs,
      [
        ["ProGuitar_17", "realGuitar", "P"],
        ["ProGuitar_17Fret", "realGuitar", "P"],
        ["ProGuitar_22", "realGuitar", "P"],
        ["ProGuitar_22Fret", "realGuitar", "P"],
      ],
      ["FiveFretCoop", "guitarCoop", "C"],
    ),
    firstPresent(
      parts,
      diffs,
      [
        ["ProBass_17", "realBass", "P"],
        ["ProBass_17Fret", "realBass", "P"],
        ["ProBass_22", "realBass", "P"],
        ["ProBass_22Fret", "realBass", "P"],
      ],
      ["FiveFretRhythm", "rhythm", "R"],
    ),
    firstPresent(
      parts,
      diffs,
      [
        ["SixFretGuitar", "guitar6", "6"],
        ["SixFretBass", "bass6", "6"],
        ["SixFretRhythm", "rhythm6", "6"],
        ["SixFretCoop", "coop6", "6"],
      ],
      ["EliteDrums", "eliteDrums", "E"],
    ),
    slot(parts, diffs, "ProKeys", "realKeys", "K"),
    slot(parts, diffs, "Band", "band", "★"),
  ];
}

export type InstrumentSortId =
  | "FiveFretGuitar"
  | "FiveFretBass"
  | "Drums"
  | "Keys"
  | "Vocals"
  | "ProGuitar"
  | "ProBass"
  | "SixFret"
  | "ProKeys"
  | "Band";

/** Same 10 sidebar slots as the guest-card rings; used as sort keys. */
export const INSTRUMENT_SORT_SLOTS: {
  id: InstrumentSortId;
  icon: string;
  label: string;
}[] = [
  { id: "FiveFretGuitar", icon: "guitar", label: "Five Fret Guitar" },
  { id: "FiveFretBass", icon: "bass", label: "Five Fret Bass" },
  { id: "Drums", icon: "drums", label: "Drums" },
  { id: "Keys", icon: "keys", label: "Keys" },
  { id: "Vocals", icon: "vocals", label: "Vocals" },
  { id: "ProGuitar", icon: "realGuitar", label: "Pro Guitar" },
  { id: "ProBass", icon: "realBass", label: "Pro Bass" },
  { id: "SixFret", icon: "guitar6", label: "6-Fret / Elite Drums" },
  { id: "ProKeys", icon: "realKeys", label: "Pro Keys" },
  { id: "Band", icon: "band", label: "Band" },
];

const INSTRUMENT_SORT_INDEX: Record<InstrumentSortId, number> = {
  FiveFretGuitar: 0,
  FiveFretBass: 1,
  Drums: 2,
  Keys: 3,
  Vocals: 4,
  ProGuitar: 5,
  ProBass: 6,
  SixFret: 7,
  ProKeys: 8,
  Band: 9,
};

export function instrumentSortValue(
  song: { instruments?: string[]; diffs?: Record<string, number> },
  id: InstrumentSortId,
): { present: boolean; intensity: number } {
  const slot = songDifficultyRings(song)[INSTRUMENT_SORT_INDEX[id]];
  return {
    present: Boolean(slot?.present),
    intensity: slot?.present && slot.intensity != null ? slot.intensity : -1,
  };
}
