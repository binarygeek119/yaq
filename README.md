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

Open the printed HTTPS LAN URL on phones (or scan the in-game QR). Chrome needs HTTPS for system notifications — accept the self-signed certificate warning (Advanced → Proceed). HTTP on port 3000 still works for the site and for YARG (`ws://127.0.0.1:3000`). On first run, open `/setup` and choose an admin password. The admin page at `/admin` stays locked until that password is entered.

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
| `/` | QR landing: welcome plus links to songs, queue, and profile |
| `/profile` | Profile settings: name, picture, default difficulty, export/import scores |
| `/songs` | Guest: browse songs, pick instrument/difficulty, start or join a song |
| `/queue` | Tonight's queue: join another song master's song when a part or player slot is open |
| `/scores` | This device’s Event Mode runs |
| `/letterboard` | Event leaderboard: ranked table plus a selected-player pane |
| `/setup` | First run: choose admin password; same-machine vs second-machine YARG |
| `/admin` | Password-locked settings, event name, launch YARG, instrument caps, launch/skip sets |

## YARG bridge (data stream)

YARG Event connects to:

`ws://<host>:3000/ws?role=yarg`

YAQ also serves HTTPS on port **3443** (self-signed cert in `data/tls/`) so phones can grant Notifications. YARG stays on HTTP 3000.

From Admin → **Launch YARG**, YAQ starts the game as:

```bash
./YARG -event-mode -yaq-url "ws://127.0.0.1:3000/ws?role=yarg"
```

Messages:

- `hello` — handshake (`yaq-1` / `yarg-event-1`)
- `library.sync` / `library.request` — authoritative song hashes from YARG
- `queue.preview` — YAQ → YARG up-next names + song
- `set.prepare` / `set.launch` — YAQ → YARG start a set
- `settings.update` / `settings.ack` — event flags (hot mic, skip menu, test bots, …)
- `eventmode.enter` / `eventmode.exit` — resume / suspend Event Mode (bridge stays up)
- `eventmode.state` — YARG reports `{ enabled, suspended }`
- `state` / `ready` / `song.ended` — lifecycle

From Admin, **Enter Event Mode** / **Exit Event Mode** (or `POST /api/admin/yarg/event-mode` with `{ "enabled": true|false }`). Exit restores normal YARG menus while keeping the WebSocket; Enter resumes queue-driven play.

Optional **simulator** (Admin toggle) exercises the queue without a game binary. A real YARG connection automatically stops the simulator.

## Event night checklist

1. Start YAQ; note admin password and the **https://** LAN URL for phones.
2. Admin → set **YARG executable path** → Save → **Launch YARG**.
3. Wait for YARG `library.sync` (or enable the simulator) so songs appear.
4. Set instrument caps (−/+) for the venue. Name the event (or keep the random name). Turn on **Use imported scores from last event** if last night’s files should count.
5. Guests scan the in-game QR (or open the printed LAN URL) to reach `/`.
6. When the next group is ready, Admin → **Launch next**.
7. After the night, guests can **Export scores** from Profile. Import at the next event only counts if admin allows it.

## Sibling repo

[`~/Projects/yarg-event`](../yarg-event) — see `EVENT_MODE.md`.

## Binaries

GitHub Actions builds Linux and Windows x64 executables on every push to `main` (rolling **Latest** release) and on `v*` tags.

Locally:

```bash
npm run build:binary
# → release/yaq-linux and release/yaq-win.exe
```

Run the binary; SQLite data is stored in a `data/` folder next to the executable (or set `YAQ_DATA_DIR`).

## License

MIT (YAQ). YARG Event remains LGPL-3.0.
