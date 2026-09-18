import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { api, type PublicState, type SetupInfo, type SongRecord, type YargPlacement } from "./api";
import "./App.css";

const INSTRUMENTS = [
  "FiveFretGuitar",
  "FiveFretBass",
  "FourLaneDrums",
  "ProDrums",
  "ProKeys",
  "Keys",
  "Vocals",
  "Harmony",
] as const;

const DIFFICULTIES = ["Easy", "Medium", "Hard", "Expert", "ExpertPlus"] as const;

function useLiveState() {
  const [state, setState] = useState<PublicState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await api<PublicState>("/api/state");
        if (!cancelled) {
          setState(next);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      }
    };
    void load();

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws?role=ui`);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as {
          type: string;
          state?: PublicState;
        };
        if (msg.type === "state" && msg.state) setState(msg.state);
        else void load();
      } catch {
        void load();
      }
    };
    const poll = setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      ws.close();
      clearInterval(poll);
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

function GuestPage() {
  const { state, error } = useLiveState();
  const [query, setQuery] = useState("");
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

  const songs = useMemo(() => {
    const list = state?.songs ?? [];
    const verified = list.filter((s) => s.verified);
    const pool = verified.length > 0 ? verified : list;
    const q = query.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter((s) =>
      `${s.name} ${s.artist} ${s.album}`.toLowerCase().includes(q),
    );
  }, [state, query]);

  const myRequest = useMemo(() => {
    if (!state || !name) return null;
    return (
      state.requests.find(
        (r) =>
          r.name === name &&
          (r.status === "waiting" ||
            r.status === "in_set" ||
            r.status === "playing"),
      ) ?? null
    );
  }, [state, name]);

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

  return (
    <div className="page guest">
      <Brand />
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

      {myRequest && (
        <section className="panel">
          <h2>Your spot</h2>
          <p>
            {myRequest.name} · {myRequest.instrument} · {myRequest.difficulty} ·{" "}
            {myRequest.status}
          </p>
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
            placeholder="Artist, title, album…"
          />
        </label>
      </section>

      <section className="song-list">
        {songs.slice(0, 200).map((song) => (
          <button
            key={song.hash}
            type="button"
            className={`song-row ${selected?.hash === song.hash ? "active" : ""}`}
            onClick={() => setSelected(song)}
          >
            <span className="song-title">{song.name}</span>
            <span className="song-artist">{song.artist}</span>
            {!song.verified && <span className="badge">scan</span>}
          </button>
        ))}
        {songs.length === 0 && (
          <p className="empty">No songs yet. Ask the host to scan the library.</p>
        )}
      </section>

      {selected && (
        <section className="panel sticky-join">
          <h2>
            {selected.artist} — {selected.name}
          </h2>
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
                    {i}
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
          <button
            type="button"
            className="primary"
            disabled={busy || !name.trim()}
            onClick={() => void join()}
          >
            Join queue
          </button>
        </section>
      )}

      <nav className="footer-nav">
        <Link to="/display">Display</Link>
        <Link to="/admin">Admin</Link>
      </nav>
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
  const [folders, setFolders] = useState("");
  const [capsText, setCapsText] = useState("");
  const [yargExecutable, setYargExecutable] = useState("");
  const [simulatorEnabled, setSimulatorEnabled] = useState(false);
  const [eventFlags, setEventFlags] = useState({
    hotMic: true,
    showUpNextHud: true,
    skipMainMenu: true,
    openDifficultySelect: true,
  });
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!state) return;
    setFolders(state.settings.songFolders.join("\n"));
    setCapsText(JSON.stringify(state.settings.instrumentCaps, null, 2));
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
      let instrumentCaps: Record<string, number>;
      try {
        instrumentCaps = JSON.parse(capsText) as Record<string, number>;
      } catch {
        throw new Error("Instrument caps must be valid JSON");
      }
      await api("/api/admin/settings", {
        method: "PUT",
        adminPassword: password,
        body: JSON.stringify({
          songFolders: folders
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          instrumentCaps,
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

  const scan = async () => {
    try {
      localStorage.setItem("yaq-admin", password);
      const res = await api<{ count: number }>("/api/library/scan", {
        method: "POST",
        ...authedHeaders,
      });
      setMsg(`Scanned ${res.count} songs.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Scan failed");
    }
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
                <strong>{r.name}</strong> · {r.instrument} · {r.difficulty} ·{" "}
                {r.status}
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
        <h2>Song folders</h2>
        <textarea
          rows={4}
          value={folders}
          onChange={(e) => setFolders(e.target.value)}
          placeholder="/path/to/Songs"
        />
        <div className="row">
          <button type="button" onClick={() => void scan()}>
            Scan library
          </button>
          <button type="button" className="primary" onClick={() => void save()}>
            Save settings
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Instrument caps</h2>
        <textarea
          rows={10}
          value={capsText}
          onChange={(e) => setCapsText(e.target.value)}
        />
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
                        {p.instrument} · {p.difficulty}
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
