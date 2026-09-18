import { useEffect, useRef, useState } from "react";
import { api, type GuestProfile, type PublicState } from "./api";
import { showQueueNotification } from "./notifications";
import { pendingQueueAlert, queueAlertCopy } from "./queueAlerts";

const FIRED_KEY = "yaq-queue-alerts";

function loadFired(): Set<string> {
  try {
    const raw = sessionStorage.getItem(FIRED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveFired(fired: Set<string>): void {
  try {
    sessionStorage.setItem(FIRED_KEY, JSON.stringify([...fired]));
  } catch {
    /* private mode */
  }
}

function songLabel(
  state: PublicState,
  songHash: string,
): { name: string; artist: string } {
  if (state.onDeck?.songHash === songHash) {
    return { name: state.onDeck.songName, artist: state.onDeck.songArtist };
  }
  const song = state.songs.find((s) => s.hash === songHash);
  return { name: song?.name ?? "your song", artist: song?.artist ?? "" };
}

export function QueueAlertWatcher() {
  const fired = useRef(loadFired());
  const [toast, setToast] = useState<{ title: string; body: string } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    let hide: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const [state, profile] = await Promise.all([
          api<PublicState>("/api/state"),
          api<GuestProfile>("/api/profile"),
        ]);
        if (cancelled) return;
        const alert = pendingQueueAlert(
          state.requests,
          state.onDeck,
          new Set(profile.requestIds),
          fired.current,
        );
        if (!alert) return;
        fired.current.add(alert.key);
        saveFired(fired.current);
        const { name, artist } = songLabel(state, alert.songHash);
        const copy = queueAlertCopy(alert.kind, alert.ahead, name, artist);
        showQueueNotification(copy.title, copy.body);
        setToast(copy);
        if (hide) clearTimeout(hide);
        hide = setTimeout(() => {
          if (!cancelled) setToast(null);
        }, 8000);
      } catch {
        /* keep polling */
      }
    };

    void tick();
    const poll = setInterval(() => void tick(), 2000);
    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(poll);
      if (hide) clearTimeout(hide);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  if (!toast) return null;
  return (
    <div className="queue-alert-toast" role="status">
      <strong>{toast.title}</strong>
      <span>{toast.body}</span>
    </div>
  );
}
