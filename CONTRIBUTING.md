# Contributing to YAQ

YAQ is MIT-licensed. The sibling **YARG Event** game fork remains LGPL-3.0 and is not vendored here.

## Setup

Node 22:

```bash
npm install
npm --prefix client install
```

## Checks

```bash
npm test
npm run typecheck
npm --prefix client run lint
npm --prefix client run build
```

OpenCode users: run `/verify` (see `AGENTS.md` and `.opencode/commands/`).

## Guidelines

- Keep queue pairing and instrument-cap behavior in `src/services/queue.ts` with tests in `src/services/queue.test.ts`.
- Keep YARG WebSocket message `type` strings compatible with the yarg-event fork. See `.opencode/skills/yarg-bridge/SKILL.md`.
- If you change `PublicState` or related types in `src/types.ts`, update `client/src/api.ts`.
- Do not commit `data/`, `data-test/`, SQLite files, `client/dist/`, `dist/`, or `release/`.
- Windows GitHub Actions must stay on `windows-2022` so `better-sqlite3` compiles.

## Pull requests

Describe the guest / admin / display surface you touched and how you verified it (`npm test`, a local LAN run, or both).
