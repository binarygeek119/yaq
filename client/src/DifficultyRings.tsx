import type { CSSProperties } from "react";
import {
  classicRingStyle,
  songDifficultyRings,
  type DifficultyRingSlot,
} from "./labels";

const ICON_SRC = (icon: string) => `/yarg-icons/${icon}.png`;
const RING_SRC = "/yarg-icons/ring.png";

function Ring({ slot }: { slot: DifficultyRingSlot }) {
  const style = classicRingStyle(slot.present, slot.intensity);
  const title =
    slot.intensity != null
      ? `${slot.label} ${slot.intensity}`
      : slot.present
        ? slot.label
        : `${slot.label} (none)`;
  const classes = [
    "diff-ring",
    style.active ? "active" : "inactive",
    style.tone === "red" ? "expert" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={classes}
      title={title}
      aria-label={title}
      style={{ "--fill": String(style.fill) } as CSSProperties}
    >
      <img className="diff-ring-base" src={RING_SRC} alt="" />
      <img className="diff-ring-fill" src={RING_SRC} alt="" />
      <img className="diff-ring-icon" src={ICON_SRC(slot.icon)} alt="" />
      {style.number ? (
        <span className="diff-ring-num">{style.number}</span>
      ) : null}
    </span>
  );
}

export function DifficultyRings({
  song,
}: {
  song: { instruments?: string[]; diffs?: Record<string, number> };
}) {
  const slots = songDifficultyRings(song);
  return (
    <span className="diff-rings" aria-label="Parts">
      {slots.map((slot) => (
        <Ring key={`${slot.icon}-${slot.instrument}`} slot={slot} />
      ))}
    </span>
  );
}
