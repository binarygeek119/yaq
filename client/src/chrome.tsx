import { Link } from "react-router-dom";

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
      <Link to="/queue">Songs</Link>
      <Link to="/controllers">Controllers</Link>
      <Link to="/scores">Scores</Link>
      <Link to="/letterboard">Letterboard</Link>
      <Link to="/admin">Admin</Link>
    </nav>
  );
}
