import type { Instrument } from "../types.js";

export type CapGroup = {
  id: string;
  label: string;
  instruments: readonly string[];
};

/** Admin cap rows. Guitar/bass of the same hardware share one −/+ cap. */
export const CAP_GROUPS: readonly CapGroup[] = [
  {
    id: "FiveFret",
    label: "5-fret guitar / bass",
    instruments: ["FiveFretGuitar", "FiveFretBass"],
  },
  {
    id: "SixFret",
    label: "6-fret guitar / bass",
    instruments: ["SixFretGuitar", "SixFretBass"],
  },
  {
    id: "ProGuitar",
    label: "Pro guitar / bass",
    instruments: ["ProGuitar_17", "ProBass_17", "ProGuitar_22", "ProBass_22"],
  },
  { id: "FiveFretRhythm", label: "5-fret rhythm", instruments: ["FiveFretRhythm"] },
  { id: "FiveFretCoop", label: "5-fret coop", instruments: ["FiveFretCoop"] },
  { id: "Keys", label: "Keys", instruments: ["Keys"] },
  { id: "ProKeys", label: "Pro keys", instruments: ["ProKeys"] },
  { id: "FourLaneDrums", label: "4-lane drums", instruments: ["FourLaneDrums"] },
  { id: "ProDrums", label: "Pro drums", instruments: ["ProDrums"] },
  { id: "FiveLaneDrums", label: "5-lane drums", instruments: ["FiveLaneDrums"] },
  { id: "EliteDrums", label: "Elite drums", instruments: ["EliteDrums"] },
  { id: "Vocals", label: "Vocals", instruments: ["Vocals"] },
  { id: "Harmony", label: "Harmony", instruments: ["Harmony"] },
];

const INSTRUMENT_GROUP = new Map<string, string>();
for (const group of CAP_GROUPS) {
  for (const instrument of group.instruments) {
    INSTRUMENT_GROUP.set(instrument, group.id);
  }
}

export function capGroupId(instrument: string): string {
  return INSTRUMENT_GROUP.get(instrument) ?? instrument;
}

export function capGroupFor(instrument: string): CapGroup | undefined {
  const id = capGroupId(instrument);
  return CAP_GROUPS.find((group) => group.id === id);
}

/** Shared slot count for an instrument, including legacy per-instrument keys. */
export function capForInstrument(
  instrument: Instrument | string,
  caps: Record<string, number>,
): number {
  const group = capGroupFor(instrument);
  if (!group) return Number(caps[instrument]) || 0;
  if (caps[group.id] != null) {
    return Math.max(0, Number(caps[group.id]) || 0);
  }
  return group.instruments.reduce(
    (sum, member) => sum + (Number(caps[member]) || 0),
    0,
  );
}

export function countUsed(
  used: Map<string, number>,
  instrument: Instrument | string,
): number {
  return used.get(capGroupId(instrument)) ?? 0;
}

export function addUsed(
  used: Map<string, number>,
  instrument: Instrument | string,
): void {
  const key = capGroupId(instrument);
  used.set(key, (used.get(key) ?? 0) + 1);
}
