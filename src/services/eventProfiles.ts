import { INSTRUMENTS, type Difficulty, type Instrument, type InstrumentCaps, type PlaySet, type QueueRequest } from "../types.js";
import { capForInstrument } from "./caps.js";
import { songOffersInstrument, type SongParts } from "./songParts.js";

export type VenueProfileSlot = {
  slotId: string;
  name: string;
  instrument: Instrument;
};

export type SetPlayerPayload = {
  id: string;
  name: string;
  songHash: string;
  instrument: Instrument;
  difficulty: Difficulty;
  slotId: string;
  isBot: boolean;
  isSongMaster: boolean;
};

const SLOT_SLUG: Partial<Record<Instrument, string>> = {
  FiveFretGuitar: "guitar",
  FiveFretBass: "bass",
  FiveFretRhythm: "rhythm",
  FiveFretCoop: "coop",
  SixFretGuitar: "sixguitar",
  SixFretBass: "sixbass",
  Keys: "keys",
  ProKeys: "prokeys",
  FourLaneDrums: "drums",
  ProDrums: "prodrums",
  FiveLaneDrums: "drums5",
  EliteDrums: "elite",
  ProGuitar_17: "proguitar",
  ProBass_17: "probass",
  Vocals: "mic",
};

const GUITAR_PARTS: Instrument[] = [
  "FiveFretGuitar",
  "FiveFretRhythm",
  "FiveFretCoop",
];

export const TEST_BOT_PARTS: { instrument: Instrument; name: string }[] = [
  { instrument: "FiveFretGuitar", name: "Bot Guitar" },
  { instrument: "FiveFretBass", name: "Bot Bass" },
  { instrument: "FourLaneDrums", name: "Bot Drums" },
  { instrument: "Vocals", name: "Bot Vocals" },
];

export function venueSlotsFromCaps(caps: InstrumentCaps): VenueProfileSlot[] {
  const slots: VenueProfileSlot[] = [];
  for (const instrument of INSTRUMENTS) {
    if (instrument === "Harmony") continue;
    const slug = SLOT_SLUG[instrument];
    if (!slug) continue;
    const cap = venueSlotCount(instrument, caps);
    if (cap <= 0) continue;
    for (let i = 1; i <= cap; i++) {
      const id = `${slug}_${String(i).padStart(2, "0")}`;
      slots.push({
        slotId: id,
        name: id,
        instrument,
      });
    }
  }
  return slots;
}

function venueSlotCount(instrument: Instrument, caps: InstrumentCaps): number {
  if (caps[instrument] != null) {
    return Math.max(0, Math.floor(Number(caps[instrument]) || 0));
  }
  if (!isPrimaryVenueInstrument(instrument)) return 0;
  return Math.max(0, Math.floor(capForInstrument(instrument, caps)));
}

function isPrimaryVenueInstrument(instrument: Instrument): boolean {
  switch (instrument) {
    case "FiveFretGuitar":
    case "SixFretGuitar":
    case "ProGuitar_17":
    case "Keys":
    case "ProKeys":
    case "FourLaneDrums":
    case "ProDrums":
    case "FiveLaneDrums":
    case "EliteDrums":
    case "Vocals":
      return true;
    default:
      return false;
  }
}

export function songHasInstrument(
  instruments: string[] | undefined,
  instrument: Instrument,
): boolean {
  if (!instruments || instruments.length === 0) return true;
  if (instruments.includes(instrument)) return true;
  const drums = new Set([
    "FourLaneDrums",
    "ProDrums",
    "FiveLaneDrums",
    "EliteDrums",
  ]);
  if (drums.has(instrument) && instruments.some((item) => drums.has(item))) {
    return true;
  }
  const vocals = new Set(["Vocals", "Harmony"]);
  if (vocals.has(instrument) && instruments.some((item) => vocals.has(item))) {
    return true;
  }
  return false;
}

function slotPool(
  instrument: Instrument,
  slots: VenueProfileSlot[],
): VenueProfileSlot[] {
  if (GUITAR_PARTS.includes(instrument)) {
    return slots.filter((slot) => slot.instrument === "FiveFretGuitar");
  }
  if (instrument === "FiveFretBass") {
    const bass = slots.filter((slot) => slot.instrument === "FiveFretBass");
    if (bass.length > 0) return bass;
    return slots.filter((slot) => slot.instrument === "FiveFretGuitar");
  }
  if (instrument === "Vocals" || instrument === "Harmony") {
    return slots.filter((slot) => slot.instrument === "Vocals");
  }
  if (instrument === "SixFretBass") {
    const bass = slots.filter((slot) => slot.instrument === "SixFretBass");
    if (bass.length > 0) return bass;
    return slots.filter((slot) => slot.instrument === "SixFretGuitar");
  }
  if (instrument === "ProBass_17") {
    const bass = slots.filter((slot) => slot.instrument === "ProBass_17");
    if (bass.length > 0) return bass;
    return slots.filter((slot) => slot.instrument === "ProGuitar_17");
  }
  return slots.filter((slot) => slot.instrument === instrument);
}

export function claimVenueSlot(
  instrument: Instrument,
  slots: VenueProfileSlot[],
  used: Set<string>,
): VenueProfileSlot | undefined {
  return slotPool(instrument, slots).find((slot) => !used.has(slot.slotId));
}

