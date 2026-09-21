import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type PlayerTurn } from "./api";
import { Brand, GuestNav } from "./chrome";
import { instrumentLabel } from "./labels";
import { useLiveState } from "./useLiveState";

function statusCopy(turn: PlayerTurn | null): string {
  if (!turn?.active) {
    return "Queue vocals to get a mic for a song. This page will open when it's your turn.";
  }
  if (turn.status === "now_playing" && turn.ready) {
    return "You're on. Sing into the mic shown below.";
  }
  if (turn.yourTurn && turn.ready) {
    return "You're ready. Waiting for everyone else to ready up.";
  }
  if (turn.yourTurn) {
    return "It's your turn. Grab that mic, then tap Ready.";
  }
  if (turn.status === "on_deck") {
    return "You're up next. Get to that mic.";
  }
  return "You're in the queue. This page will switch here when it's your turn.";
}

export function PlayerPage() {
  const { state, setState } = useLiveState();
  const [turn, setTurn] = useState<PlayerTurn | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [coverBroken, setCoverBroken] = useState(false);

  const load = () => {
    void api<PlayerTurn>("/api/player")
      .then((next) => {
        setTurn(next);
        setCoverBroken(false);
      })
      .catch((err) => {
        setMessage(err instanceof Error ? err.message : "Could not load player");
      });
  };

  const queueSig = [
    state?.yargState,
    state?.onDeck?.id,
    state?.nowPlaying?.id,
    (state?.readyRequestIds ?? []).join(","),
    (state?.requests ?? []).map((r) => `${r.id}:${r.status}`).join("|"),
  ].join("/");

  useEffect(() => {
    load();
  }, [queueSig]);

  const ready = async () => {
    if (!turn?.active || turn.ready) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await api<{ turn: PlayerTurn; state: typeof state }>(
        "/api/player/ready",
        { method: "POST" },
      );
      setTurn(res.turn);
      if (res.state) setState(res.state);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not ready");
    } finally {
      setBusy(false);
    }
  };

  const song = turn?.songName || "Waiting for a song";
  const artist = turn?.songArtist || "";
  const micLabel = turn?.mic ? `Mic ${turn.mic}` : "Mic";
  const cover = turn?.songHash ? `/api/songs/${turn.songHash}/cover` : null;

  return (
    <div className="page player">
      <div className="guest-top">
        <Brand />
        <GuestNav />
      </div>
      <section className={`panel player-card${turn?.ready ? " is-ready" : ""}`}>
        {cover && !coverBroken ? (
          <img
            className="player-cover"
            src={cover}
            alt=""
            onError={() => setCoverBroken(true)}
          />
        ) : null}
        <p className="player-kicker">
          {turn?.yourTurn ? "Your turn" : turn?.active ? "Your song" : "Mic player"}
        </p>
        <h2>{artist ? `${artist} — ${song}` : song}</h2>
        {turn?.instrument ? (
          <p className="hint">
            {instrumentLabel(turn.instrument)}
            {turn.difficulty ? ` · ${turn.difficulty}` : ""}
            {turn.micCount > 1 ? ` · ${turn.micCount} mics` : ""}
          </p>
        ) : (
          <p className="hint">{statusCopy(turn)}</p>
        )}
        <div className="player-mic" aria-label={micLabel}>
          <span>{micLabel}</span>
        </div>
        <p className="player-status">{statusCopy(turn)}</p>
        <button
          type="button"
          className={`player-ready${turn?.ready ? " is-ready" : ""}`}
          disabled={busy || !turn?.active || turn.ready}
          onClick={() => void ready()}
        >
          {turn?.ready ? "Ready" : "Ready ?"}
        </button>
        {message && <p className="error">{message}</p>}
      </section>
      <p className="hint">
        Guitar and drums still ready with green on the controller. Mics ready
        here. <Link to="/songs">Browse songs</Link>
      </p>
    </div>
  );
}
