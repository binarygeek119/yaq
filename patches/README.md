# YARG patches

YAQ cannot push to the YARG fork from this agent. Apply these on the Unity tree (`cursor/qr-above-buttons-7c60` or your yarg-event checkout) **in order**:

```bash
cd ~/Projects/yarg-event   # or /path/to/YARG
git apply /path/to/yaq/patches/yarg-add-device-lockup.patch
git apply /path/to/yaq/patches/yarg-event-instrument-profiles.patch
```

1. `yarg-add-device-lockup.patch` — Profiles Add Device hang + first Event Mode overlay fix.
2. `yarg-event-instrument-profiles.patch` — one venue profile per YAQ instrument cap, bots for leftover parts, song master stays human, Profiles overlay fix, and round profile portraits beside Event HUD names.
