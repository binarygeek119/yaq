import { randomUUID } from "node:crypto";
import { insertScoreRun, listScoreRuns, getSettings, getActiveEvent, saveLetterboard } from "../db.js";
import type {
  Letterboard,
  PlaySet,
  QueueRequest,
  ScoreRun,
} from "../types.js";

type ScoreCard = {
  name: string;
  instrument: string;
  difficulty: string;
  score: number;
  stars: number;
  percent: number;
  notesHit: number;
  totalNotes: number;
  maxCombo: number;
  spPhrasesHit: number;
  spPhrasesTotal: number;
  avgMultiplier: number;
  isFullCombo: boolean;
  isHighScore: boolean;
  isBot: boolean;
  notesMissed: number;
  overstrums: number;
  ghostInputs: number;
  spUses: number;
  timeInSp: number;
  enginePreset: string;
  modifiersUsed: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseScorePayload(raw: unknown): {
  bandScore: number;
  bandStars: number;
  players: ScoreCard[];
} | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const list = Array.isArray(rec.players) ? rec.players : [];
  const players: ScoreCard[] = [];
  for (const item of list) {
    const card = asRecord(item);
    if (!card) continue;
    if (card.isBot === true) continue;
    players.push({
      name: asString(card.name),
      instrument: asString(card.instrument),
      difficulty: asString(card.difficulty),
      score: Math.round(asNumber(card.score)),
      stars: asNumber(card.stars),
      percent: asNumber(card.percent),
      notesHit: Math.round(asNumber(card.notesHit)),
      totalNotes: Math.round(asNumber(card.totalNotes)),
      maxCombo: Math.round(asNumber(card.maxCombo)),
      spPhrasesHit: Math.round(asNumber(card.starPowerPhrasesHit ?? card.spPhrasesHit)),
      spPhrasesTotal: Math.round(
        asNumber(card.totalStarPowerPhrases ?? card.spPhrasesTotal),
      ),
      avgMultiplier: asNumber(card.averageMultiplier ?? card.avgMultiplier),
      isFullCombo: card.isFullCombo === true,
      isHighScore: card.isHighScore === true,
      isBot: false,
      notesMissed:
        card.notesMissed != null
          ? Math.round(asNumber(card.notesMissed))
          : Math.max(
              0,
              Math.round(asNumber(card.totalNotes)) -
                Math.round(asNumber(card.notesHit)),
            ),
      overstrums: Math.round(asNumber(card.overstrums)),
      ghostInputs: Math.round(asNumber(card.ghostInputs)),
      spUses: Math.round(asNumber(card.starPowerActivations ?? card.spUses)),
      timeInSp: asNumber(card.timeInStarPower ?? card.timeInSp),
      enginePreset: asString(card.enginePreset),
      modifiersUsed: card.modifiersUsed === true,
    });
  }
  if (players.length === 0) return null;
  return {
    bandScore: Math.round(asNumber(rec.bandScore)),
    bandStars: asNumber(rec.bandStars),
    players,
  };
}

export function guestNameForCard(
  card: Pick<ScoreCard, "name" | "instrument">,
  members: QueueRequest[],
  used: Set<string>,
): string {
  const want = card.name.trim().toLowerCase();
  if (want) {
    const named = members.find(
      (m) => !used.has(m.id) && m.name.trim().toLowerCase() === want,
    );
    if (named) {
      used.add(named.id);
      return named.name;
    }
  }
  const byInst = members.find(
    (m) => !used.has(m.id) && m.instrument === card.instrument,
  );
  if (byInst) {
    used.add(byInst.id);
    return byInst.name;
  }
  const leftover = members.find((m) => !used.has(m.id));
  if (leftover) {
    used.add(leftover.id);
    return leftover.name;
  }
  return card.name.trim() || "Guest";
}

export function recordSongEnded(input: {
  setId?: string;
  scores: unknown;
  nowPlaying: PlaySet | null;
  members: QueueRequest[];
}): ScoreRun[] {
  const parsed = parseScorePayload(input.scores);
  if (!parsed) return [];
  const set = input.nowPlaying;
  const setId = input.setId || set?.id || "";
  const eventId = set?.eventId || getActiveEvent()?.id || "";
  const used = new Set<string>();
  const runs: ScoreRun[] = parsed.players.map((card) => ({
    id: randomUUID(),
    createdAt: Date.now(),
    setId,
    eventId,
    songHash: set?.songHash ?? "",
    songName: set?.songName ?? "Unknown Song",
    songArtist: set?.songArtist ?? "Unknown Artist",
    playerName: guestNameForCard(card, input.members, used),
    instrument: card.instrument,
    difficulty: card.difficulty,
    score: card.score,
    stars: card.stars,
    bandScore: parsed.bandScore,
    bandStars: parsed.bandStars,
    percent: card.percent,
    notesHit: card.notesHit,
    totalNotes: card.totalNotes,
    maxCombo: card.maxCombo,
    spPhrasesHit: card.spPhrasesHit,
    spPhrasesTotal: card.spPhrasesTotal,
    avgMultiplier: card.avgMultiplier,
    isFullCombo: card.isFullCombo,
    isHighScore: card.isHighScore,
    notesMissed: card.notesMissed,
    overstrums: card.overstrums,
    ghostInputs: card.ghostInputs,
    spUses: card.spUses,
    timeInSp: card.timeInSp,
    enginePreset: card.enginePreset,
    modifiersUsed: card.modifiersUsed,
    imported: false,
  }));
  for (const run of runs) insertScoreRun(run);
  persistCurrentLetterboard();
  return runs;
}

