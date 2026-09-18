export type AlertRequest = {
  id: string;
  songHash: string;
  status: string;
  createdAt: number;
};

export type AlertOnDeck = {
  songHash: string;
  playerIds: string[];
};

export type UpcomingSong = {
  songHash: string;
  requestIds: string[];
};

export type QueueAlertKind = "five" | "one" | "upNext";

export type QueueAlert = {
  kind: QueueAlertKind;
  key: string;
  ahead: number;
  songHash: string;
  requestIds: string[];
};

/** Upcoming playable songs: on-deck first, then waiting groups by oldest request. */
export function upcomingSongs(
  requests: AlertRequest[],
  onDeck: AlertOnDeck | null,
): UpcomingSong[] {
  const result: UpcomingSong[] = [];
  if (onDeck) {
    result.push({
      songHash: onDeck.songHash,
      requestIds: [...onDeck.playerIds],
    });
  }

  const waiting = requests
    .filter((r) => r.status === "waiting")
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

  const groups = new Map<string, string[]>();
  const order: string[] = [];
  for (const req of waiting) {
    const existing = groups.get(req.songHash);
    if (existing) {
      existing.push(req.id);
      continue;
    }
    groups.set(req.songHash, [req.id]);
    order.push(req.songHash);
  }
  for (const hash of order) {
    result.push({ songHash: hash, requestIds: groups.get(hash) ?? [] });
  }
  return result;
}

export function songsAhead(
  upcoming: UpcomingSong[],
  myIds: ReadonlySet<string>,
): number | null {
  if (myIds.size === 0) return null;
  const idx = upcoming.findIndex((song) =>
    song.requestIds.some((id) => myIds.has(id)),
  );
  return idx === -1 ? null : idx;
}

export function alertKindForAhead(ahead: number | null): QueueAlertKind | null {
  if (ahead == null || ahead < 0) return null;
  if (ahead === 0) return "upNext";
  if (ahead === 1) return "one";
  if (ahead <= 5) return "five";
  return null;
}

export function pendingQueueAlert(
  requests: AlertRequest[],
  onDeck: AlertOnDeck | null,
  myIds: ReadonlySet<string>,
  alreadyFired: ReadonlySet<string>,
): QueueAlert | null {
  const upcoming = upcomingSongs(requests, onDeck);
  const ahead = songsAhead(upcoming, myIds);
  const kind = alertKindForAhead(ahead);
  if (kind == null || ahead == null) return null;
  const song = upcoming[ahead];
  if (!song) return null;
  const key = `${kind}:${song.songHash}:${[...song.requestIds].sort().join(",")}`;
  if (alreadyFired.has(key)) return null;
  return {
    kind,
    key,
    ahead,
    songHash: song.songHash,
    requestIds: song.requestIds,
  };
}

export function queueAlertCopy(
  kind: QueueAlertKind,
  ahead: number,
  songName: string,
  songArtist: string,
): { title: string; body: string } {
  const song = [songArtist, songName].filter(Boolean).join(" — ") || "your song";
  if (kind === "upNext") {
    return { title: "You're up next", body: `Get ready — ${song}` };
  }
  if (kind === "one") {
    return {
      title: "One song away",
      body: `Next song, then you're up — ${song}`,
    };
  }
  return {
    title: `You're ${ahead} songs away`,
    body: `Within 5 songs of being up — ${song}`,
  };
}
