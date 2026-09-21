import { randomUUID } from "node:crypto";
import {
  getSettings,
  getSong,
  insertRequest,
  insertSet,
  listRequests,
  listSets,
  updateRequest,
  updateSet,
  getProfile,
  upsertProfile,
} from "../db.js";
import type {
  Difficulty,
  GuestProfile,
  Instrument,
  PlaySet,
  PublicQueueRequest,
  QueueBoardPlayer,
  QueueBoardSong,
  QueuePreview,
  QueueRequest,
} from "../types.js";
import { MAX_SET_PLAYERS } from "../types.js";
import { addUsed, capForInstrument, countUsed } from "./caps.js";
import { guestLabelForIp, normalizeClientIp } from "./ip.js";
import { upcomingSongs } from "./queueAlerts.js";
import { forgetReady, forgetReadyMany } from "./playerTurn.js";

let lastCreatedAt = 0;

function nextCreatedAt(): number {
  const now = Date.now();
  lastCreatedAt = now <= lastCreatedAt ? lastCreatedAt + 1 : now;
  return lastCreatedAt;
}

export type JoinQueueInput = {
  name: string;
  songHash: string;
  instrument: Instrument;
  difficulty?: Difficulty;
  clientIp: string;
};

function activeRequests(): QueueRequest[] {
  return listRequests().filter(
    (r) => r.status === "waiting" || r.status === "in_set" || r.status === "playing",
  );
}

export function normalizePlayerName(name: string): string {
  return name.trim().toLowerCase();
}

/** True when someone already has this song in the active queue. */
export function isExistingSong(songHash: string): boolean {
  return activeRequests().some((r) => r.songHash === songHash);
}

/** Oldest active request for a song is the song master. */
export function songMaster(songHash: string): QueueRequest | null {
  const group = activeRequests()
    .filter((r) => r.songHash === songHash)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  return group[0] ?? null;
}

export function playerKey(request: Pick<QueueRequest, "clientIp" | "name">): string {
  const ip = normalizeClientIp(request.clientIp);
  if (ip) return `ip:${ip}`;
  return `name:${normalizePlayerName(request.name)}`;
}

/** Distinct songs where this device IP is currently the master. */
export function masterSongCountForIp(clientIp: string): number {
  const ip = normalizeClientIp(clientIp);
  if (!ip) return 0;
  const key = `ip:${ip}`;
  const hashes = new Set(activeRequests().map((r) => r.songHash));
  let count = 0;
  for (const hash of hashes) {
    const master = songMaster(hash);
    if (master && playerKey(master) === key) count += 1;
  }
  return count;
}

/** Distinct songs where this guest name is currently the master. */
export function masterSongCount(name: string): number {
  const key = normalizePlayerName(name);
  if (!key) return 0;
  const hashes = new Set(activeRequests().map((r) => r.songHash));
  let count = 0;
  for (const hash of hashes) {
    const master = songMaster(hash);
    if (master && normalizePlayerName(master.name) === key) count += 1;
  }
  return count;
}

export function publicRequests(): PublicQueueRequest[] {
  return listRequests().map(({ clientIp: _ip, ...rest }) => rest);
}

export function buildGuestProfile(clientIp: string): GuestProfile {
  const ip = normalizeClientIp(clientIp);
  const stored = ip ? getProfile(ip) : null;
  const requestIds = ip
    ? activeRequests()
        .filter((r) => r.clientIp === ip)
        .map((r) => r.id)
    : [];
  return {
    ip,
    name: stored?.name || (ip ? guestLabelForIp(ip) : ""),
    instrument: stored?.instrument ?? "FiveFretGuitar",
    difficulty: stored?.difficulty ?? "Expert",
    instrumentDefaults: stored?.instrumentDefaults ?? {},
    photoUrl:
      stored?.photoExt && stored.photoRev
        ? `/api/profile/photo?v=${stored.photoRev}`
        : null,
    requestIds,
    started: masterSongCountForIp(ip),
    onboarded: Boolean(stored?.onboarded),
  };
}

function activeSets(): PlaySet[] {
  return listSets().filter(
    (s) => s.status === "on_deck" || s.status === "now_playing",
  );
}