export function persistCurrentLetterboard(): void {
  const eventId = getActiveEvent()?.id ?? "";
  if (!eventId) return;
  saveLetterboard(eventId, buildLetterboard());
}

export function visibleScoreRuns(
  allowImported = getSettings().allowImportedScores,
): ScoreRun[] {
  const runs = listScoreRuns();
  if (allowImported) return runs;
  return runs.filter((run) => !run.imported);
}

export function scoresForPlayer(playerName: string): ScoreRun[] {
  const key = playerName.trim().toLowerCase();
  if (!key) return [];
  return visibleScoreRuns().filter(
    (r) => r.playerName.trim().toLowerCase() === key,
  );
}

export function buildLetterboard(
  runs: ScoreRun[] = visibleScoreRuns(),
): Letterboard {
  type SongRef = {
    songHash: string;
    songName: string;
    songArtist: string;
  };
  type Agg = {
    playerName: string;
    totalScore: number;
    bestScore: number;
    plays: number;
    fullCombos: number;
    percentSum: number;
    percentCount: number;
    stars: number;
    goldStars: number;
    crimsonStars: number;
    instruments: Set<string>;
    lastPlayed: (SongRef & { createdAt: number }) | null;
    songPlays: Map<string, SongRef & { plays: number }>;
  };

  const overallMap = new Map<string, Agg>();
  for (const run of runs) {
    const key = run.playerName.trim().toLowerCase() || "guest";
    const cur = overallMap.get(key) ?? {
      playerName: run.playerName || "Guest",
      totalScore: 0,
      bestScore: 0,
      plays: 0,
      fullCombos: 0,
      percentSum: 0,
      percentCount: 0,
      stars: 0,
      goldStars: 0,
      crimsonStars: 0,
      instruments: new Set<string>(),
      lastPlayed: null,
      songPlays: new Map(),
    };
    cur.totalScore += run.score;
    cur.bestScore = Math.max(cur.bestScore, run.score);
    cur.plays += 1;
    if (run.isFullCombo) cur.fullCombos += 1;
    if (run.percent > 0) {
      cur.percentSum += run.percent;
      cur.percentCount += 1;
    }
    const starN = Math.max(0, Math.floor(run.stars));
    cur.stars += Math.min(5, starN);
    if (run.isFullCombo && starN >= 6) cur.crimsonStars += 1;
    else if (run.isFullCombo && starN >= 5) cur.goldStars += 1;
    if (run.instrument) cur.instruments.add(run.instrument);
    if (!cur.lastPlayed || run.createdAt >= cur.lastPlayed.createdAt) {
      cur.lastPlayed = {
        songHash: run.songHash,
        songName: run.songName,
        songArtist: run.songArtist,
        createdAt: run.createdAt,
      };
    }
    const songKey = run.songHash || `${run.songArtist}:${run.songName}`;
    const songPlay = cur.songPlays.get(songKey) ?? {
      songHash: run.songHash,
      songName: run.songName,
      songArtist: run.songArtist,
      plays: 0,
    };
    songPlay.plays += 1;
    cur.songPlays.set(songKey, songPlay);
    overallMap.set(key, cur);
  }
  const overall = [...overallMap.values()]
    .map((cur) => {
      const mostPlayed = [...cur.songPlays.values()].sort(
        (a, b) => b.plays - a.plays || a.songName.localeCompare(b.songName),
      )[0] ?? null;
      return {
        playerName: cur.playerName,
        totalScore: cur.totalScore,
        bestScore: cur.bestScore,
        plays: cur.plays,
        fullCombos: cur.fullCombos,
        accuracy: cur.percentCount > 0 ? cur.percentSum / cur.percentCount : 0,
        stars: cur.stars,
        goldStars: cur.goldStars,
        crimsonStars: cur.crimsonStars,
        instruments: [...cur.instruments],
        lastPlayed: cur.lastPlayed
          ? {
              songHash: cur.lastPlayed.songHash,
              songName: cur.lastPlayed.songName,
              songArtist: cur.lastPlayed.songArtist,
            }
          : null,
        mostPlayed,
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore || b.bestScore - a.bestScore);

  const songMap = new Map<string, Letterboard["songs"][number]>();
  for (const run of runs) {
    const key = run.songHash || `${run.songArtist}:${run.songName}`;
    const song = songMap.get(key) ?? {
      songHash: run.songHash,
      songName: run.songName,
      songArtist: run.songArtist,
      entries: [],
    };
    const existing = song.entries.find(
      (e) =>
        e.playerName.trim().toLowerCase() === run.playerName.trim().toLowerCase() &&
        e.instrument === run.instrument,
    );
    if (!existing || run.score > existing.score) {
      song.entries = [
        ...song.entries.filter(
          (e) =>
            !(
              e.playerName.trim().toLowerCase() ===
                run.playerName.trim().toLowerCase() &&
              e.instrument === run.instrument
            ),
        ),
        {
          playerName: run.playerName,
          instrument: run.instrument,
          difficulty: run.difficulty,
          score: run.score,
          stars: run.stars,
          percent: run.percent,
          isFullCombo: run.isFullCombo,
          isHighScore: run.isHighScore,
        },
      ].sort((a, b) => b.score - a.score);
    }
    songMap.set(key, song);
  }
  const songs = [...songMap.values()].sort((a, b) =>
    a.songArtist.localeCompare(b.songArtist) || a.songName.localeCompare(b.songName),
  );
  return { overall, songs };
}
