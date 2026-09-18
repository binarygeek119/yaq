import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type Difficulty,
  type GuestProfile,
  type Instrument,
  type PublicState,
} from "./api";
import { Brand, GuestNav } from "./chrome";
import { controllerSlugForInstrument } from "./controllers";
import { instrumentLabel } from "./labels";
import { useLiveState } from "./useLiveState";

const INSTRUMENTS = [
  "FiveFretGuitar",
  "FiveFretBass",
  "SixFretGuitar",
  "SixFretBass",
  "ProGuitar_17",
  "ProBass_17",
  "FourLaneDrums",
  "ProDrums",
  "ProKeys",
  "Keys",
  "Vocals",
  "Harmony",
] as const;

const DIFFICULTIES = ["Easy", "Medium", "Hard", "Expert", "ExpertPlus"] as const;

type BoardSong = PublicState["queueBoard"][number];

function capGroupId(instrument: string): string {
  if (instrument.startsWith("FiveFret")) return "FiveFret";
  if (instrument.startsWith("SixFret")) return "SixFret";
  if (instrument.startsWith("ProGuitar") || instrument.startsWith("ProBass")) {
    return "ProGuitar";
  }
  if (instrument === "Harmony") return "Vocals";
  return instrument;
}

function partOpen(
  instrument: string,
  song: BoardSong,
  caps: Record<string, number>,
): boolean {
  if (!song.joinable || song.playerSlotsOpen <= 0) return false;
  const group = capGroupId(instrument);
  const used = song.players.filter(
    (p) => capGroupId(p.instrument) === group,
  ).length;
  const cap = Number(caps[group] ?? caps[instrument] ?? 0);
  return used < cap;
}

function statusLabel(status: BoardSong["status"]): string {
  if (status === "now_playing") return "Now playing";
  if (status === "on_deck") return "Up next";
  return "In queue";
}

