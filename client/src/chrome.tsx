import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api";

function bundledYaqVersion(): string {
  if (typeof window !== "undefined" && window.__YAQ_VERSION__) {
    return window.__YAQ_VERSION__;
  }
  if (typeof __YAQ_VERSION__ === "string" && __YAQ_VERSION__) {
    return __YAQ_VERSION__;
  }
  return "";
}

export function YaqVersion({ version: stateVersion }: { version?: string }) {
  const [version, setVersion] = useState(
    () => stateVersion || bundledYaqVersion(),
  );

  useEffect(() => {
    if (stateVersion) setVersion(stateVersion);
  }, [stateVersion]);

  useEffect(() => {
    let cancelled = false;
    void api<{ version?: string }>("/api/health")
      .then((health) => {
        if (!cancelled && health.version) setVersion(health.version);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const label = version || bundledYaqVersion() || "dev";
  return (
    <p className="admin-version" id="yaq-version-tag">
      YAQ {label}
    </p>
  );
}

export function Brand() {
  return (
    <header className="brand">
      <Link to="/" className="brand-mark">
        YAQ
      </Link>
      <p className="brand-sub">Yet Another Queue</p>
    </header>
  );
}

export function GuestNav() {
  return (
    <nav className="top-nav">
      <Link to="/">Home</Link>
      <Link to="/profile">Profile</Link>
      <Link to="/songs">Songs</Link>
      <Link to="/queue">Queue</Link>
      <Link to="/controllers">Controllers</Link>
      <Link to="/scores">Scores</Link>
      <Link to="/letterboard">Letterboard</Link>
      <Link to="/admin">Admin</Link>
    </nav>
  );
}
