---
name: yarg-bridge
description: YAQ ↔ YARG Event WebSocket protocol, launch flags, event-mode, and simulator behavior
---

Use this when changing `src/services/bridge.ts`, `src/services/yargLauncher.ts`, event flags, or `/ws?role=yarg`.

## Connection

YARG Event connects to:

```text
ws://<host>:3000/ws?role=yarg
```

Admin **Launch YARG** runs:

```bash
./YARG -event-mode -yaq-url "ws://127.0.0.1:3000/ws?role=yarg"
```

UI clients use `/ws?role=ui` (default role is `ui`). A real YARG socket **stops** the optional admin simulator.

Handshake: YAQ sends `{ type: "hello", role: "yaq", version: "yaq-1" }`. Game side is `yarg-event-1`.

## Outbound (YAQ → YARG)

Defined in `BridgeOutbound` in `src/services/bridge.ts`:

| Type | Purpose |
|---|---|
| `set.prepare` | Next set + players (id, name, songHash, instrument, difficulty) |
| `set.launch` | Start the prepared set (`setId`) |
| `queue.preview` | Up-next names + song for HUD |
| `settings.update` | Event flags |
| `eventmode.enter` / `eventmode.exit` | Resume / suspend Event Mode; keep the socket |
| `library.request` | Ask YARG for authoritative hashes |
| `ping` | Keepalive |

Event flags (`EventFlags` in `src/types.ts`): `hotMic`, `showUpNextHud`, `skipMainMenu`, `openDifficultySelect`. Admin persists them in SQLite and pushes `settings.update`.

Admin enter/exit is `POST /api/admin/yarg/event-mode` with `{ "enabled": true|false }`.

## Inbound (YARG → YAQ)

| Type | Purpose |
|---|---|
| `hello` | Handshake |
| `library.sync` | Authoritative `SongRecord[]` (upsert; prefer over folder scan when present) |
| `state` | `disconnected` \| `idle` \| `ready` \| `playing` \| `score` |
| `ready` | Set is ready (`setId?`) |
| `song.ended` | Set finished (`setId?`, `scores?`) |
| `settings.ack` / `settings.report` | Flag echo |
| `eventmode.state` | `{ enabled, suspended? }` |
| `error` | `code?`, `setId?`, `songHash?`, `message?` |
| `pong` | Keepalive reply |

Do not rename these `type` strings without coordinating with the yarg-event fork. Additive optional fields are safer than breaking existing ones.

## Lifecycle

Typical set flow: form on-deck → `queue.preview` → admin launch → `set.prepare` then `set.launch` → YARG `ready` / `state: playing` → `song.ended` → complete now-playing → form next on-deck.

`eventmode.exit` restores normal YARG menus while the WebSocket stays up. `eventmode.enter` resumes queue-driven play.
