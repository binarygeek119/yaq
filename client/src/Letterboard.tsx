import { useState } from "react";
import type { Letterboard } from "./api";
import { instrumentIcon, instrumentLabel } from "./labels";
import { Stars, cardTone, type CardTone } from "./ScoreScreen";

function formatScore(n: number): string {
  return Math.round(n).toLocaleString();
}

function starCount(stars: number): number {
  return Math.max(0, Math.min(5, Math.floor(stars)));
}

function entryTone(entry: {
  isFullCombo: boolean;
  stars: number;
}): CardTone {
  return cardTone(entry);
}

function placeClass(rank: number): string {
  if (rank === 1) return "place-1";
  if (rank === 2) return "place-2";
  if (rank === 3) return "place-3";
  return "";
}

function samePlayer(a: string, b: string): boolean {
  return Boolean(a) && a.trim().toLowerCase() === b.trim().toLowerCase();
}

function YouChip() {
  return <em className="letter-chip you">You</em>;
}

function ResultChip({
  entry,
}: {
  entry: { isFullCombo: boolean; stars: number; isHighScore: boolean };
}) {
  const tone = entryTone(entry);
  if (tone === "red") return <em className="letter-chip brutal">Brutal FC</em>;
  if (entry.isFullCombo) return <em className="letter-chip fc">FC</em>;
  if (entry.isHighScore) return <em className="letter-chip hs">High Score</em>;
  return null;
}

function Cover({ songHash }: { songHash: string }) {
  const cover = songHash
    ? `/api/songs/${encodeURIComponent(songHash)}/cover`
    : null;
  const [ok, setOk] = useState(Boolean(cover));
  if (cover && ok) {
    return (
      <img
        className="yarg-score-cover"
        src={cover}
        alt=""
        onError={() => setOk(false)}
      />
    );
  }
  return <span className="yarg-score-cover placeholder" />;
}

export function EventLetterboard({
  board,
  youName,
}: {
  board: Letterboard | null;
  youName: string;
}) {
  if (!board) return null;

  if (board.overall.length === 0) {
    return (
      <section className="yarg-score-screen letterboard-screen">
        <header className="letterboard-head">
          <p className="letterboard-kicker">Letterboard</p>
          <h2>Night standings</h2>
          <p className="hint">Everyone’s scores from this event, ranked.</p>
        </header>
        <p className="empty">No scores yet. Play a song, then check back.</p>
      </section>
    );
  }

  return (
    <>
      <section className="yarg-score-screen letterboard-screen">
        <header className="letterboard-head">
          <p className="letterboard-kicker">Letterboard</p>
          <h2>Night standings</h2>
          <p className="hint">Ranked by total score across every song tonight.</p>
        </header>
        <ol className="letter-list">
          {board.overall.map((row, i) => {
            const rank = i + 1;
            const you = samePlayer(youName, row.playerName);
            return (
              <li
                key={row.playerName}
                className={`letter-row ${placeClass(rank)}${you ? " you" : ""}`}
              >
                <span className={`letter-rank ${placeClass(rank)}`}>{rank}</span>
                <div className="letter-who">
                  <strong>
                    {row.playerName}
                    {you ? <YouChip /> : null}
                  </strong>
                  <span>
                    {row.plays} play{row.plays === 1 ? "" : "s"}
                    {row.fullCombos > 0
                      ? ` · ${row.fullCombos} FC`
                      : ""}
                    {" · best "}
                    {formatScore(row.bestScore)}
                  </span>
                </div>
                <strong className="letter-score">
                  {formatScore(row.totalScore)}
                </strong>
              </li>
            );
          })}
        </ol>
      </section>
      {board.songs.map((song) => {
        const top = song.entries[0];
        return (
          <section
            key={song.songHash || `${song.songArtist}:${song.songName}`}
            className="yarg-score-screen letterboard-screen"
          >
            <header className="yarg-score-screen-head">
              <Cover songHash={song.songHash} />
              <div>
                <strong>{song.songName}</strong>
                <em>{song.songArtist}</em>
              </div>
              <div className="yarg-score-band">
                <strong>{top ? formatScore(top.score) : "—"}</strong>
                {top ? (
                  <Stars
                    count={starCount(top.stars)}
                    tone={entryTone(top)}
                    compact
                  />
                ) : null}
              </div>
            </header>
            <ol className="letter-list">
              {song.entries.map((entry, i) => {
                const rank = i + 1;
                const tone = entryTone(entry);
                const you = samePlayer(youName, entry.playerName);
                const percent =
                  entry.percent > 0
                    ? `${Math.floor(entry.percent * 100)}%`
                    : null;
                return (
                  <li
                    key={`${entry.playerName}-${entry.instrument}`}
                    className={`letter-row song ${tone} ${placeClass(rank)}${you ? " you" : ""}`}
                  >
                    <span className={`letter-rank ${placeClass(rank)}`}>
                      {rank}
                    </span>
                    <div className="letter-who">
                      <strong>
                        {entry.playerName}
                        {you ? <YouChip /> : null}
                      </strong>
                      <span className="letter-part">
                        <img
                          src={`/yarg-icons/${instrumentIcon(entry.instrument)}.png`}
                          alt=""
                        />
                        {instrumentLabel(entry.instrument)} · {entry.difficulty}
                      </span>
                    </div>
                    <div className="letter-marks">
                      <Stars count={starCount(entry.stars)} tone={tone} compact />
                      {percent ? (
                        <span className="letter-percent">{percent}</span>
                      ) : null}
                      <ResultChip
                        entry={{
                          ...entry,
                          isHighScore: entry.isHighScore || rank === 1,
                        }}
                      />
                    </div>
                    <strong className="letter-score">
                      {formatScore(entry.score)}
                    </strong>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </>
  );
}
