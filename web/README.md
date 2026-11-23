# Cardia web app

The browser UI for Cardia: Analyze (import, library, reports) and Learn (lessons, quizzes, 3D heart). It talks to the local engine API (`engine/cardia_api`, PLAN.md §6) and never sends scans anywhere else.

```bash
pnpm install --frozen-lockfile   # exact versions from pnpm-lock.yaml
pnpm dev                         # http://localhost:5173
pnpm build                       # type-check + production build
pnpm lint                        # oxlint
pnpm test                        # Vitest (happy-dom)
```

Node 22.21.0 (`../.nvmrc`) and pnpm 10.20.0 (`packageManager` in package.json) are pinned. Run `corepack enable` once so the right pnpm is used. CI runs lint, build and test on every PR (`.github/workflows/web.yml`). Owner: Krrish. The Learn engine (`src/learn/`) is owned by Melove (see `../CONTRIBUTING.md`).

## Running it

The app needs the engine. Start it in another terminal; it prints a link that opens the app already connected:

```bash
cd ../engine && uv run python -m cardia_api --mock   # made-up numbers: no model files needed, good for UI work
cd ../engine && uv run python -m cardia_api          # the real analysis
```

With `--mock`, any picture of a pink or red shape on white paper works as a scan, and every screen shows a "Demo data" badge.

## Layout

| Path | What |
|---|---|
| `src/App.tsx` | Connects to the engine, then shows the screen the route asks for |
| `src/api/` | `client.ts` (every engine call, with the token), `connection.ts` (the engine link), `types.gen.ts` (generated from the API contract: `cd ../engine && uv run python -m cardia_api.openapi`; never edit by hand) |
| `src/screens/` | Library, Import, Processing, Heart, Settings (PLAN.md §9 screens 1, 2, 3, 11) and Learn |
| `src/components/` | The app shell and shared parts (method panel, progress, notes) |
| `src/lib/` | Routing (`#/library`, `#/hearts/<key>`…), file-name rules, dropped files and ZIPs, number formatting |
| `src/test/` | The fake engine client used by screen tests |
| `src/index.css` | Colours as tokens on `:root`, light and dark themes (`data-theme` from Settings), reduced motion |