export function getNowPlaying(): PlaySet | null {
  return listSets().find((s) => s.status === "now_playing") ?? null;
}

export function getOnDeck(): PlaySet | null {
  return (
    listSets().find((s) => s.status === "on_deck") ??
    null
  );
}

export function buildQueuePreview(set: PlaySet | null = getOnDeck()): QueuePreview {
  if (!set) {
    return {
      setId: null,
      songHash: null,
      songName: null,
      songArtist: null,
      players: [],
      following: null,
    };
  }
  const reqs = listRequests().filter((r) => set.playerIds.includes(r.id));
  return {
    setId: set.id,
    songHash: set.songHash,
    songName: set.songName,
    songArtist: set.songArtist,
    players: reqs.map((r) => ({
      id: r.id,
      name: r.name,
      instrument: r.instrument,
      difficulty: r.difficulty,
    })),
    following: followingQueueSong(set),
  };
}

function followingQueueSong(onDeck: PlaySet): QueuePreview["following"] {
  const upcoming = upcomingSongs(
    listRequests().map((request) => ({
      id: request.id,
      songHash: request.songHash,
      status: request.status,
      createdAt: request.createdAt,
    })),
    { songHash: onDeck.songHash, playerIds: onDeck.playerIds },
  );
  const next = upcoming[1];
  if (!next) return null;
  const song = getSong(next.songHash);
  const reqs = listRequests().filter((request) =>
    next.requestIds.includes(request.id),
  );
  return {
    songHash: next.songHash,
    songName: song?.name ?? "",
    songArtist: song?.artist ?? "",
    players: reqs.map((request) => ({
      id: request.id,
      name: request.name,
      instrument: request.instrument,
      difficulty: request.difficulty,
    })),
  };
}

function canTakeInstrument(
  instrument: Instrument,
  used: Map<string, number>,
  caps: Record<string, number>,
): boolean {
  const cap = capForInstrument(instrument, caps);
  if (cap <= 0) return false;
  return countUsed(used, instrument) < cap;
}

function canSeatPlayer(
  instrument: Instrument,
  used: Map<string, number>,
  caps: Record<string, number>,
  playerCount: number,
): boolean {
  if (playerCount >= MAX_SET_PLAYERS) return false;
  return canTakeInstrument(instrument, used, caps);
}

function usedFromRequests(reqs: Array<Pick<QueueRequest, "instrument">>): Map<string, number> {
  const used = new Map<string, number>();
  for (const req of reqs) addUsed(used, req.instrument);
  return used;
}

function hasOpenPart(
  used: Map<string, number>,
  caps: Record<string, number>,
  playerCount: number,
): boolean {
  if (playerCount >= MAX_SET_PLAYERS) return false;
  const instruments: Instrument[] = [
    "FiveFretGuitar",
    "FiveFretBass",
    "FiveFretRhythm",
    "FiveFretCoop",
    "SixFretGuitar",
    "SixFretBass",
    "Keys",
    "ProKeys",
    "FourLaneDrums",
    "ProDrums",
    "FiveLaneDrums",
    "EliteDrums",
    "ProGuitar_17",
    "ProBass_17",
    "Vocals",
    "Harmony",
  ];
  return instruments.some((instrument) =>
    canSeatPlayer(instrument, used, caps, playerCount),
  );
}

export function playersHaveOpenSlots(
  players: Array<Pick<QueueRequest, "instrument">>,
  caps: Record<string, number>,
): boolean {
  return hasOpenPart(usedFromRequests(players), caps, players.length);
}

function toBoardPlayer(req: QueueRequest): QueueBoardPlayer {
  return {
    id: req.id,
    name: req.name,
    instrument: req.instrument,
    difficulty: req.difficulty,
  };
}

function boardSongFromPlayers(
  players: QueueRequest[],
  status: QueueBoardSong["status"],
  setId: string | null,
  caps: Record<string, number>,
): QueueBoardSong | null {
  if (players.length === 0) return null;
  const sorted = [...players].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );
  const song = getSong(sorted[0].songHash);
  const used = usedFromRequests(sorted);
  const playerSlotsOpen = Math.max(0, MAX_SET_PLAYERS - sorted.length);
  return {
    songHash: sorted[0].songHash,
    songName: song?.name ?? "Unknown Song",
    songArtist: song?.artist ?? "Unknown Artist",
    status,
    setId,
    masterName: sorted[0].name,
    players: sorted.map(toBoardPlayer),
    playerSlotsOpen,
    joinable:
      status !== "now_playing" &&
      playerSlotsOpen > 0 &&
      hasOpenPart(used, caps, sorted.length),
  };
}

