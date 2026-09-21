import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, type PlayerTurn } from "./api";
import { useLiveState } from "./useLiveState";

const SKIP = new Set(["/admin", "/setup"]);

export function PlayerTurnWatcher() {
  const { state } = useLiveState();
  const navigate = useNavigate();
  const location = useLocation();
  const lastKey = useRef("");

  const sig = [
    state?.yargState,
    state?.onDeck?.id,
    state?.nowPlaying?.id,
    state?.onDeck?.playerIds?.join(","),
    location.pathname,
  ].join("/");

  useEffect(() => {
    if (SKIP.has(location.pathname)) return;
    let cancelled = false;
    void api<PlayerTurn>("/api/player")
      .then((turn) => {
        if (cancelled || !turn.active || !turn.yourTurn) return;
        const key = turn.requestId ?? turn.songHash ?? "";
        if (turn.ready && lastKey.current === key) return;
        lastKey.current = key;
        if (location.pathname !== "/player") navigate("/player");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sig, location.pathname, navigate]);

  return null;
}
