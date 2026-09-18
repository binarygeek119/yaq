import { Link, Navigate, useParams } from "react-router-dom";
import type { ReactNode } from "react";
import { Brand, GuestNav } from "./chrome";
import { CONTROLLERS, getController } from "./controllers";

function ControllerChrome({ children }: { children: ReactNode }) {
  return (
    <div className="page controllers">
      <div className="guest-top">
        <Brand />
        <GuestNav />
      </div>
      {children}
    </div>
  );
}

export function ControllersIndex() {
  return (
    <ControllerChrome>
      <section className="panel">
        <h2>Controllers</h2>
        <p className="hint">
          How each cabinet kit plays in YARG. Pick the matching part when you
          join a song. Difficulty (Easy through Expert+) is chosen on the song
          list.
        </p>
      </section>
      <div className="controller-grid">
        {CONTROLLERS.map((item) => (
          <Link
            key={item.id}
            className="controller-card"
            to={`/controllers/${item.id}`}
          >
            <img src={item.images[0]?.src} alt="" />
            <strong>{item.title}</strong>
            <span>{item.blurb}</span>
          </Link>
        ))}
      </div>
    </ControllerChrome>
  );
}

export function ControllerDetail() {
  const { id } = useParams<{ id: string }>();
  const item = getController(id);
  if (!item) return <Navigate to="/controllers" replace />;

  return (
    <ControllerChrome>
      <p className="hint">
        <Link to="/controllers">All controllers</Link>
      </p>
      <section className="panel controller-detail">
        <h2>{item.title}</h2>
        <p>{item.blurb}</p>
        <div
          className={`controller-shots ${item.images.length > 1 ? "pair" : ""}`}
        >
          {item.images.map((shot) => (
            <img key={shot.src} src={shot.src} alt={shot.alt} />
          ))}
        </div>
        <h3>Parts on this kit</h3>
        <p className="controller-parts">{item.parts.join(" · ")}</p>
        <h3>How to play</h3>
        <ol className="controller-howto">
          {item.play.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
    </ControllerChrome>
  );
}
