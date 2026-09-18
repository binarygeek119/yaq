import {
  classicRingStyle,
  songDifficultyRings,
  type DifficultyRingSlot,
} from "./labels";

const RING_RADIUS = 12;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;

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
    <span className={classes} title={title} aria-label={title}>
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <circle className="diff-ring-base" cx="16" cy="16" r={RING_RADIUS} />
        <circle
          className="diff-ring-fill"
          cx="16"
          cy="16"
          r={RING_RADIUS}
          strokeDasharray={`${style.fill * RING_CIRC} ${RING_CIRC}`}
        />
      </svg>
      <span className="diff-ring-abbr">{style.number || slot.abbrev}</span>
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
