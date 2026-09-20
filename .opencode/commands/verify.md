---
description: Typecheck, test, and build the YAQ client
---

Run YAQ verification in the repo root and report failures with file paths.

1. `npm run typecheck`
2. `npm test`
3. If `client/` files changed, also `npm --prefix client run lint` and `npm --prefix client run build`

Fix any failures you introduced. Do not start long-running `npm run dev` servers unless the user asked to run the app.
