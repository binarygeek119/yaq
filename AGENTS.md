# YAQ — agent instructions

Yet Another Queue is a LAN website for browsing a YARG song library and running event play queues. It talks to a **yarg-event** fork over WebSocket so the game only shows ready + score screens.

Use this file as the project briefing for OpenCode (and other coding agents). Prefer it over guessing.

## Commands

Node **22** is required (`nvm use 22` if needed).

```bash
npm install
npm --prefix client install
npm test                 # vitest (server)
npm run typecheck        # tsc --noEmit (server)
npm --prefix client run build   # tsc -b && vite build
npm --prefix client run lint    # oxlint
```

Dev (two terminals): `npm run dev` (API + WS on :3000) and `npm run dev:client` (Vite on :5173, proxies `/api` and `/ws`).

Production-style: `npm run build && npm start`. Packaged binary: `npm run build:binary` → `release/`.

After TypeScript or queue/bridge changes, run `npm test` and `npm run typecheck`. After UI changes, also `npm --prefix client run build`. Do not commit `data/`, `data-test/`, `client/dist/`, `dist/`, or `release/`.

## Layout

| Path | Role |
|---|---|
| `src/index.ts` | Fastify HTTP + `/ws` (UI and YARG roles) |
| `src/db.ts` | better-sqlite3 schema and settings |
| `src/types.ts` | Shared server types (instruments, flags, queue) |
| `src/paths.ts` | Asset vs writable data roots; `YAQ_DATA_DIR` |
| `src/services/queue.ts` | Join / pair / on-deck / now-playing |
| `src/services/bridge.ts` | YARG + UI WebSocket hub and optional simulator |
| `src/services/library.ts` | Scan `song.ini` folders |
| `src/services/yargLauncher.ts` | Spawn YARG with `-event-mode -yaq-url` |
| `src/services/cover.ts` | Album art from song folders |
| `client/src/App.tsx` | Guest `/`, admin `/admin`, display `/display` |
| `client/src/api.ts` | Fetch helper + **duplicated** public types |
| `scripts/bundle.mjs` | esbuild CJS bundle for `pkg` |
| `.github/workflows/build-binaries.yml` | Linux + Windows x64 binaries |

SQLite lives under `data/yaq.sqlite` (or `YAQ_DATA_DIR`). Tests wipe `data-test/` via `YAQ_DATA_DIR` in `src/services/queue.test.ts`.

## Conventions

- Server is ESM TypeScript (`"type": "module"`, `module: NodeNext`). Import local files with `.js` extensions.
- Keep instrument / difficulty unions in `src/types.ts`. If you change `PublicState` or related types, update `client/src/api.ts` to match.
- Admin routes use header `x-admin-password`. Never print or commit the live password from `data/`.
- Queue pairing: one `on_deck` set at a time; prefer same-song groups that fill instrument caps; late joiners attach to on-deck if the song and cap allow. Caps of `0` mean that instrument is not offered; an unconfigured instrument still forms a solo set so the queue cannot stall.
- A real YARG WebSocket stops the simulator. Launch args are `-event-mode -yaq-url ws://127.0.0.1:<port>/ws?role=yarg`.
- Windows CI must stay on `windows-2022` so `better-sqlite3` can compile.
- `better-sqlite3` stays external in the esbuild bundle and is shipped as a `pkg` asset.

## Do not

- Do not treat draft feature branches as merged. `main` is the source of truth for pages, APIs, and protocol.
- Do not add song-folder UI on admin unless asked; scanning still uses `settings.songFolders` and YARG `library.sync`.
- Do not change binary targets or the rolling `latest` GitHub Release without an explicit request.
- Do not vendor YARG. The event-mode game is a sibling repo (`yarg-event`, LGPL-3.0). YAQ itself is MIT.

## Protocol

When editing the YARG connection, load the `yarg-bridge` skill (`.opencode/skills/yarg-bridge/SKILL.md`) or read `src/services/bridge.ts` and the README “YARG bridge” section before changing message shapes.

## OpenCode

Project config is `opencode.jsonc`. Slash commands live in `.opencode/commands/`. Use `/verify` before finishing a change.
