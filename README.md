# YAQ — Yet Another Queue

Local LAN website for browsing a YARG song library and running event play queues. Guests use their phones; the cabinet runs the **YARG Event Mode** fork. YARG shows the Event HUD (and ads when the queue is empty), then gameplay. Guest scores stay in YAQ — Event Mode does not write YARG local scores or replays.

> [!WARNING]
> **Proof of concept, written by AI.** This project is a working reference, not a handwritten production app. The idea is for someone to take the work proven here and reimplement it on a clean start with handwritten code.

## Quick start

Node **22** is required.

```bash
cd ~/Projects/yaq
source ~/.nvm/nvm.sh && nvm use 22
npm install
npm --prefix client install
npm run build
npm start
```

Open the printed HTTPS LAN URL on phones (or scan the in-game QR). Chrome needs HTTPS for system notifications — accept the self-signed certificate warning (Advanced → Proceed). HTTP on port **3000** still works for the site and for YARG (`ws://127.0.0.1:3000/ws?role=yarg`). HTTPS is port **3443** (self-signed cert in `data/tls/`).

On first run, open `/setup` and choose an admin password (same-machine YARG vs a second PC). `/admin` stays locked until that password is entered.

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
| `/` | QR landing: welcome plus links to songs, queue, player, controllers, and profile |
| `/profile` | Name, picture, default difficulties, score export/import, leave event |
| `/player` | Mic ready-up. Opens once when a vocalist is up; they can leave from the menu |
| `/songs` | Browse/search songs, filter by genre, pick a part the chart actually has |
| `/queue` | Tonight's queue. Join another player's copy from that card when a part is open |
| `/controllers` | How-to-play photos for each cabinet |
| `/scores` | This device's Event Mode runs |
| `/letterboard` | Event leaderboard: ranked table plus a selected-player pane |
| `/setup` | First run: admin password; same-machine vs second-machine YARG |
| `/admin` | Password-locked night controls (YARG, queue, flags, ads, messages, caps) |

First visit on a phone runs a short walkthrough (what YARG is, how the queue works, name, optional photo) before the song list.

## Guests

Profiles are keyed to each device IP. Name and picture show on the queue, letterboard, and Event HUD.

**Start or join a song.** On `/songs`, pick a part and difficulty the chart has (Easy–Expert+ from YARG `library.sync`). If that song is already on deck or waiting and the part is still open, YAQ attaches to that copy instead of starting a second card. Starting a new title counts toward the song-master cap; joining someone else does not.

**Queue.** `/queue` lists now playing, up next, and waiting groups. **Join** expands on that card with the leftover parts, then attaches to that set.

**Mics.** Vocalists get `/player` when it is their turn (once per song). Tap **Ready** / **Not ready**. Guitar and drums ready with green and unready with red on the cabinet. Leaving the player page does not yank the phone back until the next vocal turn.

**Alerts.** After allowing notifications (HTTPS), phones get a toast 5 songs out, 1 song out, and when they are up next.

**Leave event** (profile or songs) drops that device's queued songs. The profile stays on the phone.

**Scores.** Export from Profile after the night. Import at the next event only counts if admin turns on imported scores.

## Admin

Unlock `/admin` with the setup password.

- **YARG game** — launch path, Enter / Exit Event Mode, LAN URLs, optional simulator (a real YARG socket stops the simulator)
- **Songs** — **Sync songs from YARG** so the list, queue, and Event Mode only offer charts this game can play. Songs YARG does not have are skipped
- **Event** — name (or a random name), hash, whether last-event imported scores count tonight
- **Queue control** — Launch next, skip on deck, remove a queued song
- **Venue messages** — default floor clips plus custom recordings; **Play** sends them to YARG (pauses ads until the clip ends)
- **Hot mic** — host talkback; applies immediately and lowers ads music rather than muting it
- **YARG event flags** — up-next HUD, skip main menu, open difficulty select, add bots, no fail, no mute
- **Ads** — after one minute of empty-queue Event Mode, YARG plays random full-song stems. Play the whole track, or a 5–120s slice
- **Song cap** — how many titles a player may start (joining does not count). Can be turned off
- **Instrument caps** — cabinets on the floor. 5-fret guitar/bass/rhythm/coop share a cap; vocals and harmony share a cap. Zero keeps that type out of pairing

## Event Mode

Launch creates **one YARG profile per instrument cap**, named like `guitar_01`, `bass_01`, `drums_01`, `mic_01`. Bind controllers to those slots after **Exit Event Mode**. Re-entering reuses the same profiles; guests only rename the occupied slots for the song. Unused matching slots can become bots when **Add bots for empty instrument parts** is on — only for parts the chart has, never extra overflow profiles. The song master stays a real player.

