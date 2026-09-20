import { INSTRUMENTS, type Difficulty, type Instrument, type InstrumentCaps, type PlaySet, type QueueRequest } from "../types.js";

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

export function venueSlotsFromCaps(caps: InstrumentCaps): VenueProfileSlot[] {
  const slots: VenueProfileSlot[] = [];
  for (const instrument of INSTRUMENTS) {
    const cap = Math.max(0, Math.floor(Number(caps[instrument] ?? 0)));
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

export function buildSetPlayers(
  set: PlaySet,
  requests: QueueRequest[],
  caps: InstrumentCaps,
  addTestBots: boolean,
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
    for (const slot of slots) {
      if (used.has(slot.slotId)) continue;
      used.add(slot.slotId);
      players.push({
        id: `bot:${slot.slotId}`,
        name: `Bot ${slot.name}`,
        songHash: set.songHash,
        instrument: slot.instrument,
        difficulty: "Expert",
        slotId: slot.slotId,
        isBot: true,
        isSongMaster: false,
      });
    }
  }

  return players;
}