function packWaitingBands(
  waiting: QueueRequest[],
  caps: Record<string, number>,
): QueueRequest[][] {
  const remaining = [...waiting].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );
  const bands: QueueRequest[][] = [];
  while (remaining.length > 0) {
    const oldest = remaining[0];
    const sameSong = remaining.filter((r) => r.songHash === oldest.songHash);
    const used = new Map<string, number>();
    const band: QueueRequest[] = [];
    for (const req of sameSong) {
      if (!canSeatPlayer(req.instrument, used, caps, band.length)) continue;
      band.push(req);
      addUsed(used, req.instrument);
    }
    if (band.length === 0) band.push(oldest);
    bands.push(band);
    const taken = new Set(band.map((r) => r.id));
    for (let i = remaining.length - 1; i >= 0; i -= 1) {
      if (taken.has(remaining[i].id)) remaining.splice(i, 1);
    }
  }
  return bands;
}

function requestsForSet(set: PlaySet): QueueRequest[] {
  const byId = new Map(listRequests().map((r) => [r.id, r]));
  return set.playerIds
    .map((id) => byId.get(id))
    .filter((r): r is QueueRequest => Boolean(r))
    .filter(
      (r) =>
        r.status === "waiting" ||
        r.status === "in_set" ||
        r.status === "playing",
    );
}

export function buildQueueBoard(): QueueBoardSong[] {
  const caps = getSettings().instrumentCaps;
  const board: QueueBoardSong[] = [];
  const seated = new Set<string>();
  const now = getNowPlaying();
  if (now) {
    const players = requestsForSet(now);
    const card = boardSongFromPlayers(players, "now_playing", now.id, caps);
    if (card) board.push(card);
    for (const p of players) seated.add(p.id);
  }
  const onDeck = getOnDeck();
  if (onDeck) {
    const players = requestsForSet(onDeck);
    const card = boardSongFromPlayers(players, "on_deck", onDeck.id, caps);
    if (card) board.push(card);
    for (const p of players) seated.add(p.id);
  }
  const waiting = activeRequests().filter(
    (r) => r.status === "waiting" && !seated.has(r.id),
  );
  for (const band of packWaitingBands(waiting, caps)) {
    const card = boardSongFromPlayers(band, "waiting", null, caps);
    if (card) board.push(card);
  }
  return board;
}

function tryFillOnDeck(): void {
  const caps = getSettings().instrumentCaps;
  for (;;) {
    const onDeck = getOnDeck();
    if (!onDeck) return;
    const members = requestsForSet(onDeck);
    const used = usedFromRequests(members);
    if (members.length >= MAX_SET_PLAYERS) return;
    const next = listRequests()
      .filter(
        (r) => r.status === "waiting" && r.songHash === onDeck.songHash,
      )
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
      .find((r) => canSeatPlayer(r.instrument, used, caps, members.length));
    if (!next) return;
    updateSet(onDeck.id, { playerIds: [...onDeck.playerIds, next.id] });
    updateRequest(next.id, { setId: onDeck.id, status: "in_set" });
  }
}

