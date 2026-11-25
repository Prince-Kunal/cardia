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

Analyze needs the engine; Learn doesn't (open `http://localhost:5173/#/learn`). Start the engine in another terminal; it prints a link that opens the app already connected:

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
| `src/landing/` | The landing page (`#/`): one heart's story told by scrolling, from LAD occlusion to slicing, TTC staining and the microscope, ending on a real study slice (`public/landing/`, slice 210IS109 with its golden Method A mask). `story.ts` is the timeline (pure, tested), `world.ts` builds and moves the three.js world, `tissue.ts` holds the shaders. In development, `?u=4.5&still` holds the scene at a moment of the story |
| `src/screens/` | Library, Import, Processing, Heart, Settings (PLAN.md §9 screens 1, 2, 3, 11) |
| `src/learn/` | Learn (screens 7, 8, 9): lesson format parser, course map and tracks, lesson player, quizzes, glossary, spaced review, progress (kept in the browser until cloud sync). As a game (`game.ts`, `GameParts.tsx`): the course is a path of units, with XP (logged per day in progress, so it syncs), a daily goal, streaks, hearts and a combo inside a lesson, synthesized sounds, and Tetra, the TTC-drop mascot. Lessons come from `../content/` (see its README). Owner: Melove |
| `src/heart/` | The heart for Learn: a 2D diagram driven by each lesson step's scene (view, highlights, labels, animations; shapes in `geometry.ts`), and the 2D fallback for the 3D heart |
| `src/heart3d/` | The 3D heart v1 (three.js + React Three Fiber): a stylised heart modelled in code with the PLAN.md §3f part ids (`model.ts`), driven by the same scenes; loaded only when shown. `HeartView` picks 3D or 2D (no WebGL, or the learner's choice) |
| `src/components/` | The app shell and shared parts (method panel, progress, notes) |
| `src/lib/` | Routing (`#/library`, `#/hearts/<key>`…), scrolling (`scroll.ts`: Lenis smooth scrolling, off under reduced motion; a page reached by a link starts at the top), file-name rules, dropped files and ZIPs, number formatting |
| `src/test/` | The fake engine client used by screen tests |
| `src/index.css` | One design system, "The Living Stain": colours sampled from the study's scans (formazan rose, infarct ivory, scan-paper grid; a darkroom dark theme), Fraunces / Instrument Sans / JetBrains Mono / Bricolage Grotesque (bundled, so it works offline), spacing and motion tokens on `:root`, light and dark themes (`data-theme` from Settings), reduced motion. The header's ECG line (`components/VitalLine.tsx`) is the engine's pulse |
