---
name: verify-change
description: Run the project's full local verification (lint, typecheck, unit and integration tests, build) and report results. Use before finishing any code change, and always in the builder and resolver agents.
---

Run these in order from the repo root and stop at the first failure. Fix the failure, then start again from the top.

```bash
npm run lint
npm run typecheck
npm test
npx next build
```

Use `npx next build`, not `npm run build`: the npm script runs database migrations first.

If the change touches a page or a user flow covered by `tests/e2e`, also run:

```bash
npm run test:e2e
```

Copy each command's final status line (pass/fail counts, or the first error) into `agent-output/summary.md` under a `## Verification` heading. Never claim a check passed without running it.
