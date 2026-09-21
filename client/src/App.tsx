import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import {
  api,
  type Difficulty,
  type GuestProfile,
  type Instrument,
  type Letterboard,
  type PublicState,
  type QueueRequest,
  type ScoreRun,
  type SetupInfo,
  type SongRecord,
  type YargPlacement,
} from "./api";
import { DifficultyRings } from "./DifficultyRings";
import {
  INSTRUMENT_SORT_SLOTS,
  instrumentIcon,
  instrumentLabel,
  type InstrumentSortId,
} from "./labels";
import { NotificationPrompt } from "./NotificationPrompt";
import {
  httpsLanOrigin,
  sendTestNotification,
  testNotifyStatus,
  toHttpsPageUrl,
} from "./notifications";
import { QueueAlertWatcher } from "./QueueAlertWatcher";
import { EventLetterboard } from "./Letterboard";
import { DeviceScores } from "./ScoreScreen";
import { FirstLogin } from "./FirstLogin";
import { Brand, GuestNav, YaqVersion } from "./chrome";
import {
  ControllerDetail,
  ControllersIndex,
} from "./ControllerPages";
import { controllerSlugForInstrument } from "./controllers";
import { photoUploadError, prepareProfilePhoto } from "./photo";
import { useLiveState } from "./useLiveState";
import { QueuePage } from "./QueuePage";
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

type LeaveEventResult = {
  cancelled: number;
  state: PublicState;
  profile: GuestProfile;
};

function LeaveEventButton({
  disabled,
  onLeft,
  onError,
}: {
  disabled?: boolean;
  onLeft: (result: LeaveEventResult) => void;
  onError?: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="leave-event"
      disabled={disabled || busy}
      onClick={() => {
        if (
          !window.confirm(
            "Leave this event? Songs you queued will be removed. Your profile stays on this phone.",
          )
        ) {
          return;
        }
        setBusy(true);
        void api<LeaveEventResult>("/api/queue/leave-event", {
          method: "POST",
        })
          .then(onLeft)
          .catch((err) => {
            onError?.(
              err instanceof Error ? err.message : "Could not leave the event",
            );
          })
          .finally(() => setBusy(false));
      }}
    >
      Leave event
    </button>
  );
}

function masterSongCount(requests: QueueRequest[], ids: Set<string>): number {
  if (ids.size === 0) return 0;
  const active = requests.filter((r) => isActiveRequest(r.status));
  const hashes = [...new Set(active.map((r) => r.songHash))];
  let count = 0;
  for (const hash of hashes) {
    const group = active
      .filter((r) => r.songHash === hash)
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    const master = group[0];
    if (master && ids.has(master.id)) count += 1;
  }
  return count;
}

const DIFFICULTIES = ["Easy", "Medium", "Hard", "Expert", "ExpertPlus"] as const;

