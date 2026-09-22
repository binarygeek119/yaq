import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, type PlayerTurn } from "./api";
import {
  emptyPlayerPageNav,
  nextPlayerPageNav,
  type PlayerPageNavState,
} from "./playerPageNav";
import { useLiveState } from "./useLiveState";

const SKIP = new Set(["/admin", "/setup"]);

export function PlayerTurnWatcher() {
  const { state } = useLiveState();
  const navigate = useNavigate();
  const location = useLocation();
  const nav = useRef<PlayerPageNavState>(emptyPlayerPageNav);

  const sig = [
    state?.yargState,
    state?.onDeck?.id,
    state?.nowPlaying?.id,
    state?.onDeck?.playerIds?.join(","),
    location.pathname,
  ].join("/");

  useEffect(() => {
    let cancelled = false;
    void api<PlayerTurn>("/api/player")
      .then((turn) => {
        if (cancelled) return;
        const next = nextPlayerPageNav(
          {
            pathname: location.pathname,
            skip: SKIP.has(location.pathname),
            yourTurn: Boolean(turn.active && turn.yourTurn),
            turnKey: turn.requestId ?? turn.songHash ?? "",
          },
          nav.current,
        );
        nav.current = { openedKey: next.openedKey, dismissedKey: next.dismissedKey };
        if (next.navigate) navigate("/player");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sig, location.pathname, navigate]);

  return null;
}
