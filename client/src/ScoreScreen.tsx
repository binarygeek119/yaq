import { useMemo, useState } from "react";
import type { ScoreRun } from "./api";
import { instrumentIcon, instrumentLabel } from "./labels";

function formatScore(n: number): string {
  return Math.round(n).toLocaleString();
}

function formatSpTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
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

export type CardTone = "blue" | "gold" | "red" | "gray";

export function cardTone(run: Pick<ScoreRun, "isFullCombo" | "stars">): CardTone {
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

function enginePillClass(label: string): string {
  const key = label.toLowerCase();
  if (key.includes("casual")) return "casual";
  if (key.includes("precision")) return "precision";
  if (key.includes("custom")) return "custom";
  return "default";
}

function notesMissedOf(run: ScoreRun): number {
  if (run.notesMissed > 0) return run.notesMissed;
  return Math.max(0, run.totalNotes - run.notesHit);
}

export function Stars({
  count,
  tone,
  compact = false,
}: {
  count: number;
  tone: CardTone;
  compact?: boolean;
}) {
  return (
    <span
      className={`yarg-stars ${tone}${compact ? " compact" : ""}`}
      aria-label={`${count} stars`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < count ? "on" : "off"}>
          {tone === "blue" ? "" : "★"}
        </span>
      ))}
    </span>
  );
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
  const missed = notesMissedOf(run);
  const hasPerformance = run.totalNotes > 0;
  const hasInstrument =
    run.overstrums > 0 ||
    run.ghostInputs > 0 ||
    /guitar|bass/i.test(run.instrument);
  const hasExtra = run.spUses > 0 || run.timeInSp > 0;
  const hasTags = Boolean(run.enginePreset) || run.modifiersUsed;

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
      {hasPerformance || hasInstrument || hasExtra ? (
        <div className="yarg-score-body">
          {hasPerformance ? (
            <dl className="yarg-score-stats">
              <dt>Performance</dt>
              <dd>
                <span>Notes</span>
                <strong>
                  {formatScore(run.notesHit)} / {formatScore(run.totalNotes)}
                  {missed > 0 ? (
                    <em className="yarg-miss">-{formatScore(missed)}</em>
                  ) : null}
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
          ) : null}
          {hasInstrument ? (
            <dl className="yarg-score-stats">
              <dt>Instrument statistics</dt>
              <dd>
                <span>Overstrums</span>
                <strong>{formatScore(run.overstrums)}</strong>
              </dd>
              <dd>
                <span>Ghost inputs</span>
                <strong>{formatScore(run.ghostInputs)}</strong>
              </dd>
            </dl>
          ) : null}
          {hasExtra ? (
            <dl className="yarg-score-stats">
              <dt>Additional stats</dt>
              <dd>
                <span>SP uses</span>
                <strong>{formatScore(run.spUses)}</strong>
              </dd>
              <dd>
                <span>Time spent in SP</span>
                <strong>{formatSpTime(run.timeInSp)}</strong>
              </dd>
            </dl>
          ) : null}
        </div>
      ) : (
        <p className="yarg-score-when">
          {new Date(run.createdAt).toLocaleString()}
        </p>
      )}
      {hasTags ? (
        <div className="yarg-score-tags">
          {run.enginePreset ? (
            <em className={`yarg-engine-pill ${enginePillClass(run.enginePreset)}`}>
              {run.enginePreset}
            </em>
          ) : null}
          {run.modifiersUsed ? (
            <em className="yarg-engine-pill modifiers">Modifiers used</em>
          ) : null}
        </div>
      ) : null}
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
          <Stars count={starCount(screen.bandStars)} tone="blue" compact />
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
