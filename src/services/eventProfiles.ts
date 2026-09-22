import { INSTRUMENTS, type Difficulty, type Instrument, type InstrumentCaps, type PlaySet, type QueueRequest } from "../types.js";
import { capForInstrument } from "./caps.js";

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

export const INSTRUMENT_LABELS: Record<Instrument, string> = {
  FiveFretGuitar: "Guitar",
  FiveFretBass: "Bass",
  FiveFretRhythm: "Rhythm",
  FiveFretCoop: "Co-op",
  Keys: "Keys",
  ProKeys: "Pro Keys",
  FourLaneDrums: "Drums",
  ProDrums: "Pro Drums",
  FiveLaneDrums: "Five-lane Drums",
  EliteDrums: "Elite Drums",
  Vocals: "Vocals",
  Harmony: "Harmony",
};

export const TEST_BOT_PARTS: { instrument: Instrument; name: string }[] = [
  { instrument: "FiveFretGuitar", name: "Bot Guitar" },
  { instrument: "FiveFretBass", name: "Bot Bass" },
  { instrument: "FourLaneDrums", name: "Bot Drums" },
  { instrument: "Vocals", name: "Bot Vocals" },
];

export function venueSlotsFromCaps(caps: InstrumentCaps): VenueProfileSlot[] {
  const slots: VenueProfileSlot[] = [];
  for (const instrument of INSTRUMENTS) {
    const cap = venueSlotCount(instrument, caps);
    if (cap <= 0) continue;
    const label = INSTRUMENT_LABELS[instrument];
    for (let i = 1; i <= cap; i++) {
      slots.push({
        slotId: `${instrument}_${i}`,
        name: cap === 1 ? label : `${label} ${i}`,
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

export function buildSetPlayers(
  set: PlaySet,
  requests: QueueRequest[],
  caps: InstrumentCaps,
  addTestBots: boolean,
  songInstruments?: string[],
): SetPlayerPayload[] {
  const slots = venueSlotsFromCaps(caps);
  const used = new Set<string>();
  const members = requests
    .filter((request) => set.playerIds.includes(request.id))
    .sort((a, b) => a.createdAt - b.createdAt);

  const players: SetPlayerPayload[] = [];

  for (const [index, request] of members.entries()) {
    const slot =
      slots.find(
        (candidate) =>
          candidate.instrument === request.instrument && !used.has(candidate.slotId),
      ) ?? {
        slotId: `${request.instrument}_overflow_${request.id}`,
        name: INSTRUMENT_LABELS[request.instrument],
        instrument: request.instrument,
      };
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
    const humans = players.map((player) => player.instrument);
    for (const part of TEST_BOT_PARTS) {
      if (humans.some((human) => occupiesTestPart(human, part.instrument))) {
        continue;
      }
      if (!songHasInstrument(songInstruments, part.instrument)) continue;
      const slot =
        slots.find(
          (candidate) =>
            candidate.instrument === part.instrument && !used.has(candidate.slotId),
        ) ?? {
          slotId: `bot_${part.instrument}`,
          name: part.name.replace(/^Bot /, ""),
          instrument: part.instrument,
        };
      if (used.has(slot.slotId)) continue;
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
