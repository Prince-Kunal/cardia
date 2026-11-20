# Cardia web app

The browser UI for Cardia: Analyze (import, library, reports) and Learn (lessons, quizzes, 3D heart). It talks to the local engine API (`engine/cardia_api`, PLAN.md §6) and never sends scans anywhere else.

```bash
pnpm install --frozen-lockfile   # exact versions from pnpm-lock.yaml
pnpm dev                         # http://localhost:5173
pnpm build                       # type-check + production build
pnpm lint                        # oxlint
```

Node 22.21.0 (`../.nvmrc`) and pnpm 10.20.0 (`packageManager` in package.json) are pinned. Run `corepack enable` once so the right pnpm is used. Owner: Krrish. The Learn engine (`src/learn/`) is owned by Melove (see `../CONTRIBUTING.md`).