const SORT_OPTIONS: { id: GuestSort; label: string }[] = [
  { id: "genre", label: "Genre" },
  { id: "artist", label: "Artist" },
  { id: "title", label: "Title" },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function HomePage() {
  return (
    <div className="page home">
      <div className="guest-top">
        <Brand />
        <GuestNav />
      </div>
      <section className="panel home-card">
        <h2>Welcome</h2>
        <p className="hint">
          Browse songs on this phone, or open the queue to join a song
          someone else already started.
        </p>
        <div className="home-actions">
          <Link to="/songs" className="primary">
            Browse songs
          </Link>
          <Link to="/queue" className="secondary">
            Queue
          </Link>
          <Link to="/controllers" className="secondary">
            Controllers
          </Link>
          <Link to="/profile" className="secondary">
            Your profile
          </Link>
        </div>
      </section>
    </div>
  );
}

function ProfilePage() {
  const { state } = useLiveState();
  const [profile, setProfile] = useState<GuestProfile | null>(null);
  const [name, setName] = useState("");
  const [defaults, setDefaults] = useState<
    Partial<Record<Instrument, Difficulty>>
  >({});
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = useRef(false);
  const importInput = useRef<HTMLInputElement>(null);

  const photoSrc = preview || profile?.photoUrl || null;

  useEffect(() => {
    let cancelled = false;
    void api<GuestProfile>("/api/profile")
      .then((next) => {
        if (cancelled) return;
        setProfile(next);
        setName(next.name);
        setDefaults(next.instrumentDefaults ?? {});
        ready.current = true;
      })
      .catch(() => {
        ready.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = async (
    patch: {
      name?: string;
      instrumentDefaults?: Partial<Record<Instrument, Difficulty>>;
      photoDataUrl?: string | null;
    },
  ) => {
    if (!ready.current) return;
    try {
      const next = await api<GuestProfile>("/api/profile", {
        method: "PUT",
        body: JSON.stringify({
          name: patch.name ?? name,
          ...(patch.instrumentDefaults
            ? { instrumentDefaults: patch.instrumentDefaults }
            : {}),
          ...(patch.photoDataUrl !== undefined
            ? { photoDataUrl: patch.photoDataUrl }
            : {}),
        }),
      });
      setProfile(next);
      if (patch.name != null) setName(next.name);
      if (patch.instrumentDefaults) {
        setDefaults(next.instrumentDefaults ?? {});
      }
      if (patch.photoDataUrl !== undefined) setPreview(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save profile");
    }
  };

  const onPickPhoto = (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    void prepareProfilePhoto(file)
      .then((dataUrl) => {
        setPreview(dataUrl);
        return persist({ photoDataUrl: dataUrl });
      })
      .catch((err) => {
        setMessage(photoUploadError(err));
      })
      .finally(() => setBusy(false));
  };

  const exportScores = async () => {
    setBusy(true);
    setMessage(null);
    setNotice(null);
    try {
      const exported = await api<{
        filename: string;
        file: unknown;
      }>("/api/profile/scores/export");
      const blob = new Blob([JSON.stringify(exported.file, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = exported.filename || "yaq-scores.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice("Saved your scores. Keep this file for the next event.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not export scores");
    } finally {
      setBusy(false);
    }
  };

  const importScores = (file: File | undefined) => {
    if (!file) return;
    if (state?.settings.allowImportedScores !== true) {
      setMessage("Imported last-event scores are not allowed this event.");
      return;
    }
    setBusy(true);
    setMessage(null);
    setNotice(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? ""));
        void api<{
          imported: number;
          skipped: number;
          eventName: string;
          exportedAt: string;
        }>("/api/profile/scores/import", {
          method: "POST",
          body: JSON.stringify(parsed),
        })
          .then((result) => {
            const when = result.exportedAt
              ? new Date(result.exportedAt).toLocaleDateString()
              : "";
            const from = [result.eventName, when].filter(Boolean).join(" · ");
            setNotice(
              result.imported === 0 && result.skipped > 0
                ? `Those scores are already on this phone${from ? ` (${from})` : ""}.`
                : `Imported ${result.imported} score${result.imported === 1 ? "" : "s"} from ${from || "last event"}.`,
            );
          })
          .catch((err) => {
            setMessage(
              err instanceof Error ? err.message : "Could not import scores",
            );
          })
          .finally(() => setBusy(false));
      } catch {
        setBusy(false);
        setMessage("This file was edited or is not a YAQ score export.");
      }
    };
    reader.onerror = () => {
      setBusy(false);
      setMessage("Could not read that file");
    };
    reader.readAsText(file);
  };

  const eventName = state?.settings.eventName || "this event";
  const importAllowed = state?.settings.allowImportedScores === true;

  return (
    <div className="page profile">
      <div className="guest-top">
        <Brand />
        <GuestNav />
      </div>
      <section className="panel">
        <h2>Profile settings</h2>
        <p className="hint">
          Name, picture, and default difficulty for this phone. Joining a song
          uses these automatically.
        </p>
        <label className="avatar-picker">
          {photoSrc ? (
            <img className="avatar" src={photoSrc} alt="" />
          ) : (
            <span className="avatar placeholder">{initials(name)}</span>
          )}
          <span>Add picture</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            disabled={busy}
            onChange={(e) => {
              onPickPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <label className="field">
          <span>Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void persist({ name })}
            placeholder="Display name"
            maxLength={32}
          />
        </label>
      </section>
      <section className="panel">
        <h2>Default difficulty</h2>
        <p className="hint">
          Picking an instrument in the queue uses this difficulty automatically.
        </p>
        <ul className="defaults-list">
          {INSTRUMENTS.map((id) => (
            <li key={id} className="default-row">
              <img src={`/yarg-icons/${instrumentIcon(id)}.png`} alt="" />
              <span>{instrumentLabel(id)}</span>
              <select
                value={defaults[id] ?? "Expert"}
                onChange={(e) => {
                  const difficulty = e.target.value as Difficulty;
                  const next = { ...defaults, [id]: difficulty };
                  setDefaults(next);
                  void persist({ instrumentDefaults: { [id]: difficulty } });
                }}
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </section>
      {message && <p className="error">{message}</p>}
      {notice && <p className="notice">{notice}</p>}
      <section className="panel score-transfer">
        <h2>Scores for next event</h2>
        <p className="hint">
          Export this phone&apos;s scores from {eventName} to bring them to the
          next night. Import rejects files that were edited.
          {importAllowed
            ? " Last-event imports count on tonight's scores."
            : " Admin is using tonight's scores only, so import is off."}
        </p>
        {state?.eventHash ? (
          <p className="event-hash">Event {state.eventHash.slice(0, 12)}…</p>
        ) : null}
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => void exportScores()}
          >
            Export scores
          </button>
          <button
            type="button"
            disabled={busy || !importAllowed}
            onClick={() => importInput.current?.click()}
          >
            Import last event
          </button>
          <input
            ref={importInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              importScores(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      </section>
      <section className="panel">
        <h2>Leave event</h2>
        <p className="hint">
          Pull this phone&apos;s songs out of {eventName}. Your profile and
          scores stay here.
        </p>
        <LeaveEventButton
          disabled={busy}
          onLeft={(result) => {
            setMessage(null);
            setNotice(
              result.cancelled === 0
                ? "You're not in tonight's queue."
                : `Left the event. Removed ${result.cancelled} queued song${
                    result.cancelled === 1 ? "" : "s"
                  }.`,
            );
          }}
          onError={(msg) => {
            setNotice(null);
            setMessage(msg);
          }}
        />
      </section>
      <Link
        to="/songs"
        className="primary profile-continue"
        onClick={() => void persist({ name })}
      >
        Browse songs
      </Link>
    </div>
  );
}

function useViewportBoundedRail() {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const mq = window.matchMedia("(max-width: 800px)");
    let frame = 0;
    const apply = () => {
      if (mq.matches) {
        if (el.style.maxHeight) el.style.maxHeight = "";
        return;
      }
      const top = el.getBoundingClientRect().top;
      const join = document.querySelector(".sticky-join");
      let joinOverlap = 0;
      if (join) {
        const jr = join.getBoundingClientRect();
        joinOverlap = Math.max(0, window.innerHeight - jr.top);
      }
      const next = `${Math.max(160, window.innerHeight - top - 12 - joinOverlap)}px`;
      if (el.style.maxHeight !== next) el.style.maxHeight = next;
    };
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };

    apply();
    const ro = new ResizeObserver(fit);
    ro.observe(document.body);
    window.addEventListener("scroll", fit, { passive: true });
    window.addEventListener("resize", fit);
    mq.addEventListener("change", fit);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("scroll", fit);
      window.removeEventListener("resize", fit);
      mq.removeEventListener("change", fit);
      el.style.maxHeight = "";
    };
  }, []);

  return ref;
}

function GuestPage() {
  const { state, error, setState } = useLiveState();
  const genreRail = useViewportBoundedRail();
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("");
  const [sort, setSort] = useState<GuestSort>("artist");
  const [sortInstrument, setSortInstrument] =
    useState<InstrumentSortId>("FiveFretGuitar");
  const [profile, setProfile] = useState<GuestProfile | null>(null);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<SongRecord | null>(null);
  const [instrument, setInstrument] = useState<Instrument>("FiveFretGuitar");
  const [difficulty, setDifficulty] = useState<Difficulty>("Expert");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const profileReady = useRef(false);
  const nameDirty = useRef(false);

  const applyProfile = (next: GuestProfile, opts?: { overwriteName?: boolean }) => {
    setProfile(next);
    setInstrument(next.instrument);
    setDifficulty(
      next.instrumentDefaults?.[next.instrument] ?? next.difficulty,
    );
    if (opts?.overwriteName || !nameDirty.current) {
      setName(next.name);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void api<GuestProfile>("/api/profile")
      .then((next) => {
        if (cancelled) return;
        applyProfile(next, { overwriteName: true });
        profileReady.current = true;
      })
      .catch(() => {
        profileReady.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const library = useMemo(() => {
    const list = state?.songs ?? [];
    const verified = list.filter((s) => s.verified);
    return verified.length > 0 ? verified : list;
  }, [state]);

  const genres = useMemo(() => distinctGenres(library), [library]);

  const songs = useMemo(
    () =>
      sortGuestSongs(
        filterGuestSongs(library, query, genre),
        sort,
        sortInstrument,
      ),
    [library, query, genre, sort, sortInstrument],
  );

  const requests = state?.requests ?? [];
  const capEnabled = state?.settings.songQueueCapEnabled !== false;
  const songCap = state?.settings.songQueueCap ?? 5;
  const myIds = useMemo(
    () => new Set(profile?.requestIds ?? []),
    [profile],
  );
  const started = profile?.started ?? masterSongCount(requests, myIds);
  const atSongCap = capEnabled && started >= songCap;
  const selectedIsQueued = selected
    ? isExistingSong(requests, selected.hash)
    : false;
  const joinBlocked = Boolean(selected) && atSongCap && !selectedIsQueued;

  const myRequests = useMemo(() => {
    if (myIds.size === 0) return [];
    return requests.filter(
      (r) => myIds.has(r.id) && isActiveRequest(r.status),
    );
  }, [requests, myIds]);

  const queueSig = useMemo(
    () => requests.map((r) => `${r.id}:${r.status}`).join("|"),
    [requests],
  );

  useEffect(() => {
    if (!profileReady.current) return;
    let cancelled = false;
    void api<GuestProfile>("/api/profile")
      .then((next) => {
        if (cancelled) return;
        setProfile(next);
        if (!nameDirty.current) setName(next.name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [queueSig]);

  const persistProfile = async (
    patch: Partial<Pick<GuestProfile, "instrument" | "difficulty">>,
  ) => {
    if (!profileReady.current) return;
    try {
      const next = await api<GuestProfile>("/api/profile", {
        method: "PUT",
        body: JSON.stringify({
          name,
          instrument: patch.instrument ?? instrument,
          difficulty: patch.difficulty ?? difficulty,
        }),
      });
      applyProfile(next);
    } catch {
      // keep local fields
    }
  };

  const join = async () => {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await api<{
        state: PublicState;
        profile: GuestProfile;
      }>("/api/queue/join", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          songHash: selected.hash,
          instrument,
          difficulty,
        }),
      });
      if (res.state) setState(res.state);
      if (res.profile) {
        nameDirty.current = false;
        applyProfile(res.profile, { overwriteName: true });
      }
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
          <p className="hint">
            <Link to="/queue">See the full queue</Link> to join someone
            else&apos;s song.
          </p>
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
        <div className="guest-profile-row">
          <Link to="/profile" className="profile-chip">
            {profile?.photoUrl ? (
              <img className="avatar sm" src={profile.photoUrl} alt="" />
            ) : (
              <span className="avatar sm placeholder">{initials(name)}</span>
            )}
            <span>
              <strong>{name || "Set up profile"}</strong>
              <em>Profile settings</em>
            </span>
          </Link>
          <LeaveEventButton
            disabled={busy}
            onLeft={(result) => {
              if (result.state) setState(result.state);
              if (result.profile) {
                applyProfile(result.profile, { overwriteName: true });
              }
              setMessage(
                result.cancelled === 0
                  ? "You're not in tonight's queue."
                  : `Left the event. Removed ${result.cancelled} queued song${
                      result.cancelled === 1 ? "" : "s"
                    }.`,
              );
            }}
            onError={setMessage}
          />
        </div>
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
        <span className="sort-instruments" role="group" aria-label="Sort by instrument">
          {INSTRUMENT_SORT_SLOTS.map((slot) => (
            <button
              key={slot.id}
              type="button"
              className={`sort-instrument ${
                sort === "instrument" && sortInstrument === slot.id
                  ? "active"
                  : ""
              }`}
              title={slot.label}
              aria-label={`Sort by ${slot.label}`}
              aria-pressed={sort === "instrument" && sortInstrument === slot.id}
              onClick={() => {
                setSort("instrument");
                setSortInstrument(slot.id);
              }}
            >
              <img src={`/yarg-icons/${slot.icon}.png`} alt="" />
            </button>
          ))}
        </span>
      </div>

      <div className="song-browser">
        <div
          ref={genreRail}
          className="genre-filters"
          role="tablist"
          aria-label="Filter by genre"
        >
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
      </div>

      {selected && (
        <section className="panel sticky-join">
          <div className="sticky-join-main">
            <h2>
              {selected.artist} — {selected.name}
            </h2>
            <div className="row">
              <label className="field">
                <span>Instrument</span>
                <select
                  value={instrument}
                  onChange={(e) => {
                    const next = e.target.value as Instrument;
                    setInstrument(next);
                    const auto =
                      profile?.instrumentDefaults?.[next] ?? difficulty;
                    setDifficulty(auto);
                    void persistProfile({
                      instrument: next,
                      difficulty: auto,
                    });
                  }}
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
                  onChange={(e) => {
                    const next = e.target.value as Difficulty;
                    setDifficulty(next);
                    void persistProfile({ difficulty: next });
                  }}
                >
                  {DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="hint">
              <Link
                to={`/controllers/${controllerSlugForInstrument(instrument)}`}
              >
                How this controller plays
              </Link>
            </p>
            {joinBlocked && (
              <p className="hint">
                You&apos;re at the song cap. You can still join a song someone
                else already requested.
              </p>
            )}
            <button
              type="button"
              className="primary"
              disabled={busy || joinBlocked}
              onClick={() => void join()}
            >
              Join queue
            </button>
          </div>
          <div className="sticky-join-parts">
            <DifficultyRings song={selected} />
          </div>
          <button
            type="button"
            className="sticky-join-close"
            aria-label="Close"
            onClick={() => setSelected(null)}
          >
            ×
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
  const [eventName, setEventName] = useState("");
  const [allowImportedScores, setAllowImportedScores] = useState(false);
  const [eventFlags, setEventFlags] = useState({
    hotMic: true,
    showUpNextHud: true,
    skipMainMenu: true,
    openDifficultySelect: true,
    addTestBots: false,
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
    setEventName(state.settings.eventName ?? "");
    setAllowImportedScores(state.settings.allowImportedScores === true);
    if (state.settings.eventFlags) {
      setEventFlags({
        hotMic: state.settings.eventFlags.hotMic ?? true,
        showUpNextHud: state.settings.eventFlags.showUpNextHud ?? true,
        skipMainMenu: state.settings.eventFlags.skipMainMenu ?? true,
        openDifficultySelect: state.settings.eventFlags.openDifficultySelect ?? true,
        addTestBots: state.settings.eventFlags.addTestBots ?? false,
      });
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
  const hostPort = state?.settings.hostPort ?? 3000;
  const httpLan = state?.lanUrls.find((url) => url.startsWith("http://"));
  let remoteBridgeHost = `127.0.0.1:${hostPort}`;
  if (httpLan) {
    try {
      remoteBridgeHost = new URL(httpLan).host;
    } catch {
      /* keep loopback */
    }
  }
  const bridgeUrl = sameMachine
    ? `ws://127.0.0.1:${hostPort}/ws?role=yarg`
    : `ws://${remoteBridgeHost}/ws?role=yarg`;
  const httpsOrigin = httpsLanOrigin(state?.lanUrls);
  const httpsPage =
    httpsOrigin && typeof window !== "undefined"
      ? toHttpsPageUrl(httpsOrigin, window.location)
      : undefined;

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
      const saved = await api<{
        eventName?: string;
        eventHash?: string;
        allowImportedScores?: boolean;
      }>(
        "/api/admin/settings",
        {
          method: "PUT",
          adminPassword: password,
          body: JSON.stringify({
            instrumentCaps: caps,
            songQueueCap,
            songQueueCapEnabled,
            yargExecutable: yargExecutable.trim(),
            simulatorEnabled,
            eventName: eventName.trim(),
            allowImportedScores,
            eventFlags,
          }),
        },
      );
      if (saved.eventName) setEventName(saved.eventName);
      if (typeof saved.allowImportedScores === "boolean") {
        setAllowImportedScores(saved.allowImportedScores);
      }
      if (state && saved.eventName) {
        setState({
          ...state,
          eventHash: saved.eventHash || state.eventHash,
          settings: {
            ...state.settings,
            eventName: saved.eventName,
            allowImportedScores:
              saved.allowImportedScores ?? allowImportedScores,
          },
        });
      }
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

  const testNotify = async () => {
    const result = await sendTestNotification();
    setMsg(
      testNotifyStatus({
        os: result.os,
        permission: result.permission,
        secureContext: window.isSecureContext,
        httpsUrl: httpsPage,
      }),
    );
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
        <div className="guest-top">
          <Brand />
          <GuestNav />
        </div>
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
          <Link to="/">Home</Link>
          <Link to="/profile">Profile</Link>
          <Link to="/songs">Songs</Link>
          <Link to="/queue">Queue</Link>
          <Link to="/controllers">Controllers</Link>
          <Link to="/scores">Scores</Link>
          <Link to="/letterboard">Letterboard</Link>
        </nav>
        <YaqVersion version={state?.version} />
      </div>
    );
  }

  return (
    <div className="page admin">
      <div className="guest-top">
        <Brand />
        <GuestNav />
      </div>
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
        <h2>Notifications</h2>
        <p className="hint">
          Send a test alert on this device. Guests get the same toast when they
          are 5 songs out, 1 song out, or up next.
          {typeof window !== "undefined" &&
            !window.isSecureContext &&
            httpsPage && (
              <>
                {" "}
                Chrome blocks system popups on HTTP. Open{" "}
                <a href={httpsPage}>{httpsPage}</a>, accept the certificate
                warning, then try again.
              </>
            )}
        </p>
        <button type="button" onClick={() => void testNotify()}>
          Test notification
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
        {state?.lanUrls?.length ? (
          <p className="hint">
            Open YAQ on this computer at{" "}
            <a href="http://127.0.0.1:3000">http://127.0.0.1:3000</a>
            {state.lanUrls
              .filter((url) => !url.includes("127.0.0.1"))
              .map((url) => (
                <span key={url}>
                  <br />
                  Phones: <a href={url}>{url}</a>
                </span>
              ))}
          </p>
        ) : null}
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
        <h2>Event</h2>
        <p className="hint">
          Name this night. Leave blank and YAQ picks a random name. The event
          hash follows the name plus the YARG song list.
        </p>
        <label className="field">
          <span>Event name</span>
          <input
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            placeholder="Random name if empty"
            maxLength={64}
          />
        </label>
        {state?.eventHash ? (
          <p className="event-hash">Hash {state.eventHash}</p>
        ) : null}
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={allowImportedScores}
            onChange={() => setAllowImportedScores((v) => !v)}
          />
          <span>Use imported scores from last event</span>
        </label>
        <p className="hint">
          When on, last-event imports count on tonight&apos;s scores and
          letterboard. When off, only scores played this event count.
        </p>
        <div className="row">
          <button type="button" className="primary" onClick={() => void save()}>
            Save settings
          </button>
        </div>
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
          {(state?.queueBoard ?? []).map((song) => (
            <li key={`${song.status}:${song.setId ?? song.players[0]?.id}`}>
              <strong>
                {song.songArtist} — {song.songName}
              </strong>
              <span>
                {" "}
                · {song.status.replace("_", " ")} · started by {song.masterName}
              </span>
              <ul>
                {song.players.map((p) => (
                  <li key={p.id}>
                    {p.name} · {instrumentLabel(p.instrument)} · {p.difficulty}
                  </li>
                ))}
              </ul>
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
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={eventFlags.addTestBots}
            onChange={() => toggleFlag("addTestBots")}
          />
          <span>Add bots as test players</span>
        </label>
        <p className="hint">
          When on, YARG fills empty guitar, bass, drums, and vocals parts with
          bots so you can test a set without a full band.
        </p>
        <div className="row">
          <button type="button" className="primary" onClick={() => void save()}>
            Save flags
          </button>
        </div>
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
        <Link to="/">Home</Link>
        <Link to="/profile">Profile</Link>
        <Link to="/songs">Songs</Link>
        <Link to="/queue">Queue</Link>
        <Link to="/controllers">Controllers</Link>
        <Link to="/scores">Scores</Link>
        <Link to="/letterboard">Letterboard</Link>
      </nav>
      <YaqVersion version={state?.version} />
    </div>
  );
}

function ScoresPage() {
  const [payload, setPayload] = useState<{
    playerName: string;
    runs: ScoreRun[];
  } | null>(null);
  const [profile, setProfile] = useState<GuestProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api<{ playerName: string; runs: ScoreRun[] }>("/api/scores"),
      api<GuestProfile>("/api/profile"),
    ])
      .then(([scores, nextProfile]) => {
        if (cancelled) return;
        setPayload(scores);
        setProfile(nextProfile);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const name = payload?.playerName || profile?.name || "This device";
  const runs = payload?.runs ?? [];

  return (
    <div className="page scores">
      <div className="guest-top">
        <Brand />
        <GuestNav />
      </div>
      <DeviceScores
        name={name}
        photoUrl={profile?.photoUrl ?? null}
        runs={runs}
      />
    </div>
  );
}

function LetterboardPage() {
  const { state } = useLiveState();
  const [board, setBoard] = useState<Letterboard | null>(null);
  const [youName, setYouName] = useState("");
  const [youPhotoUrl, setYouPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api<Letterboard>("/api/letterboard"),
      api<GuestProfile>("/api/profile"),
    ])
      .then(([next, profile]) => {
        if (cancelled) return;
        setBoard(next);
        setYouName(profile.name || "");
        setYouPhotoUrl(profile.photoUrl ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page letterboard">
      <div className="guest-top">
        <Brand />
        <GuestNav />
      </div>
      <EventLetterboard
        board={board}
        youName={youName}
        youPhotoUrl={youPhotoUrl}
        eventName={state?.settings.eventName ?? ""}
      />
    </div>
  );
}

export default function App() {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api<SetupInfo>("/api/setup")
      .then((info) => {
        if (!cancelled) setNeedsSetup(Boolean(info.needsSetup));
      })
      .catch(() => {
        if (!cancelled) setNeedsSetup(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (needsSetup) return;
    let cancelled = false;
    void api<GuestProfile>("/api/profile")
      .then((profile) => {
        if (!cancelled) setOnboarded(Boolean(profile.onboarded));
      })
      .catch(() => {
        if (!cancelled) setOnboarded(false);
      });
    return () => {
      cancelled = true;
    };
  }, [needsSetup]);

  if (needsSetup) {
    return (
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  if (needsSetup === null || onboarded === null) {
    return null;
  }

  if (!onboarded) {
    return (
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/controllers" element={<ControllersIndex />} />
        <Route path="/controllers/:id" element={<ControllerDetail />} />
        <Route
          path="*"
          element={<FirstLogin onDone={() => setOnboarded(true)} />}
        />
      </Routes>
    );
  }

  return (
    <>
      <NotificationPrompt />
      <QueueAlertWatcher />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/songs" element={<GuestPage />} />
        <Route path="/queue" element={<QueuePage />} />
        <Route path="/controllers" element={<ControllersIndex />} />
        <Route path="/controllers/:id" element={<ControllerDetail />} />
        <Route path="/scores" element={<ScoresPage />} />
        <Route path="/letterboard" element={<LetterboardPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
