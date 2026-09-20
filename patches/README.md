# YARG patches

YAQ cannot push to the YARG fork from this agent.

## First Profiles visit still stacks Quickplay

If the first Profiles open leaves the Quickplay / Event HUD overlay on
screen, and going into Profiles a **second** time (with that overlay still
up) clears it, apply this on the Unity tree that already has the Event Mode
profiles patch:

```bash
cd /path/to/YARG   # cursor/qr-above-buttons-7c60 / f14100d3
git apply /path/to/yaq/patches/yarg-profiles-first-open.patch
```

Let Unity recompile, then open Profiles once. The first visit should stay
the profile list.

Do **not** apply this after a fresh `yarg-event-instrument-profiles.patch`
from this PR — that full patch already includes the same first-open fix.

## Round HUD portraits (current Unity checkout)

The Game view title `cursor/qr-above-buttons-… (f14100d3)` is that SHA. Apply this **one** patch there, then let Unity recompile and re-enter Play:

```bash
cd /path/to/YARG   # currently on cursor/qr-above-buttons-7c60 / f14100d3
git apply /path/to/yaq/patches/yarg-hud-round-avatars.patch
```

Each current-set name gets a circular framed portrait on the left of the Event HUD.

## Full Event Mode stack (optional)

On the same Unity tree, **in order**:

```bash
git apply /path/to/yaq/patches/yarg-add-device-lockup.patch
git apply /path/to/yaq/patches/yarg-event-instrument-profiles.patch
```

1. `yarg-add-device-lockup.patch` — Profiles Add Device hang + first Event Mode overlay fix.
2. `yarg-event-instrument-profiles.patch` — venue profiles, bots, song master, first-open overlay fix, and the same round HUD portraits (includes more than the HUD-only patch).
