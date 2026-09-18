import { useMemo, useState } from "react";
import type { ScoreRun } from "./api";
import { instrumentIcon, instrumentLabel } from "./labels";

function formatScore(n: number): string {
  return Math.round(n).toLocaleString();
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function starCount(stars: number): number {
  return Math.max(0, Math.min(5, Math.floor(stars)));
}

type CardTone = "blue" | "gold" | "red";

function cardTone(run: ScoreRun): CardTone {
  if (run.isFullCombo && run.stars >= 6) return "red";
  if (run.isFullCombo) return "gold";
  return "blue";
}

function bannerLabel(run: ScoreRun): string {
  if (run.isFullCombo && run.stars >= 6) return "Brutal FC";
  if (run.isFullCombo) return "Full Combo";
  if (run.isHighScore) return "High Score";
  return "Cleared";
}

function percentLabel(run: ScoreRun): string | null {
  if (run.totalNotes <= 0 && run.percent <= 0) return null;
  return `${Math.floor(run.percent * 100)}%`;
}

type SongScreen = {
  key: string;
  songHash: string;
  songName: string;
  songArtist: string;
  bandScore: number;
  bandStars: number;
  createdAt: number;
  cards: ScoreRun[];
};

function flagLocalHighScores(runs: ScoreRun[]): ScoreRun[] {
  const best = new Map<string, number>();
  for (const run of runs) {
    const key = `${run.songHash}:${run.instrument}`;
    best.set(key, Math.max(best.get(key) ?? 0, run.score));
  }
  return runs.map((run) => {
    if (run.isHighScore || run.isFullCombo) return run;
    const key = `${run.songHash}:${run.instrument}`;
    return {
      ...run,
      isHighScore: run.score > 0 && run.score === best.get(key),
    };
  });
}

function groupBySong(runs: ScoreRun[]): SongScreen[] {
  const map = new Map<string, ScoreRun[]>();
  const order: string[] = [];
  for (const run of runs) {
    const key = run.setId || `${run.songHash}:${run.createdAt}`;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(run);
  }
  return order.map((key) => {
    const cards = map.get(key)!;
    const first = cards[0];
    return {
      key,
      songHash: first.songHash,
      songName: first.songName,
      songArtist: first.songArtist,
      bandScore: first.bandScore,
      bandStars: first.bandStars,
      createdAt: first.createdAt,
      cards,
    };
  });
}

function Stars({ count, tone }: { count: number; tone: CardTone }) {
  return (
    <span className={`score-stars ${tone}`} aria-label={`${count} stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < count ? "on" : "off"}>
          ★
        </span>
      ))}
    </span>
  );
}

function ScoreCard({
  run,
  name,
  photoUrl,
}: {
  run: ScoreRun;
  name: string;
  photoUrl: string | null;
}) {
  const tone = cardTone(run);
  const percent = percentLabel(run);
  const hasStats = run.totalNotes > 0;

  return (
    <article className={`yarg-score-card ${tone}`}>
      <header className="yarg-score-card-head">
        {photoUrl ? (
          <img className="yarg-score-avatar" src={photoUrl} alt="" />
        ) : (
          <span className="yarg-score-avatar placeholder">{initials(name)}</span>
        )}
        <div>
          <strong>{name}</strong>
          <em>
            <img
              src={`/yarg-icons/${instrumentIcon(run.instrument)}.png`}
              alt=""
            />
            {instrumentLabel(run.instrument)} · {run.difficulty}
          </em>
        </div>
      </header>
      <p className="yarg-score-points">{formatScore(run.score)}</p>
      {percent ? (
        <p className="yarg-score-percent">{percent}</p>
      ) : null}
      <Stars count={starCount(run.stars)} tone={tone} />
      {hasStats ? (
        <dl className="yarg-score-stats">
          <dt>Performance</dt>
          <dd>
            <span>Notes</span>
            <strong>
              {formatScore(run.notesHit)} / {formatScore(run.totalNotes)}
            </strong>
          </dd>
          <dd>
            <span>Max streak</span>
            <strong>{formatScore(run.maxCombo)}</strong>
          </dd>
          <dd>
            <span>SP phrases</span>
            <strong>
              {run.spPhrasesHit} / {run.spPhrasesTotal}
            </strong>
          </dd>
          {run.avgMultiplier > 0 ? (
            <dd>
              <span>Avg. multiplier</span>
              <strong>{run.avgMultiplier.toFixed(2)}</strong>
            </dd>
          ) : null}
        </dl>
      ) : (
        <p className="yarg-score-when">
          {new Date(run.createdAt).toLocaleString()}
        </p>
      )}
      <footer className="yarg-score-banner">{bannerLabel(run)}</footer>
    </article>
  );
}

function SongScoreScreen({
  screen,
  name,
  photoUrl,
}: {
  screen: SongScreen;
  name: string;
  photoUrl: string | null;
}) {
  const cover = screen.songHash
    ? `/api/songs/${encodeURIComponent(screen.songHash)}/cover`
    : null;
  const [coverOk, setCoverOk] = useState(Boolean(cover));

  return (
    <section className="yarg-score-screen">
      <header className="yarg-score-screen-head">
        {cover && coverOk ? (
          <img
            className="yarg-score-cover"
            src={cover}
            alt=""
            onError={() => setCoverOk(false)}
          />
        ) : (
          <span className="yarg-score-cover placeholder" />
        )}
        <div>
          <strong>{screen.songName}</strong>
          <em>{screen.songArtist}</em>
        </div>
        <div className="yarg-score-band">
          <strong>{formatScore(screen.bandScore)}</strong>
          <Stars count={starCount(screen.bandStars)} tone="blue" />
        </div>
      </header>
      <div className="yarg-score-cards">
        {screen.cards.map((run) => (
          <ScoreCard
            key={run.id}
            run={run}
            name={name}
            photoUrl={photoUrl}
          />
        ))}
      </div>
    </section>
  );
}

export function DeviceScores({
  name,
  photoUrl,
  runs,
}: {
  name: string;
  photoUrl: string | null;
  runs: ScoreRun[];
}) {
  const screens = useMemo(
    () => groupBySong(flagLocalHighScores(runs)),
    [runs],
  );

  if (screens.length === 0) {
    return (
      <section className="panel">
        <h2>Your scores</h2>
        <p className="hint">
          Runs saved under {name} after each Event Mode song.
        </p>
        <p className="empty">No scores yet. Play a song, then check back.</p>
      </section>
    );
  }

  return (
    <>
      {screens.map((screen) => (
        <SongScoreScreen
          key={screen.key}
          screen={screen}
          name={name}
          photoUrl={photoUrl}
        />
      ))}
    </>
  );
}