export function QueuePage() {
  const { state, error, setState } = useLiveState();
  const [profile, setProfile] = useState<GuestProfile | null>(null);
  const [instrument, setInstrument] = useState<Instrument>("FiveFretGuitar");
  const [difficulty, setDifficulty] = useState<Difficulty>("Expert");
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api<GuestProfile>("/api/profile")
      .then((next) => {
        if (cancelled) return;
        setProfile(next);
        setInstrument(next.instrument);
        setDifficulty(next.difficulty);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const myIds = useMemo(
    () => new Set(profile?.requestIds ?? []),
    [profile],
  );
  const library = state?.songs ?? [];
  const board = state?.queueBoard ?? [];
  const caps = state?.settings.instrumentCaps ?? {};
  const selected = board.find((song) => song.songHash === selectedHash) ?? null;
  const selectedSong = selected
    ? library.find((s) => s.hash === selected.songHash)
    : undefined;

  const joinOptions = useMemo(() => {
    if (!selected) return [] as Instrument[];
    return INSTRUMENTS.filter((item) => {
      const onSong =
        !selectedSong?.instruments.length ||
        selectedSong.instruments.includes(item);
      return onSong && partOpen(item, selected, caps);
    });
  }, [caps, selected, selectedSong]);

  useEffect(() => {
    if (!selected) return;
    if (joinOptions.includes(instrument)) return;
    const next = joinOptions[0];
    if (next) setInstrument(next);
  }, [instrument, joinOptions, selected]);

  const applyProfile = (next: GuestProfile) => {
    setProfile(next);
    setInstrument(next.instrument);
    setDifficulty(next.difficulty);
  };

  const join = async (song: BoardSong) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await api<{
        state: PublicState;
        profile: GuestProfile;
      }>("/api/queue/join", {
        method: "POST",
        body: JSON.stringify({
          name: profile?.name ?? "",
          songHash: song.songHash,
          instrument,
          difficulty,
        }),
      });
      if (res.state) setState(res.state);
      if (res.profile) applyProfile(res.profile);
      setMessage(`Joined ${song.songArtist} — ${song.songName}.`);
      setSelectedHash(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to join");
    } finally {
      setBusy(false);
    }
  };

  const leave = async (id: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await api<PublicState>(`/api/queue/${id}/cancel`, {
        method: "POST",
      });
      setState(next);
      const mine = await api<GuestProfile>("/api/profile");
      applyProfile(mine);
      setMessage("Left that song.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to leave");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page guest queue-page">
      <div className="guest-top">
        <Brand />
        <GuestNav />
      </div>
      <section className="panel">
        <h2>Queue</h2>
        <p className="hint">
          Songs people have started. If a part or player slot is open, join
          that song instead of starting another copy.
        </p>
      </section>
      {error && <p className="error">{error}</p>}
      {message && <p className="notice">{message}</p>}
      {board.length === 0 && (
        <p className="empty">
          Nobody is in the queue yet.{" "}
          <Link to="/songs">Pick a song</Link> to start one.
        </p>
      )}
      <div className="queue-list">
        {board.map((song) => {
          const mine = song.players.filter((p) => myIds.has(p.id));
          const inSong = mine.length > 0;
          return (
            <section key={`${song.status}:${song.setId ?? song.players[0]?.id}`} className="panel queue-song">
              <div className="queue-song-head">
                <p className="label">{statusLabel(song.status)}</p>
                <h3>
                  {song.songArtist} — {song.songName}
                </h3>
                <p className="hint">Started by {song.masterName}</p>
              </div>
              <ul className="queue-players">
                {song.players.map((player) => (
                  <li key={player.id}>
                    <strong>{player.name}</strong>
                    <span>
                      {instrumentLabel(player.instrument)} · {player.difficulty}
                    </span>
                    {myIds.has(player.id) &&
                    (song.status === "waiting" || song.status === "on_deck") ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void leave(player.id)}
                      >
                        Leave
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="queue-slots">
                {song.playerSlotsOpen} player slot
                {song.playerSlotsOpen === 1 ? "" : "s"} open
              </p>
              {inSong ? (
                <p className="hint">You&apos;re on this song.</p>
              ) : song.joinable ? (
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() => setSelectedHash(song.songHash)}
                >
                  Join this song
                </button>
              ) : song.status === "now_playing" ? (
                <p className="hint">This set is already playing.</p>
              ) : (
                <p className="hint">No open parts on this copy.</p>
              )}
            </section>
          );
        })}
      </div>

      {selected &&
        selected.joinable &&
        !selected.players.some((p) => myIds.has(p.id)) && (
        <section className="panel sticky-join">
          <div className="sticky-join-main">
            <h2>
              Join {selected.songArtist} — {selected.songName}
            </h2>
            <div className="row">
              <label className="field">
                <span>Open part</span>
                <select
                  value={joinOptions.includes(instrument) ? instrument : joinOptions[0] ?? instrument}
                  onChange={(e) => {
                    const next = e.target.value as Instrument;
                    setInstrument(next);
                    const auto =
                      profile?.instrumentDefaults?.[next] ?? difficulty;
                    setDifficulty(auto);
                  }}
                >
                  {joinOptions.map((item) => (
                    <option key={item} value={item}>
                      {instrumentLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Difficulty</span>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                >
                  {DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {joinOptions[0] ? (
              <p className="hint">
                <Link
                  to={`/controllers/${controllerSlugForInstrument(
                    joinOptions.includes(instrument)
                      ? instrument
                      : joinOptions[0],
                  )}`}
                >
                  How this controller plays
                </Link>
              </p>
            ) : (
              <p className="hint">No open parts left on this song.</p>
            )}
            <button
              type="button"
              className="primary"
              disabled={busy || joinOptions.length === 0}
              onClick={() => void join(selected)}
            >
              Join this song
            </button>
          </div>
          <button
            type="button"
            className="sticky-join-close"
            aria-label="Close"
            onClick={() => setSelectedHash(null)}
          >
            ×
          </button>
        </section>
      )}
    </div>
  );
}