Sets seat up to the venue slot count (not a 4-player cap). After a song ends, YAQ completes that set, keeps guest scores, and prepares the next on-deck group. YARG does not save local scores or replays while Event Mode is active.

## Event night checklist

1. Start YAQ; note the admin password and the **https://** LAN URL (or `http://127.0.0.1:3000` on this computer).
2. Admin → set **YARG executable path** → Save → **Launch YARG**. Event Mode creates one profile per instrument cap.
3. Admin → **Exit Event Mode**, open **Profiles** in YARG, assign a controller to each venue slot (`guitar_01`, `bass_01`, `drums_01`, `mic_01`, …), then **Enter Event Mode** again. Bindings stay on those profiles.
4. **Sync songs from YARG** (or wait for `library.sync`, or enable the simulator) so the guest list matches the game.
5. Set instrument caps for the venue. Name the event (or keep the random name). Turn on **Add bots** if leftover song parts should be bots.
6. Guests scan the in-game QR (or open the printed LAN URL). First visit walks them through name and photo.
7. Song masters pick titles on `/songs`. Other guests join leftover parts there or from `/queue`.
8. When the next group is ready, Admin → **Launch next**. Later songs auto-prepare after `song.ended`.
9. After the night, guests can **Export scores** from Profile. Import at the next event only counts if admin allows it.

## YARG bridge (data stream)

YARG Event connects to:

`ws://<host>:3000/ws?role=yarg`

From Admin → **Launch YARG**, YAQ starts the game as:

```bash
./YARG -event-mode -yaq-url "ws://127.0.0.1:3000/ws?role=yarg"
```

Messages:

- `hello` — handshake (`yaq-1` / `yarg-event-1`); YARG may send `capabilities: ["player.image", "player.images", "profile.image"]`
- `library.sync` / `library.request` — authoritative songs, including per-part Easy–Expert+ charts
- `queue.preview` — YAQ → YARG up-next names + song; each player includes `id` and a `dataUrl` portrait
- `set.prepare` / `set.launch` — YAQ → YARG start a set (`slotId` + `dataUrl` on each player)
- `set.requestLaunch` — YARG asks YAQ to launch the prepared set (ready countdown)
- `player.images` / `player.image` — same portraits as their own stream messages
- `player.ready` / `player.unready` — mic ready-up on the Event HUD
- `settings.update` / `settings.ack` — event flags plus ads length / play-full-song
- `profiles.setup` — one YARG profile slot per instrument cap
- `announcement.play` — venue floor clip (`id`); YARG queues during gameplay and pauses ads
- `eventmode.enter` / `eventmode.exit` — resume / suspend Event Mode (bridge stays up)
- `eventmode.state` — YARG reports `{ enabled, suspended }`
- `state` / `ready` / `song.ended` — lifecycle (`song.ended` may include a score payload)

From Admin, **Enter Event Mode** / **Exit Event Mode** (or `POST /api/admin/yarg/event-mode` with `{ "enabled": true|false }`). Exit restores normal YARG menus while keeping the WebSocket; Enter resumes queue-driven play.

Optional **simulator** (Admin toggle) exercises the queue without a game binary. A real YARG connection automatically stops the simulator.

## Sibling repo

[`~/Projects/YARG`](../YARG) — Event Mode fork; see `EVENT_MODE.md`. GitHub: [binarygeek119/YARG](https://github.com/binarygeek119/YARG).

## OpenCode

This repo is set up for [OpenCode](https://opencode.ai):

- `AGENTS.md` — project briefing (commands, layout, queue/bridge rules)
- `opencode.jsonc` — schema + edit permissions (blocks `data/` and SQLite)
- `.opencode/commands/` — `/verify` and `/review`
- `.opencode/skills/yarg-bridge/` — YARG WebSocket protocol, loaded on demand

From the project root: `opencode`, then `/verify` before you finish a change.

See [CONTRIBUTING.md](CONTRIBUTING.md) for human setup and PR notes.

## Binaries

GitHub Actions builds Linux and Windows x64 executables on every push to `main` (rolling **Latest** release) and on `v*` tags.

Locally:

```bash
npm run build:binary
# → release/yaq-linux and release/yaq-win.exe
```

Run the binary; SQLite data is stored in a `data/` folder next to the executable (or set `YAQ_DATA_DIR`).

## License

[MIT](LICENSE) (YAQ). YARG Event remains LGPL-3.0.