/** Form as many on_deck sets as needed so there is always at most one on_deck waiting behind now_playing. */
export function formSets(): PlaySet[] {
  const caps = getSettings().instrumentCaps;
  tryFillOnDeck();
  const waiting = listRequests()
    .filter((r) => r.status === "waiting")
    .sort((a, b) => a.createdAt - b.createdAt);

  const existingOnDeck = getOnDeck();
  if (existingOnDeck) return activeSets();

  if (waiting.length === 0) return activeSets();

  // Prefer same-song groups that fill multiple slots.
  const bySong = new Map<string, QueueRequest[]>();
  for (const req of waiting) {
    const list = bySong.get(req.songHash) ?? [];
    list.push(req);
    bySong.set(req.songHash, list);
  }

  let chosen: QueueRequest[] | null = null;

  // Try oldest song first among multi-player compatible groups.
  const songOrder = [...bySong.entries()].sort(
    (a, b) => a[1][0].createdAt - b[1][0].createdAt,
  );

  for (const [, group] of songOrder) {
    const used = new Map<string, number>();
    const picked: QueueRequest[] = [];
    for (const req of group) {
      if (!canSeatPlayer(req.instrument, used, caps, picked.length)) continue;
      picked.push(req);
      addUsed(used, req.instrument);
    }
    if (picked.length >= 2) {
      chosen = picked;
      break;
    }
  }

  if (!chosen) {
    const oldest = waiting[0];
    if (!canTakeInstrument(oldest.instrument, new Map(), caps)) {
      // Instrument not configured — still allow solo so queue doesn't stall.
      chosen = [oldest];
    } else {
      // Try to fill more players on same song after oldest.
      const used = new Map<string, number>();
      addUsed(used, oldest.instrument);
      const picked = [oldest];
      for (const req of waiting) {
        if (req.id === oldest.id) continue;
        if (req.songHash !== oldest.songHash) continue;
        if (!canSeatPlayer(req.instrument, used, caps, picked.length)) continue;
        picked.push(req);
        addUsed(used, req.instrument);
      }
      chosen = picked;
    }
  }

  const song = getSong(chosen[0].songHash);
  const set: PlaySet = {
    id: randomUUID(),
    songHash: chosen[0].songHash,
    songName: song?.name ?? "Unknown Song",
    songArtist: song?.artist ?? "Unknown Artist",
    playerIds: chosen.map((c) => c.id),
    status: "on_deck",
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
  };

  insertSet(set);
  for (const req of chosen) {
    updateRequest(req.id, { setId: set.id, status: "in_set" });
  }

  return activeSets();
}

function tryAttachToOnDeck(request: QueueRequest): boolean {
  const caps = getSettings().instrumentCaps;
  const onDeck = getOnDeck();
  if (!onDeck || onDeck.songHash !== request.songHash) return false;

  const members = requestsForSet(onDeck);
  const used = usedFromRequests(members);
  if (!canSeatPlayer(request.instrument, used, caps, members.length)) {
    return false;
  }

  updateSet(onDeck.id, { playerIds: [...onDeck.playerIds, request.id] });
  updateRequest(request.id, { setId: onDeck.id, status: "in_set" });
  return true;
}

export function joinQueue(input: JoinQueueInput): QueueRequest {
  const song = getSong(input.songHash);
  if (!song) {
    throw new Error("Song not found");
  }
  const clientIp = normalizeClientIp(input.clientIp);
  if (!clientIp) throw new Error("Device address required");

  const stored = getProfile(clientIp);
  const name =
    input.name.trim().slice(0, 32) ||
    stored?.name ||
    guestLabelForIp(clientIp);
  const difficulty =
    input.difficulty ||
    stored?.instrumentDefaults[input.instrument] ||
    stored?.difficulty ||
    "Expert";

  upsertProfile({
    ip: clientIp,
    name,
    instrument: input.instrument,
    difficulty,
  });

  if (
    activeRequests().some(
      (r) => r.clientIp === clientIp && r.songHash === input.songHash,
    )
  ) {
    throw new Error("Already in this song");
  }

  const settings = getSettings();
  if (settings.songQueueCapEnabled && !isExistingSong(input.songHash)) {
    if (masterSongCountForIp(clientIp) >= settings.songQueueCap) {
      throw new Error("Song cap reached");
    }
  }

  const request: QueueRequest = {
    id: randomUUID(),
    name,
    songHash: input.songHash,
    instrument: input.instrument,
    difficulty,
    createdAt: nextCreatedAt(),
    setId: null,
    status: "waiting",
    clientIp,
  };
  insertRequest(request);
  if (!tryAttachToOnDeck(request)) {
    formSets();
  }
  return listRequests().find((r) => r.id === request.id) ?? request;
}

