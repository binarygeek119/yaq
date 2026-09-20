# YARG patches

YAQ cannot push to the YARG fork from this agent.

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
2. `yarg-event-instrument-profiles.patch` — venue profiles, bots, song master, overlay fix, and the same round HUD portraits (includes more than the HUD-only patch).
