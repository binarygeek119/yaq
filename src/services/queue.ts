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
  QueuePreview,
  QueueRequest,
} from "../types.js";
import { addUsed, capForInstrument, countUsed } from "./caps.js";
import { guestLabelForIp, normalizeClientIp } from "./ip.js";

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
    };
  }
  const reqs = listRequests().filter((r) => set.playerIds.includes(r.id));
  return {
    setId: set.id,
    songHash: set.songHash,
    songName: set.songName,
    songArtist: set.songArtist,
    players: reqs.map((r) => ({
      name: r.name,
      instrument: r.instrument,
      difficulty: r.difficulty,
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

/** Form as many on_deck sets as needed so there is always at most one on_deck waiting behind now_playing. */
export function formSets(): PlaySet[] {
  const caps = getSettings().instrumentCaps;
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
      if (!canTakeInstrument(req.instrument, used, caps)) continue;
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
        if (!canTakeInstrument(req.instrument, used, caps)) continue;
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

  const members = listRequests().filter((r) => onDeck.playerIds.includes(r.id));
  const used = new Map<string, number>();
  for (const member of members) {
    addUsed(used, member.instrument);
  }
  if (!canTakeInstrument(request.instrument, used, caps)) return false;

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
  formSets();
  return listSets().find((s) => s.id === now.id) ?? null;
}

export function skipOnDeck(): void {
  const onDeck = getOnDeck();
  if (!onDeck) return;
  updateSet(onDeck.id, { status: "skipped", finishedAt: Date.now() });
  for (const pid of onDeck.playerIds) {
    updateRequest(pid, { status: "cancelled", setId: null });
  }
  formSets();
}

export function getActiveQueueSnapshot() {
  return {
    requests: activeRequests(),
    sets: activeSets(),
    nowPlaying: getNowPlaying(),
    onDeck: getOnDeck(),
    queuePreview: buildQueuePreview(getOnDeck()),
  };
}
