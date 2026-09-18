import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { api, type PublicState, type QueueRequest, type SetupInfo, type SongRecord, type YargPlacement } from "./api";
import { DifficultyRings } from "./DifficultyRings";
import { instrumentLabel } from "./labels";
import { applyUiBridgeMessage } from "./liveState";
import {
  distinctGenres,
  filterGuestSongs,
  sortGuestSongs,
  type GuestSort,
} from "./songFilter";
import "./App.css";

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

/** Admin −/+ rows. Same-hardware guitar parts share one cap. */
const CAP_GROUPS = [
  { id: "FiveFret", label: "5-fret guitar / bass / rhythm / coop" },
  { id: "SixFret", label: "6-fret guitar / bass" },
  { id: "ProGuitar", label: "Pro guitar / bass" },
  { id: "Keys", label: "Keys" },
  { id: "ProKeys", label: "Pro keys" },
  { id: "FourLaneDrums", label: "4-lane drums" },
  { id: "ProDrums", label: "Pro drums" },
  { id: "FiveLaneDrums", label: "5-lane drums" },
  { id: "EliteDrums", label: "Elite drums" },
  { id: "Vocals", label: "Vocals / harmony" },
] as const;

const LEGACY_CAP_MEMBERS: Record<string, string[]> = {
  FiveFret: [
    "FiveFretGuitar",
    "FiveFretBass",
    "FiveFretRhythm",
    "FiveFretCoop",
  ],
  SixFret: ["SixFretGuitar", "SixFretBass"],
  ProGuitar: ["ProGuitar_17", "ProBass_17", "ProGuitar_22", "ProBass_22"],
  Vocals: ["Vocals", "Harmony"],
};

const MAX_INSTRUMENT_CAP = 12;
const MIN_SONG_QUEUE_CAP = 1;
const MAX_SONG_QUEUE_CAP = 20;

const ACTIVE_QUEUE = new Set(["waiting", "in_set", "playing"]);

function isActiveRequest(status: string): boolean {
  return ACTIVE_QUEUE.has(status);
}

function isExistingSong(requests: QueueRequest[], songHash: string): boolean {
  return requests.some(
    (r) => r.songHash === songHash && isActiveRequest(r.status),
  );
}

function masterSongCount(requests: QueueRequest[], name: string): number {
  const key = name.trim().toLowerCase();
  if (!key) return 0;
  const active = requests.filter((r) => isActiveRequest(r.status));
  const hashes = [...new Set(active.map((r) => r.songHash))];
  let count = 0;
  for (const hash of hashes) {
    const group = active
      .filter((r) => r.songHash === hash)
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    const master = group[0];
    if (master && master.name.trim().toLowerCase() === key) count += 1;
  }
  return count;
}

const DIFFICULTIES = ["Easy", "Medium", "Hard", "Expert", "ExpertPlus"] as const;

const SORT_OPTIONS: { id: GuestSort; label: string }[] = [
  { id: "genre", label: "Genre" },
  { id: "artist", label: "Artist" },
  { id: "title", label: "Title" },
];

