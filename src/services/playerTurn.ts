import { getSong, listRequests, listSets } from "../db.js";
import type { PlaySet, QueueRequest } from "../types.js";

const readyIds = new Set<string>();

export type PlayerTurn = {
  active: boolean;
  yourTurn: boolean;
  ready: boolean;
  requestId: string | null;
  setId: string | null;
  songHash: string | null;
  songName: string;
  songArtist: string;
  instrument: string | null;
  difficulty: string | null;
  mic: number | null;
  micCount: number;
  status: "idle" | "waiting" | "on_deck" | "now_playing";
};

export function isMicInstrument(instrument: string | null | undefined): boolean {
  return instrument === "Vocals" || instrument === "Harmony";
}

export function emptyPlayerTurn(): PlayerTurn {
  return {
    active: false,
    yourTurn: false,
    ready: false,
    requestId: null,
    setId: null,
    songHash: null,
    songName: "",
    songArtist: "",
    instrument: null,
    difficulty: null,
    mic: null,
    micCount: 0,
    status: "idle",
  };
}

export function assignMics(
  players: Array<{ id: string; instrument: string; createdAt: number }>,
): Map<string, number> {
  const mics = new Map<string, number>();
  const vocalists = players
    .filter((player) => isMicInstrument(player.instrument))
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  vocalists.forEach((player, index) => {
    mics.set(player.id, index + 1);
  });
  return mics;
}

export function isActiveQueueStatus(status: string): boolean {
  return status === "waiting" || status === "in_set" || status === "playing";
}

export function selectMicRequest(
  mine: QueueRequest[],
  nowPlaying: PlaySet | null,
  onDeck: PlaySet | null,
): QueueRequest | null {
  const mics = mine.filter(
    (request) =>
      isMicInstrument(request.instrument) && isActiveQueueStatus(request.status),
  );
  if (mics.length === 0) return null;

  const seated = (set: PlaySet | null) =>
    set
      ? mics.find(
          (request) =>
            set.playerIds.includes(request.id) || request.setId === set.id,
        )
      : undefined;

  return seated(nowPlaying) ?? seated(onDeck) ?? mics.sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  )[0] ?? null;
}

export function isYourTurn(
  request: QueueRequest | null,
  nowPlaying: PlaySet | null,
  onDeck: PlaySet | null,
  yargState: string,
): boolean {
  if (!request) return false;
  if (
    onDeck &&
    (onDeck.playerIds.includes(request.id) || request.setId === onDeck.id)
  ) {
    return true;
  }
  if (
    nowPlaying &&
    (nowPlaying.playerIds.includes(request.id) || request.setId === nowPlaying.id)
  ) {
    return yargState !== "playing" && yargState !== "score";
  }
  return false;
}

export function listReadyIds(): string[] {
  return [...readyIds];
}

export function isRequestReady(id: string): boolean {
  return readyIds.has(id);
}

export function markRequestReady(id: string): void {
  if (id) readyIds.add(id);
}

export function forgetReady(id: string): void {
  readyIds.delete(id);
}

export function forgetReadyMany(ids: Iterable<string>): void {
  for (const id of ids) readyIds.delete(id);
}

export function clearAllReady(): void {
  readyIds.clear();
}

function songPlayers(songHash: string, set: PlaySet | null): QueueRequest[] {
  const all = listRequests().filter(
    (request) =>
      isActiveQueueStatus(request.status) && request.songHash === songHash,
  );
  if (!set) return all;
  const seated = new Set(set.playerIds);
  const members = all.filter(
    (request) => seated.has(request.id) || request.setId === set.id,
  );
  return members.length > 0 ? members : all;
}

export function buildPlayerTurn(clientIp: string, yargState: string): PlayerTurn {
  const ip = clientIp.trim();
  const mine = ip
    ? listRequests().filter((request) => request.clientIp === ip)
    : [];
  const nowPlaying =
    listSets().find((set) => set.status === "now_playing") ?? null;
  const onDeck = listSets().find((set) => set.status === "on_deck") ?? null;
  const request = selectMicRequest(mine, nowPlaying, onDeck);
  if (!request) return emptyPlayerTurn();

  const featured =
    nowPlaying &&
    (nowPlaying.playerIds.includes(request.id) || request.setId === nowPlaying.id)
      ? nowPlaying
      : onDeck &&
          (onDeck.playerIds.includes(request.id) || request.setId === onDeck.id)
        ? onDeck
        : null;
  const band = songPlayers(request.songHash, featured);
  const mics = assignMics(band);
  const song = getSong(request.songHash);
  const status: PlayerTurn["status"] = featured
    ? featured.status === "now_playing"
      ? "now_playing"
      : "on_deck"
    : "waiting";

  return {
    active: true,
    yourTurn: isYourTurn(request, nowPlaying, onDeck, yargState),
    ready: isRequestReady(request.id),
    requestId: request.id,
    setId: featured?.id ?? request.setId,
    songHash: request.songHash,
    songName: song?.name ?? featured?.songName ?? "",
    songArtist: song?.artist ?? featured?.songArtist ?? "",
    instrument: request.instrument,
    difficulty: request.difficulty,
    mic: mics.get(request.id) ?? null,
    micCount: mics.size,
    status,
  };
}
