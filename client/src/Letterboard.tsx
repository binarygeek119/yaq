import { useEffect, useState } from "react";
import type { Letterboard } from "./api";
import { instrumentIcon, instrumentLabel } from "./labels";

function formatScore(n: number): string {
  return Math.round(n).toLocaleString();
}

function formatAccuracy(n: number): string {
  if (n <= 0) return "—";
  return `${(n * 100).toFixed(2)}%`;
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function Cover({ songHash }: { songHash: string }) {
  const cover = songHash
    ? `/api/songs/${encodeURIComponent(songHash)}/cover`
    : null;
  const [ok, setOk] = useState(Boolean(cover));
  if (cover && ok) {
    return (
      <img
        className="lb-song-cover"
        src={cover}
        alt=""
        onError={() => setOk(false)}
      />
    );
  }
  return <span className="lb-song-cover placeholder" />;
}

export function EventLetterboard({
  board,
  youName,
  youPhotoUrl,
  eventName,
}: {
  board: Letterboard | null;
  youName: string;
  youPhotoUrl: string | null;
  eventName: string;
}) {
  const [tab, setTab] = useState("overall");
  const [selected, setSelected] = useState("");

  useEffect(() => {
    const rows = board?.overall ?? [];
    if (rows.length === 0) return;
    setSelected((cur) => {
      if (cur && rows.some((row) => samePlayer(row.playerName, cur))) {
        return cur;
      }
      const you = rows.find((row) => samePlayer(row.playerName, youName));
      return you?.playerName || rows[0].playerName;
    });
  }, [board, youName]);

  if (!board) return null;

  const overall = board.overall;
  const songs = board.songs;
  const selectedRow =
    overall.find((row) => samePlayer(row.playerName, selected)) ?? null;
  const selectedRank = selectedRow
    ? overall.findIndex((row) =>
        samePlayer(row.playerName, selectedRow.playerName),
      ) + 1
    : 0;

  if (overall.length === 0) {
    return (
      <section className="lb-shell">
        <header className="lb-head">
          <p className="lb-kicker">Letterboard</p>
          <h2>Leaderboards</h2>
          <p className="hint">Night standings for this event.</p>
        </header>
        <p className="empty">No scores yet. Play a song, then check back.</p>
      </section>
    );
  }

  const song = songs.find(
    (item) => (item.songHash || `${item.songArtist}:${item.songName}`) === tab,
  );

  return (
    <section className="lb-shell">
      <header className="lb-head">
        <div>
          <p className="lb-kicker">Letterboard</p>
          <h2>Leaderboards</h2>
          <p className="lb-sub">Night standings</p>
        </div>
        {eventName ? (
          <div className="lb-event">
            <strong>{eventName}</strong>
            <span>This event</span>
          </div>
        ) : null}
      </header>
      <div className="lb-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={tab === "overall" ? "on" : ""}
          aria-selected={tab === "overall"}
          onClick={() => setTab("overall")}
        >
          Overall
        </button>
        {songs.map((item) => {
          const id = item.songHash || `${item.songArtist}:${item.songName}`;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              className={tab === id ? "on" : ""}
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {item.songName}
            </button>
          );
        })}
      </div>
      <div className="lb-layout">
        <div className="lb-table-wrap">
          {song ? (
            <table className="lb-table">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Name</th>
                  <th>Part</th>
                  <th className="num">Score</th>
                </tr>
              </thead>
              <tbody>
                {song.entries.map((entry, i) => {
                  const rank = i + 1;
                  const you = samePlayer(youName, entry.playerName);
                  const on = samePlayer(selected, entry.playerName);
                  return (
                    <tr
                      key={`${entry.playerName}-${entry.instrument}`}
                      className={`${placeClass(rank)}${on ? " on" : ""}${you ? " you" : ""}`}
                      onClick={() => setSelected(entry.playerName)}
                    >
                      <td className={`num rank ${placeClass(rank)}`}>{rank}</td>
                      <td>
                        {entry.playerName}
                        {you ? <em className="lb-you">You</em> : null}
                      </td>
                      <td>
                        <span className="part">
                          <img
                            src={`/yarg-icons/${instrumentIcon(entry.instrument)}.png`}
                            alt=""
                          />
                          {instrumentLabel(entry.instrument)}
                        </span>
                      </td>
                      <td className="num score">{formatScore(entry.score)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="lb-table">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Name</th>
                  <th className="num">Plays</th>
                  <th className="num">Score</th>
                </tr>
              </thead>
              <tbody>
                {overall.map((row, i) => {
                  const rank = i + 1;
                  const you = samePlayer(youName, row.playerName);
                  const on = samePlayer(selected, row.playerName);
                  return (
                    <tr
                      key={row.playerName}
                      className={`${placeClass(rank)}${on ? " on" : ""}${you ? " you" : ""}`}
                      onClick={() => setSelected(row.playerName)}
                    >
                      <td className={`num rank ${placeClass(rank)}`}>{rank}</td>
                      <td>
                        {row.playerName}
                        {you ? <em className="lb-you">You</em> : null}
                      </td>
                      <td className="num">{row.plays}</td>
                      <td className="num score">{formatScore(row.totalScore)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {selectedRow ? (
          <aside className="lb-player">
            <div className="lb-player-hero">
              {youPhotoUrl && samePlayer(youName, selectedRow.playerName) ? (
                <img className="lb-avatar" src={youPhotoUrl} alt="" />
              ) : (
                <span className="lb-avatar placeholder">
                  {initials(selectedRow.playerName)}
                </span>
              )}
              <strong>{selectedRow.playerName}</strong>
              <em>
                {selectedRow.instruments
                  .slice(0, 3)
                  .map((id) => instrumentLabel(id))
                  .join(" · ") || "Player"}
              </em>
            </div>
            <dl className="lb-stats">
              <div>
                <dt>Score</dt>
                <dd>{formatScore(selectedRow.totalScore)}</dd>
              </div>
              <div>
                <dt>Ranking</dt>
                <dd className={placeClass(selectedRank)}>#{selectedRank}</dd>
              </div>
              <div>
                <dt>Plays</dt>
                <dd>{selectedRow.plays}</dd>
              </div>
              <div>
                <dt>Full combos</dt>
                <dd>{selectedRow.fullCombos}</dd>
              </div>
              <div>
                <dt>Accuracy</dt>
                <dd>{formatAccuracy(selectedRow.accuracy)}</dd>
              </div>
              <div>
                <dt>Best</dt>
                <dd>{formatScore(selectedRow.bestScore)}</dd>
              </div>
              <div>
                <dt>Stars</dt>
                <dd>{formatScore(selectedRow.stars)}</dd>
              </div>
              <div>
                <dt>Gold stars</dt>
                <dd className="gold">{formatScore(selectedRow.goldStars)}</dd>
              </div>
              <div>
                <dt>Crimson stars</dt>
                <dd className="crimson">{formatScore(selectedRow.crimsonStars)}</dd>
              </div>
            </dl>
            {selectedRow.lastPlayed ? (
              <div className="lb-track">
                <p>Last played</p>
                <div>
                  <Cover songHash={selectedRow.lastPlayed.songHash} />
                  <div>
                    <strong>{selectedRow.lastPlayed.songName}</strong>
                    <em>{selectedRow.lastPlayed.songArtist}</em>
                  </div>
                </div>
              </div>
            ) : null}
            {selectedRow.mostPlayed ? (
              <div className="lb-track">
                <p>Most played song</p>
                <div>
                  <Cover songHash={selectedRow.mostPlayed.songHash} />
                  <div>
                    <strong>{selectedRow.mostPlayed.songName}</strong>
                    <em>{selectedRow.mostPlayed.songArtist}</em>
                  </div>
                </div>
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>
    </section>
  );
}
