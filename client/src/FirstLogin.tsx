import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type GuestProfile } from "./api";
import { photoUploadError, prepareProfilePhoto } from "./photo";

const STEPS = ["game", "yaq", "name", "photo"] as const;
type Step = (typeof STEPS)[number];

export function FirstLogin({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("game");
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const stepIndex = STEPS.indexOf(step);

  const pickPhoto = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    void prepareProfilePhoto(file)
      .then(setPreview)
      .catch((err) => {
        setError(photoUploadError(err));
      });
  };

  const finish = async (photoDataUrl: string | null | undefined) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name to continue.");
      setStep("name");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api<GuestProfile>("/api/profile", {
        method: "PUT",
        body: JSON.stringify({
          name: trimmed,
          onboarded: true,
          ...(photoDataUrl !== undefined ? { photoDataUrl } : {}),
        }),
      });
      onDone();
      navigate("/queue", { replace: true });
    } catch (err) {
      setError(photoUploadError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page first-login">
      <header className="brand">
        <p className="brand-mark">YAQ</p>
        <p className="brand-sub">Yet Another Queue</p>
      </header>
      <ol className="fl-dots" aria-label="Setup steps">
        {STEPS.map((id, i) => (
          <li
            key={id}
            className={i === stepIndex ? "on" : i < stepIndex ? "done" : ""}
          />
        ))}
      </ol>
      <section className="panel fl-card">
        {step === "game" ? (
          <>
            <p className="fl-kicker">Tonight</p>
            <h2>You&apos;re playing YARG</h2>
            <p>
              YARG is the rhythm game on the cabinet — guitar, bass, drums,
              keys, or vocals, like Guitar Hero and Rock Band.
            </p>
            <p>
              When it&apos;s your group&apos;s turn, play on the TV. Scores from
              each run show up on this phone.
            </p>
            <p>
              <Link to="/controllers">See each controller and how it plays</Link>
            </p>
          </>
        ) : null}
        {step === "yaq" ? (
          <>
            <p className="fl-kicker">This phone</p>
            <h2>How YAQ works</h2>
            <p>
              YAQ is the queue. Search a song, pick your part, then join. You
              can have a few songs waiting.
            </p>
            <p>
              You&apos;ll get an alert 5 songs out, 1 song out, and when
              you&apos;re up next. Leave event if you head home. Name and
              picture live on this phone&apos;s profile.
            </p>
          </>
        ) : null}
        {step === "name" ? (
          <>
            <p className="fl-kicker">Profile</p>
            <h2>What should we call you?</h2>
            <p className="hint">
              Shown on the queue, scores, and letterboard. You can change it
              later.
            </p>
            <label className="field">
              <span>Your name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Display name"
                maxLength={32}
                autoComplete="nickname"
                autoFocus
              />
            </label>
          </>
        ) : null}
        {step === "photo" ? (
          <>
            <p className="fl-kicker">Profile</p>
            <h2>Add a picture</h2>
            <p className="hint">
              Optional. Helps people spot you on the letterboard. Skip if you
              want.
            </p>
            <div className="fl-photo">
              {preview ? (
                <img className="avatar" src={preview} alt="" />
              ) : (
                <span className="avatar placeholder">
                  {name.trim()
                    ? name
                        .trim()
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((p) => p[0])
                        .join("")
                        .toUpperCase()
                    : "?"}
                </span>
              )}
            </div>
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="user"
              hidden
              onChange={(e) => {
                pickPhoto(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <input
              ref={uploadInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              hidden
              onChange={(e) => {
                pickPhoto(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <div className="fl-photo-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => cameraInput.current?.click()}
              >
                Take a picture
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => uploadInput.current?.click()}
              >
                Upload
              </button>
            </div>
          </>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
      </section>
      <div className="fl-nav">
        {stepIndex > 0 ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setStep(STEPS[stepIndex - 1])}
          >
            Back
          </button>
        ) : (
          <span />
        )}
        {step === "game" || step === "yaq" ? (
          <button
            type="button"
            className="primary"
            onClick={() => setStep(STEPS[stepIndex + 1])}
          >
            Next
          </button>
        ) : null}
        {step === "name" ? (
          <button
            type="button"
            className="primary"
            disabled={!name.trim()}
            onClick={() => setStep("photo")}
          >
            Next
          </button>
        ) : null}
        {step === "photo" ? (
          <div className="fl-finish">
            <button
              type="button"
              disabled={busy}
              onClick={() => void finish(undefined)}
            >
              Skip
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy || !preview}
              onClick={() => void finish(preview)}
            >
              Continue
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