function useLiveState() {
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

function Brand() {
  return (
    <header className="brand">
      <Link to="/" className="brand-mark">
        YAQ
      </Link>
      <p className="brand-sub">Yet Another Queue</p>
    </header>
  );
}

function GuestNav() {
  return (
    <nav className="top-nav">
      <Link to="/display">Display</Link>
      <Link to="/admin">Admin</Link>
    </nav>
  );
}

function GuestPage() {
  const { state, error, setState } = useLiveState();
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("");
  const [sort, setSort] = useState<GuestSort>("artist");
  const [name, setName] = useState(
    () => localStorage.getItem("yaq-name") || "",
  );
  const [selected, setSelected] = useState<SongRecord | null>(null);
  const [instrument, setInstrument] =
    useState<(typeof INSTRUMENTS)[number]>("FiveFretGuitar");
  const [difficulty, setDifficulty] =
    useState<(typeof DIFFICULTIES)[number]>("Expert");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const library = useMemo(() => {
    const list = state?.songs ?? [];
    const verified = list.filter((s) => s.verified);
    return verified.length > 0 ? verified : list;
  }, [state]);

  const genres = useMemo(() => distinctGenres(library), [library]);

  const songs = useMemo(
    () => sortGuestSongs(filterGuestSongs(library, query, genre), sort),
    [library, query, genre, sort],
  );

  const requests = state?.requests ?? [];
  const capEnabled = state?.settings.songQueueCapEnabled !== false;
  const songCap = state?.settings.songQueueCap ?? 5;
  const started = masterSongCount(requests, name);
  const atSongCap = capEnabled && started >= songCap;
  const selectedIsQueued = selected
    ? isExistingSong(requests, selected.hash)
    : false;
  const joinBlocked = Boolean(selected) && atSongCap && !selectedIsQueued;

  const myRequests = useMemo(() => {
    const key = name.trim().toLowerCase();
    if (!key) return [];
    return requests.filter(
      (r) =>
        r.name.trim().toLowerCase() === key && isActiveRequest(r.status),
    );
  }, [requests, name]);

  const join = async () => {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      localStorage.setItem("yaq-name", name.trim());
      await api("/api/queue/join", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          songHash: selected.hash,
          instrument,
          difficulty,
        }),
      });
      setMessage("You're in the queue.");
      setSelected(null);
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
      setMessage("Left that song.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to leave");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page guest">
      <div className="guest-top">
        <Brand />
        <GuestNav />
      </div>
      <section className="panel status-strip">
        <div>
          <span className="label">YARG</span>
          <strong>
            {state?.yargConnected ? state.yargState : "offline"}
          </strong>
        </div>
        <div>
          <span className="label">Now</span>
          <strong>
            {state?.nowPlaying
              ? `${state.nowPlaying.songArtist} — ${state.nowPlaying.songName}`
              : "—"}
          </strong>
        </div>
        <div>
          <span className="label">Up next</span>
          <strong>
            {state?.onDeck
              ? `${state.onDeck.songArtist} — ${state.onDeck.songName}`
              : "—"}
          </strong>
        </div>
      </section>

      {error && <p className="error">{error}</p>}
      {message && <p className="notice">{message}</p>}

      {capEnabled && (
        <p className={`song-cap${atSongCap ? " at-limit" : ""}`}>
          Songs started: {started} / {songCap}
        </p>
      )}

      {myRequests.length > 0 && (
        <section className="panel">
          <h2>Your spot</h2>
          {myRequests.map((req) => {
            const song = library.find((s) => s.hash === req.songHash);
            const canLeave = req.status === "waiting" || req.status === "in_set";
            return (
              <div key={req.id} className="spot-row">
                <p>
                  {song ? `${song.artist} — ${song.name}` : req.songHash} ·{" "}
                  {instrumentLabel(req.instrument)} · {req.difficulty} ·{" "}
                  {req.status}
                </p>
                {canLeave && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void leave(req.id)}
                  >
                    Leave
                  </button>
                )}
              </div>
            );
          })}
        </section>
      )}

      <section className="panel">
        <label className="field">
          <span>Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Display name"
            maxLength={32}
          />
        </label>
        <label className="field">
          <span>Search songs</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Artist, title, genre…"
          />
        </label>
      </section>

      <div className="song-sort" role="group" aria-label="Sort songs">
        <span className="sort-label">Sort</span>
        {SORT_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={sort === option.id ? "active" : ""}
            onClick={() => setSort(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="genre-filters" role="tablist" aria-label="Filter by genre">
        <button
          type="button"
          className={genre === "" ? "active" : ""}
          onClick={() => setGenre("")}
        >
          All
        </button>
        {genres.map((g) => (
          <button
            type="button"
            key={g}
            className={genre.toLowerCase() === g.toLowerCase() ? "active" : ""}
            onClick={() => setGenre(g)}
          >
            {g}
          </button>
        ))}
      </div>

      <section className="song-list">
        {songs.map((song) => {
          return (
            <button
              key={song.hash}
              type="button"
              className={`song-card ${selected?.hash === song.hash ? "active" : ""}`}
              onClick={() => setSelected(song)}
            >
              <span className="song-card-meta">
                <span className="song-title">{song.name}</span>
                <span className="song-artist">{song.artist}</span>
                {song.genre.trim() ? (
                  <span className="song-genre">{song.genre}</span>
                ) : null}
              </span>
              <DifficultyRings song={song} />
            </button>
          );
        })}
        {songs.length === 0 && (
          <p className="empty">
            {library.length === 0
              ? "No songs yet. Wait for YARG to sync the library."
              : "No matching songs."}
          </p>
        )}
      </section>

      {selected && (
        <section className="panel sticky-join">
          <div className="sticky-join-head">
            <h2>
              {selected.artist} — {selected.name}
            </h2>
            <button
              type="button"
              className="sticky-join-close"
              aria-label="Close"
              onClick={() => setSelected(null)}
            >
              ×
            </button>
          </div>
          <div className="row">
            <label className="field">
              <span>Instrument</span>
              <select
                value={instrument}
                onChange={(e) =>
                  setInstrument(e.target.value as (typeof INSTRUMENTS)[number])
                }
              >
                {INSTRUMENTS.map((i) => (
                  <option key={i} value={i}>
                    {instrumentLabel(i)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Difficulty</span>
              <select
                value={difficulty}
                onChange={(e) =>
                  setDifficulty(e.target.value as (typeof DIFFICULTIES)[number])
                }
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {joinBlocked && (
            <p className="hint">
              You&apos;re at the song cap. You can still join a song someone
              else already requested.
            </p>
          )}
          <button
            type="button"
            className="primary"
            disabled={busy || !name.trim() || joinBlocked}
            onClick={() => void join()}
          >
            Join queue
          </button>
        </section>
      )}
    </div>
  );
}

function SetupPage() {
  const { state } = useLiveState();
  const [info, setInfo] = useState<SetupInfo | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [placement, setPlacement] = useState<YargPlacement>("same-machine");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<SetupInfo>("/api/setup")
      .then((next) => {
        setInfo(next);
        setPlacement(next.savedPlacement || next.placement.detected);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load setup");
      });
  }, []);

  if (state?.settings.hasAdminPassword) {
    return <Navigate to="/admin" replace />;
  }

  const submit = async () => {
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/setup", {
        method: "POST",
        body: JSON.stringify({
          adminPassword: password,
          yargPlacement: placement,
          yargExecutable:
            placement === "same-machine" ? info?.yargExecutable ?? "" : "",
        }),
      });
      localStorage.setItem("yaq-admin", password);
      window.location.assign("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  };

  const detected = info?.placement.detected;
  const sameUrl = info?.sameMachineBridgeUrl;
  const remoteUrl = info?.secondMachineBridgeUrl;

  return (
    <div className="page setup">
      <Brand />
      <section className="panel">
        <h2>First-run setup</h2>
        <p className="hint">
          Choose an admin password for this YAQ server. You will need it to
          open the admin page.
        </p>
        <label className="field">
          <span>Admin password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={4}
          />
        </label>
        <label className="field">
          <span>Confirm password</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            minLength={4}
          />
        </label>
      </section>

      <section className="panel">
        <h2>Where is YARG?</h2>
        <p className="hint">
          {info?.placement.detail ?? "Checking this computer for a YARG install…"}
        </p>
        <div className="placement-grid">
          <button
            type="button"
            className={`placement-card ${placement === "same-machine" ? "active" : ""}`}
            onClick={() => setPlacement("same-machine")}
          >
            <strong>Same machine</strong>
            <span>
              YAQ and YARG share this computer. Admin can launch the game
              locally.
            </span>
            {detected === "same-machine" && (
              <em className="badge">detected</em>
            )}
          </button>
          <button
            type="button"
            className={`placement-card ${placement === "second-machine" ? "active" : ""}`}
            onClick={() => setPlacement("second-machine")}
          >
            <strong>Second machine</strong>
            <span>
              YAQ is on this computer; the game PC is elsewhere. Point YARG at
              the LAN WebSocket.
            </span>
            {detected === "second-machine" && (
              <em className="badge">detected</em>
            )}
          </button>
        </div>
        {placement === "same-machine" && info?.yargExecutable && (
          <p className="hint">
            YARG binary: <code>{info.yargExecutable}</code>
            <br />
            Local bridge: <code>{sameUrl}</code>
          </p>
        )}
        {placement === "second-machine" && (
          <p className="hint">
            On the game PC, connect YARG to{" "}
            <code>{remoteUrl}</code>
          </p>
        )}
      </section>

      {error && <p className="error">{error}</p>}
      <button
        type="button"
        className="primary"
        disabled={busy || password.length < 4}
        onClick={() => void submit()}
      >
        Save and continue
      </button>
    </div>
  );
}

function AdminPage() {
  const { state, setState } = useLiveState();
  const [password, setPassword] = useState(
    () => localStorage.getItem("yaq-admin") || "",
  );
  const [unlocked, setUnlocked] = useState(false);
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [caps, setCaps] = useState<Record<string, number>>({});
  const [songQueueCap, setSongQueueCap] = useState(5);
  const [songQueueCapEnabled, setSongQueueCapEnabled] = useState(true);
  const [yargExecutable, setYargExecutable] = useState("");
  const [simulatorEnabled, setSimulatorEnabled] = useState(false);
  const [eventFlags, setEventFlags] = useState({
    hotMic: true,
    showUpNextHud: true,
    skipMainMenu: true,
    openDifficultySelect: true,
  });
  const [msg, setMsg] = useState<string | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    if (!state || hydrated.current) return;
    hydrated.current = true;
    const stored = state.settings.instrumentCaps;
    const nextCaps: Record<string, number> = {};
    for (const group of CAP_GROUPS) {
      const direct = stored[group.id];
      if (Number.isFinite(direct)) {
        nextCaps[group.id] = Number(direct);
        continue;
      }
      const members = LEGACY_CAP_MEMBERS[group.id] ?? [group.id];
      nextCaps[group.id] = members.reduce(
        (sum, key) => sum + (Number(stored[key]) || 0),
        0,
      );
    }
    setCaps(nextCaps);
    setSongQueueCap(Number(state.settings.songQueueCap) || 5);
    setSongQueueCapEnabled(state.settings.songQueueCapEnabled !== false);
    setYargExecutable(state.settings.yargExecutable ?? "");
    setSimulatorEnabled(state.settings.simulatorEnabled ?? false);
    if (state.settings.eventFlags) {
      setEventFlags({ ...state.settings.eventFlags });
    }
  }, [state]);

  useEffect(() => {
    if (!state?.settings.hasAdminPassword || unlocked) return;
    const stored = localStorage.getItem("yaq-admin");
    if (!stored) return;
    let cancelled = false;
    void api("/api/admin/settings", { adminPassword: stored })
      .then(() => {
        if (cancelled) return;
        setPassword(stored);
        setUnlocked(true);
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem("yaq-admin");
      });
    return () => {
      cancelled = true;
    };
  }, [state, unlocked]);

  const authedHeaders = { adminPassword: password };
  const sameMachine = state?.settings.yargPlacement !== "second-machine";
  const bridgeUrl = sameMachine
    ? `ws://127.0.0.1:${state?.settings.hostPort ?? 3000}/ws?role=yarg`
    : `ws://${location.host}/ws?role=yarg`;

  const unlock = async () => {
    setUnlockBusy(true);
    setMsg(null);
    try {
      await api("/api/admin/settings", { adminPassword: password });
      localStorage.setItem("yaq-admin", password);
      setUnlocked(true);
    } catch (err) {
      localStorage.removeItem("yaq-admin");
      setMsg(err instanceof Error ? err.message : "Unlock failed");
    } finally {
      setUnlockBusy(false);
    }
  };

  const changePassword = async () => {
    setMsg(null);
    if (newPassword !== confirmPassword) {
      setMsg("New passwords do not match.");
      return;
    }
    try {
      await api("/api/admin/password", {
        method: "POST",
        adminPassword: password,
        body: JSON.stringify({ newPassword }),
      });
      localStorage.setItem("yaq-admin", newPassword);
      setPassword(newPassword);
      setNewPassword("");
      setConfirmPassword("");
      setMsg("Admin password updated.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Password change failed");
    }
  };

  const save = async () => {
    try {
      localStorage.setItem("yaq-admin", password);
      await api("/api/admin/settings", {
        method: "PUT",
        adminPassword: password,
        body: JSON.stringify({
          instrumentCaps: caps,
          songQueueCap,
          songQueueCapEnabled,
          yargExecutable: yargExecutable.trim(),
          simulatorEnabled,
          eventFlags,
        }),
      });
      setMsg("Settings saved.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Save failed");
    }
  };

  const bumpCap = (instrument: string, delta: number) => {
    setCaps((prev) => {
      const current = prev[instrument] ?? 0;
      const next = Math.min(MAX_INSTRUMENT_CAP, Math.max(0, current + delta));
      return { ...prev, [instrument]: next };
    });
  };

  const bumpSongQueueCap = (delta: number) => {
    setSongQueueCap((prev) =>
      Math.min(MAX_SONG_QUEUE_CAP, Math.max(MIN_SONG_QUEUE_CAP, prev + delta)),
    );
  };

  const launch = async () => {
    try {
      await api("/api/admin/launch", { method: "POST", ...authedHeaders });
      setMsg("Launched on-deck set.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Launch failed");
    }
  };

  const launchYarg = async () => {
    try {
      localStorage.setItem("yaq-admin", password);
      const res = await api<{ command: string; pid: number }>(
        "/api/admin/yarg/launch",
        { method: "POST", ...authedHeaders },
      );
      setMsg(`Started YARG (pid ${res.pid}): ${res.command}`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed to start YARG");
    }
  };

  const setEventMode = async (enabled: boolean) => {
    try {
      localStorage.setItem("yaq-admin", password);
      const res = await api<{ state: PublicState }>(
        "/api/admin/yarg/event-mode",
        {
          method: "POST",
          ...authedHeaders,
          body: JSON.stringify({ enabled }),
        },
      );
      if (res.state) setState(res.state);
      setMsg(enabled ? "Entered Event Mode." : "Exited Event Mode.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Event Mode change failed");
    }
  };

  const skip = async () => {
    try {
      await api("/api/admin/skip-on-deck", {
        method: "POST",
        ...authedHeaders,
      });
      setMsg("Skipped on-deck set.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Skip failed");
    }
  };

  const toggleFlag = (key: keyof typeof eventFlags) => {
    setEventFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (state && !state.settings.hasAdminPassword) {
    return <Navigate to="/setup" replace />;
  }

  if (!unlocked) {
    return (
      <div className="page admin">
        <Brand />
        <section className="panel">
          <h2>Admin lock</h2>
          <p className="hint">Enter the admin password chosen during setup.</p>
          <label className="field">
            <span>Admin password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              onKeyDown={(e) => {
                if (e.key === "Enter") void unlock();
              }}
            />
          </label>
          {msg && <p className="error">{msg}</p>}
          <button
            type="button"
            className="primary"
            disabled={unlockBusy || !password}
            onClick={() => void unlock()}
          >
            Unlock
          </button>
        </section>
        <nav className="footer-nav">
          <Link to="/">Guest</Link>
          <Link to="/display">Display</Link>
        </nav>
      </div>
    );
  }

  return (
    <div className="page admin">
      <Brand />
      <section className="panel">
        <h2>Admin password</h2>
        <p className="hint">Change the password used to unlock this page.</p>
        <label className="field">
          <span>New password</span>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={4}
          />
        </label>
        <label className="field">
          <span>Confirm new password</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            minLength={4}
          />
        </label>
        {msg && <p className="notice">{msg}</p>}
        <button
          type="button"
          disabled={newPassword.length < 4}
          onClick={() => void changePassword()}
        >
          Change password
        </button>
      </section>

      <section className="panel">
        <h2>YARG game</h2>
        <p>
          Placement:{" "}
          <strong>
            {sameMachine
              ? "same machine as YAQ"
              : "YARG is on a second machine"}
          </strong>
        </p>
        <p>
          Stream:{" "}
          <strong>
            {state?.yargConnected ? state.yargState : "disconnected"}
          </strong>
          {" · "}
          Event Mode:{" "}
          <strong>
            {!state?.hasYargClient
              ? "n/a"
              : state.eventModeEnabled
                ? "on"
                : "off"}
          </strong>
        </p>
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={!state?.hasYargClient || state.eventModeEnabled}
            onClick={() => void setEventMode(true)}
          >
            Enter Event Mode
          </button>
          <button
            type="button"
            disabled={!state?.hasYargClient || !state.eventModeEnabled}
            onClick={() => void setEventMode(false)}
          >
            Exit Event Mode
          </button>
        </div>
        <p className="hint">
          Exit keeps the YARG bridge connected so you can re-enter later without
          restarting the game.
        </p>
        {sameMachine ? (
          <>
            <label className="field">
              <span>YARG executable path</span>
              <input
                type="text"
                value={yargExecutable}
                onChange={(e) => setYargExecutable(e.target.value)}
                placeholder="/path/to/YARG"
              />
            </label>
            <p className="hint">
              Launch command:{" "}
              <code>
                {yargExecutable.trim() || "./YARG"} -event-mode -yaq-url &quot;
                {bridgeUrl}&quot;
              </code>
            </p>
            <div className="row">
              <button
                type="button"
                className="primary"
                onClick={() => void launchYarg()}
              >
                Launch YARG
              </button>
              <button type="button" className="primary" onClick={() => void save()}>
                Save settings
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="hint">
              On the game PC, connect YARG to <code>{bridgeUrl}</code>
            </p>
            <div className="row">
              <button type="button" className="primary" onClick={() => void save()}>
                Save settings
              </button>
            </div>
          </>
        )}
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={simulatorEnabled}
            onChange={() => setSimulatorEnabled((v) => !v)}
          />
          <span>Enable YARG simulator (no game binary)</span>
        </label>
      </section>

      <section className="panel">
        <h2>Queue control</h2>
        <p>
          On deck:{" "}
          {state?.onDeck
            ? `${state.onDeck.songArtist} — ${state.onDeck.songName}`
            : "none"}
        </p>
        <div className="row">
          <button type="button" className="primary" onClick={() => void launch()}>
            Launch next
          </button>
          <button type="button" onClick={() => void skip()}>
            Skip on deck
          </button>
        </div>
        <ul className="queue-board">
          {(state?.requests ?? [])
            .filter((r) => r.status !== "done" && r.status !== "cancelled")
            .map((r) => (
              <li key={r.id}>
                <strong>{r.name}</strong> · {instrumentLabel(r.instrument)} ·{" "}
                {r.difficulty} · {r.status}
              </li>
            ))}
        </ul>
      </section>

      <section className="panel">
        <h2>YARG event flags</h2>
        <p className="hint">
          Pushed to the connected YARG client over the WebSocket. Save to apply.
        </p>
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={eventFlags.hotMic}
            onChange={() => toggleFlag("hotMic")}
          />
          <span>Hot mic (host talkback)</span>
        </label>
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={eventFlags.showUpNextHud}
            onChange={() => toggleFlag("showUpNextHud")}
          />
          <span>Show up-next HUD</span>
        </label>
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={eventFlags.skipMainMenu}
            onChange={() => toggleFlag("skipMainMenu")}
          />
          <span>Skip main menu</span>
        </label>
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={eventFlags.openDifficultySelect}
            onChange={() => toggleFlag("openDifficultySelect")}
          />
          <span>Open difficulty select on launch</span>
        </label>
      </section>

      <section className="panel">
        <h2>Song cap</h2>
        <p className="hint">
          How many songs a player may start. Joining a song someone else already
          requested does not count. Turn the switch off to disable the limit.
        </p>
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={songQueueCapEnabled}
            onChange={() => setSongQueueCapEnabled((v) => !v)}
          />
          <span>Limit songs each player can start</span>
        </label>
        <div className="cap-row">
          <span className="cap-name">Max songs started</span>
          <div className="cap-stepper">
            <button
              type="button"
              aria-label="Decrease max songs started"
              disabled={songQueueCap <= MIN_SONG_QUEUE_CAP}
              onClick={() => bumpSongQueueCap(-1)}
            >
              −
            </button>
            <strong className="cap-value">{songQueueCap}</strong>
            <button
              type="button"
              aria-label="Increase max songs started"
              disabled={songQueueCap >= MAX_SONG_QUEUE_CAP}
              onClick={() => bumpSongQueueCap(1)}
            >
              +
            </button>
          </div>
        </div>
        <div className="row">
          <button type="button" className="primary" onClick={() => void save()}>
            Save settings
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Instrument caps</h2>
        <p className="hint">
          How many of each controller this event has. 5-fret guitar, bass,
          rhythm, and coop share one cap. Vocals and harmony share one cap.
          6-fret and pro guitar/bass also share. Zero keeps that type out of
          pairing.
        </p>
        <ul className="cap-list">
          {CAP_GROUPS.map((group) => (
            <li key={group.id} className="cap-row">
              <span className="cap-name">{group.label}</span>
              <div className="cap-stepper">
                <button
                  type="button"
                  aria-label={`Decrease ${group.label}`}
                  disabled={(caps[group.id] ?? 0) <= 0}
                  onClick={() => bumpCap(group.id, -1)}
                >
                  −
                </button>
                <strong className="cap-value">{caps[group.id] ?? 0}</strong>
                <button
                  type="button"
                  aria-label={`Increase ${group.label}`}
                  disabled={(caps[group.id] ?? 0) >= MAX_INSTRUMENT_CAP}
                  onClick={() => bumpCap(group.id, 1)}
                >
                  +
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="row">
          <button type="button" className="primary" onClick={() => void save()}>
            Save settings
          </button>
        </div>
      </section>

      <nav className="footer-nav">
        <Link to="/">Guest</Link>
        <Link to="/display">Display</Link>
      </nav>
    </div>
  );
}

function DisplayPage() {
  const { state } = useLiveState();
  const [qr, setQr] = useState<{ url: string; dataUrl: string } | null>(null);

  useEffect(() => {
    void api<{ url: string; dataUrl: string }>("/api/qr").then(setQr);
  }, []);

  const preview = state?.queuePreview;
  const nowPlaying = state?.nowPlaying;
  const previewCover = preview?.songHash
    ? `/api/songs/${encodeURIComponent(preview.songHash)}/cover`
    : null;
  const nowCover = nowPlaying?.songHash
    ? `/api/songs/${encodeURIComponent(nowPlaying.songHash)}/cover`
    : null;

  return (
    <div className="page display">
      <div className="display-grid">
        <section className="display-main">
          <p className="eyebrow">YAQ</p>
          {nowPlaying && (
            <div className="display-now">
              <p className="eyebrow subtle">Now playing</p>
              <div className="display-song-row">
                {nowCover && (
                  <img
                    className="display-art"
                    src={nowCover}
                    alt=""
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                )}
                <div>
                  <h2 className="display-song">
                    {nowPlaying.songArtist}
                    <span> — </span>
                    {nowPlaying.songName}
                  </h2>
                </div>
              </div>
            </div>
          )}
          <h1>Up next</h1>
          {preview?.songName ? (
            <div className="display-song-row">
              {previewCover && (
                <img
                  className="display-art large"
                  src={previewCover}
                  alt=""
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              )}
              <div>
                <h2 className="display-song">
                  {preview.songArtist}
                  <span> — </span>
                  {preview.songName}
                </h2>
                <ul className="display-players">
                  {preview.players.map((p) => (
                    <li key={`${p.name}-${p.instrument}`}>
                      <strong>{p.name}</strong>
                      <span>
                        {instrumentLabel(p.instrument)} · {p.difficulty}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="empty-large">Waiting for the next group…</p>
          )}
        </section>
        <aside className="display-qr">
          {qr && <img src={qr.dataUrl} alt="Join YAQ QR code" />}
          <p>Scan to join</p>
          <code>{qr?.url}</code>
        </aside>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<GuestPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/display" element={<DisplayPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
