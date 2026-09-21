---
description: Review the current YAQ diff for queue, bridge, and LAN safety
---

Review the current uncommitted diff (and `git diff origin/main...HEAD` if this is a PR branch).

Focus on:

- Queue pairing and instrument caps (`src/services/queue.ts`)
- YARG / UI WebSocket message compatibility (`src/services/bridge.ts`)
- Admin auth (`x-admin-password`) and leaked secrets
- Client `PublicState` drift between `src/types.ts` and `client/src/api.ts`
- Accidental edits to `data/`, SQLite files, or generated `dist/` / `client/dist/`

Suggest concrete patches. Do not rewrite unrelated draft-PR features that are not on this branch.