export function canClaimVenueSlot(
  instrument: Instrument,
  occupied: Instrument[],
  caps: InstrumentCaps,
): boolean {
  const slots = venueSlotsFromCaps(caps);
  const used = new Set<string>();
  for (const taken of occupied) {
    const slot = claimVenueSlot(taken, slots, used);
    if (slot) used.add(slot.slotId);
  }
  return Boolean(claimVenueSlot(instrument, slots, used));
}

export function openVenueParts(
  occupied: Instrument[],
  caps: InstrumentCaps,
): { openParts: Instrument[]; slotsOpen: number } {
  const slots = venueSlotsFromCaps(caps);
  const used = new Set<string>();
  for (const taken of occupied) {
    const slot = claimVenueSlot(taken, slots, used);
    if (slot) used.add(slot.slotId);
  }
  const openParts = INSTRUMENTS.filter((instrument) => {
    const claimed = new Set(used);
    return Boolean(claimVenueSlot(instrument, slots, claimed));
  });
  return {
    openParts,
    slotsOpen: slots.filter((slot) => !used.has(slot.slotId)).length,
  };
}

export function openJoinParts(
  occupied: Instrument[],
  caps: InstrumentCaps,
  song?: SongParts,
): { openParts: Instrument[]; slotsOpen: number } {
  const { openParts: venueOpen } = openVenueParts(occupied, caps);
  const openParts = song
    ? venueOpen.filter((part) => songOffersInstrument(song, part))
    : venueOpen;
  const slots = venueSlotsFromCaps(caps);
  const used = new Set<string>();
  for (const taken of occupied) {
    const slot = claimVenueSlot(taken, slots, used);
    if (slot) used.add(slot.slotId);
  }
  let slotsOpen = 0;
  const claimed = new Set(used);
  for (const part of openParts) {
    for (;;) {
      const slot = claimVenueSlot(part, slots, claimed);
      if (!slot) break;
      claimed.add(slot.slotId);
      slotsOpen += 1;
    }
  }
  return { openParts, slotsOpen };
}

function listedParts(instruments: string[] | undefined, parts: Instrument[]): number {
  if (!instruments || instruments.length === 0) return 1;
  return parts.filter((part) => songHasInstrument(instruments, part)).length;
}

function songSeats(
  instrument: Instrument,
  instruments: string[] | undefined,
  vocalsCount?: number,
): number {
  switch (instrument) {
    case "FiveFretGuitar":
      return listedParts(instruments, GUITAR_PARTS);
    case "FiveFretBass":
      return listedParts(instruments, ["FiveFretBass"]);
    case "FourLaneDrums":
      return listedParts(instruments, ["FourLaneDrums"]);
    case "Vocals":
      if (vocalsCount != null && Number.isFinite(vocalsCount)) {
        return Math.max(0, Math.floor(vocalsCount));
      }
      if (!instruments || instruments.length === 0) return 1;
      if (instruments.includes("Harmony")) return 3;
      return instruments.includes("Vocals") || songHasInstrument(instruments, "Vocals")
        ? 1
        : 0;
    default:
      return listedParts(instruments, [instrument]);
  }
}

function occupiedFamilyCount(
  players: SetPlayerPayload[],
  botPart: Instrument,
): number {
  return players.filter((player) => occupiesTestPart(player.instrument, botPart))
    .length;
}

export function buildSetPlayers(
  set: PlaySet,
  requests: QueueRequest[],
  caps: InstrumentCaps,
  addTestBots: boolean,
  songInstruments?: string[],
  vocalsCount?: number,
): SetPlayerPayload[] {
  const slots = venueSlotsFromCaps(caps);
  const used = new Set<string>();
  const members = requests
    .filter((request) => set.playerIds.includes(request.id))
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

  const players: SetPlayerPayload[] = [];

  for (const [index, request] of members.entries()) {
    const slot = claimVenueSlot(request.instrument, slots, used);
    if (!slot) continue;
    used.add(slot.slotId);
    players.push({
      id: request.id,
      name: request.name,
      songHash: request.songHash,
      instrument: request.instrument,
      difficulty: request.difficulty,
      slotId: slot.slotId,
      isBot: false,
      isSongMaster: index === 0,
    });
  }

  if (addTestBots) {
    for (const part of TEST_BOT_PARTS) {
      if (!songHasInstrument(songInstruments, part.instrument)) continue;
      const remaining = Math.max(
        0,
        songSeats(part.instrument, songInstruments, vocalsCount) -
          occupiedFamilyCount(players, part.instrument),
      );
      for (let i = 0; i < remaining; i++) {
        const slot = claimVenueSlot(part.instrument, slots, used);
        if (!slot) break;
        used.add(slot.slotId);
        players.push({
          id: `bot:${slot.slotId}`,
          name: part.name,
          songHash: set.songHash,
          instrument: part.instrument,
          difficulty: "Expert",
          slotId: slot.slotId,
          isBot: true,
          isSongMaster: false,
        });
      }
    }
  }

  return players;
}

function occupiesTestPart(human: Instrument, botPart: Instrument): boolean {
  switch (botPart) {
    case "FiveFretGuitar":
      return [
        "FiveFretGuitar",
        "SixFretGuitar",
        "FiveFretRhythm",
        "FiveFretCoop",
        "ProGuitar_17",
      ].includes(human);
    case "FiveFretBass":
      return ["FiveFretBass", "SixFretBass", "ProBass_17"].includes(human);
    case "FourLaneDrums":
      return [
        "FourLaneDrums",
        "ProDrums",
        "FiveLaneDrums",
        "EliteDrums",
      ].includes(human);
    case "Vocals":
      return human === "Vocals" || human === "Harmony";
    default:
      return human === botPart;
  }
}