export function cancelRequest(id: string, clientIp?: string): void {
  const req = listRequests().find((r) => r.id === id);
  if (!req) return;
  if (req.status === "playing" || req.status === "done") return;
  if (clientIp !== undefined) {
    const ip = normalizeClientIp(clientIp);
    if (req.clientIp && req.clientIp !== ip) {
      throw new Error("Not your request");
    }
  }
  updateRequest(id, { status: "cancelled", setId: null });
  forgetReady(id);

  if (req.setId) {
    const set = listSets().find((s) => s.id === req.setId);
    if (set && set.status === "on_deck") {
      const remaining = set.playerIds.filter((pid) => {
        if (pid === id) return false;
        const member = listRequests().find((r) => r.id === pid);
        return Boolean(
          member &&
            (member.status === "waiting" ||
              member.status === "in_set" ||
              member.status === "playing"),
        );
      });
      if (remaining.length === 0) {
        updateSet(set.id, {
          status: "skipped",
          finishedAt: Date.now(),
          playerIds: [],
        });
      } else {
        updateSet(set.id, { playerIds: remaining });
      }
    }
  }
  formSets();
}

export function leaveEvent(clientIp: string): number {
  const ip = normalizeClientIp(clientIp);
  if (!ip) throw new Error("Device address required");
  const ids = listRequests()
    .filter(
      (r) =>
        r.clientIp === ip &&
        r.status !== "playing" &&
        r.status !== "done" &&
        r.status !== "cancelled",
    )
    .map((r) => r.id);
  for (const id of ids) {
    cancelRequest(id, ip);
  }
  return ids.length;
}

export function promoteOnDeckToPlaying(): PlaySet | null {
  formSets();
  const onDeck = getOnDeck();
  if (!onDeck) return null;
  if (getNowPlaying()) {
    throw new Error("A set is already playing");
  }
  updateSet(onDeck.id, { status: "now_playing", startedAt: Date.now() });
  for (const pid of onDeck.playerIds) {
    updateRequest(pid, { status: "playing" });
  }
  formSets();
  return listSets().find((s) => s.id === onDeck.id) ?? null;
}

export function completeNowPlaying(): PlaySet | null {
  const now = getNowPlaying();
  if (!now) return null;
  updateSet(now.id, { status: "done", finishedAt: Date.now() });
  for (const pid of now.playerIds) {
    updateRequest(pid, { status: "done" });
  }
  forgetReadyMany(now.playerIds);
  formSets();
  return listSets().find((s) => s.id === now.id) ?? null;
}

function skipSet(set: PlaySet): void {
  if (set.status !== "on_deck" && set.status !== "now_playing") return;
  updateSet(set.id, { status: "skipped", finishedAt: Date.now() });
  for (const pid of set.playerIds) {
    updateRequest(pid, { status: "cancelled", setId: null });
  }
  forgetReadyMany(set.playerIds);
  formSets();
}

export function skipOnDeck(): void {
  const onDeck = getOnDeck();
  if (!onDeck) return;
  skipSet(onDeck);
}

export function skipNowPlaying(): void {
  const now = getNowPlaying();
  if (!now) return;
  skipSet(now);
}

export function removeQueueItem(input: {
  setId?: string | null;
  playerIds?: string[];
}): void {
  const setId = (input.setId ?? "").trim();
  if (setId) {
    const set = listSets().find((s) => s.id === setId);
    if (!set || (set.status !== "on_deck" && set.status !== "now_playing")) {
      throw new Error("Queue item not found");
    }
    skipSet(set);
    return;
  }

  const ids = [
    ...new Set((input.playerIds ?? []).filter((id) => Boolean(id?.trim()))),
  ];
  if (ids.length === 0) {
    throw new Error("Nothing to remove");
  }

  let removed = 0;
  for (const id of ids) {
    const req = listRequests().find((r) => r.id === id);
    if (!req) continue;
    if (
      req.status === "playing" ||
      req.status === "done" ||
      req.status === "cancelled"
    ) {
      continue;
    }
    cancelRequest(id);
    removed += 1;
  }
  if (removed === 0) {
    throw new Error("Queue item not found");
  }
}

export function getActiveQueueSnapshot() {
  return {
    requests: activeRequests(),
    sets: activeSets(),
    nowPlaying: getNowPlaying(),
    onDeck: getOnDeck(),
    queuePreview: buildQueuePreview(getOnDeck()),
    queueBoard: buildQueueBoard(),
  };
}
