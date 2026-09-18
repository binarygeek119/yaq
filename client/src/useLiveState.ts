import { useEffect, useState } from "react";
import { api, type PublicState } from "./api";
import { applyUiBridgeMessage } from "./liveState";

export function useLiveState() {
  const [state, setState] = useState<PublicState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let gen = 0;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      const my = ++gen;
      try {
        const next = await api<PublicState>("/api/state");
        if (!cancelled && my === gen) {
          setState(next);
          setError(null);
        }
      } catch (err) {
        if (!cancelled && my === gen) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      }
    };

    const scheduleLoad = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        void load();
      }, 400);
    };

    void load();

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws?role=ui`);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as {
          type: string;
          state?: unknown;
          enabled?: boolean;
          preview?: PublicState["queuePreview"];
        };
        const peek = applyUiBridgeMessage(null, msg);
        if (msg.type === "state" && peek.state) {
          gen += 1;
          setState(peek.state);
        } else {
          if (msg.type === "eventmode.state" || msg.type === "yarg.state") {
            gen += 1;
          }
          setState((prev) => applyUiBridgeMessage(prev, msg).state);
        }
        if (peek.refetch) scheduleLoad();
      } catch {
        scheduleLoad();
      }
    };
    const poll = setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      ws.close();
      clearInterval(poll);
      if (debounce) clearTimeout(debounce);
    };
  }, []);

  return { state, error, setState };
}
