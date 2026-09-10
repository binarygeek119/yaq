# YAQ — Yet Another Queue

Local LAN website for browsing a YARG song library and running event play queues. Works with the **yarg-event** fork so the game only shows ready + score screens.

## Quick start

```bash
cd ~/Projects/yaq
source ~/.nvm/nvm.sh && nvm use 22
npm install
npm --prefix client install
npm run build
npm start
```

Open the printed LAN URL on phones (or scan the QR on `/display`). Admin password is printed in the console on first run.

### Dev (API + Vite)

```bash
# terminal 1
npm run dev

# terminal 2
npm run dev:client
```

Vite proxies `/api` and `/ws` to port 3000.

## Pages

| Path | Role |
|------|------|
| `/` | Guest: browse songs, pick instrument/difficulty, join queue |
| `/admin` | Settings, instrument caps, scan folders, launch/skip |
| `/display` | Big-screen up-next + QR |

## YARG bridge

YARG Event connects to:

`ws://<host>:3000/ws?role=yarg`

Messages:

- `library.sync` — YARG → YAQ song list (authoritative hashes)
- `queue.preview` — YAQ → YARG up-next names + song
- `set.prepare` / `set.launch` — YAQ → YARG start a set
- `state` / `ready` / `song.ended` — lifecycle

Enable the built-in **simulator** (default on) to exercise the queue without Unity.

## Event night checklist

1. Start YAQ; note admin password and LAN URL.
2. Admin → set song folders → Scan library (or start YARG Event for hash sync).
3. Set instrument caps for the venue.
4. Open `/display` on a TV/projector for QR.
5. Launch YARG Event with `-yaq-event`.
6. When the next group is ready, Admin → **Launch next**.

## Sibling repo

[`~/Projects/yarg-event`](../yarg-event) — see `EVENT_MODE.md`.

## Binaries

GitHub Actions builds Linux and Windows x64 executables on every push/PR. Tag `v*` to publish them on a GitHub Release.

Locally:

```bash
npm run build:binary
# → release/yaq-linux and release/yaq-win.exe
```

Run the binary; SQLite data is stored in a `data/` folder next to the executable (or set `YAQ_DATA_DIR`).

## License

MIT (YAQ). YARG Event remains LGPL-3.0.
