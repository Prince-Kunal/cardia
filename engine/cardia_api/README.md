# Cardia engine API

The local server the web app talks to (PLAN.md §6, milestone 1). It analyses slices on this computer and never sends them anywhere. The contract is [`openapi.json`](openapi.json) (OpenAPI 3.1). This page is the short version. Owner: Prince.

## Run it

```bash
cd engine
uv run python -m cardia_api --mock      # fake analysis: no model files or lab data needed (for UI work)
uv run python -m cardia_api             # the real engine (needs the model binaries from the team Drive)
```

It listens on `http://127.0.0.1:8765` and prints a link for the app:

```
Open the app: http://localhost:5173/#engine=http%3A%2F%2F127.0.0.1%3A8765&token=<token>
```

Options: `--open` opens that link in the browser, `--port`, `--origin <url>` (repeatable; the UI origins allowed, default the Vite dev server on port 5173), `--data-dir`, `--workers`.

**Mock mode** returns the real JSON shapes and real PNG layers. Its numbers are made up: "tissue" is the colourful pixels and "dead" the pale ones. Every result says `"mock": true` and `pipeline_version: "mock"`, so the UI should show a "demo data" badge. Any picture of a pink or red shape on white paper works as input.

## Connecting from the UI

1. Read `engine` and `token` from `location.hash`, keep them in `sessionStorage`, then clear the hash.
2. Send `Authorization: Bearer <token>` on every call. `GET /api/v1/engine` confirms the token works.
3. The token changes at every launch. If a call returns 401, ask the user to reopen the link the engine printed.

`GET /api/v1/health` needs no token and tells you whether the engine is up. While it runs, the engine also writes `<data dir>/engine.json` (`url`, `token`, `pid`), readable only by your user, for local tools such as a Vite plugin or, later, the desktop shell.

The engine refuses requests whose `Origin` is not an allowed UI origin (403) and whose `Host` is not `127.0.0.1` or `localhost` (400).

## The flow

| Step | Call | Notes |
|---|---|---|
| Import | `POST /api/v1/jobs` (multipart, field `files`, one or more) | Returns `202` and a `Job` right away. Heart ID and weight come from names like `206IS89mg.tif` |
| Progress | `GET /api/v1/jobs/{job_id}` every ~0.5 s until `finished_at` is set | Each slice has `state`, `stage` and `progress` (0–1); the job has `progress` and `counts` |
| Cancel | `POST /api/v1/jobs/{job_id}/cancel` | Slices not yet started are cancelled; running ones (a few seconds each) finish and are kept |
| Slice report | `GET /api/v1/slices/{slice_id}` | `SliceResult`: tissue, Method A, Method B, QC flags, versions, layer names |
| Layers | `GET /api/v1/slices/{slice_id}/layers/{layer}` | PNG at full resolution; see below |
| Heart report | `POST /api/v1/hearts/summary` with `{"slices": [{"slice_id": …, "weight_mg"?: …}]}` | Weighted heart numbers. `weight_mg` here overrides the file name (a weight the user typed) |
| Library | `GET /api/v1/slices` | Every stored result, newest first. Jobs are kept only until the engine stops; results stay on disk |

A problem with one file fails that slice and leaves the rest of the job running. Each failed slice gets an `error.code`:

| `error.code` | Meaning |
|---|---|
| `unsupported_file` | The file type is not accepted |
| `file_too_large` | The file is over the size limit (`max_upload_mb`) |
| `duplicate` | The same image was already in this upload |
| `unreadable_image` | The file could not be read as an image |
| `analysis_failed` | The analysis itself failed |
| `engine_stopped` | The engine stopped before the slice finished |

Uploading a scan that was already analysed returns the stored result at once (`cached: true`, same `slice_id`).

## Numbers

* Percentages are 0–100; `null` means the method found no tissue. mm² values are `null` when the image has no DPI; mg values are `null` without a weight.
* `method_a.range` and `method_b.range` carry `shown`. **Show a range only when `shown` is true.** For now only Method B's is (PLAN.md §2g).
* `qc_flags`: `unvalidated_input` (not a TIFF), `many_unsure` (Method A: > 15% unsure), `holes_removed`, `uncertain_holes`.
* A heart summary's `weighting` is `slice_weight`, or `tissue_area` when any weight is missing. The `weights_missing` flag marks the second case. `mixed_heart_ids` means the slices came from different heart IDs.
* Every result names the `pipeline_version`, the model files with their SHA-256, and the image's SHA-256. Show them in reports and exports (PLAN.md §1e).

## Layers

`GET /api/v1/engine` lists the 12 layers with a title, a description and a `kind`:

| kind | PNG | How to show it |
|---|---|---|
| `photo` | RGB (`original`, `corrected`) | As the base image. Browsers can't show TIFF, so use these |
| `mask` | white where true, transparent elsewhere | Tint it with the theme colour: `background: var(--dead); mask-image: url(blob:…)` (or draw it on a canvas) |
| `heatmap` | RGBA, viridis colour map from p = 0 (dark blue) to 1 (yellow), transparent outside the tissue | Draw it as is; draw the legend from the same colour map |

An `<img src>` can't send the token, so fetch each layer with the header and show it through `URL.createObjectURL(blob)`. A layer never changes for a given `slice_id`, so cache it as long as you like.

## Types for the web app

Generate TypeScript types from the contract rather than writing them by hand, e.g. `pnpm dlx openapi-typescript ../engine/cardia_api/openapi.json -o src/api/engine.d.ts`. The `operationId`s (`createJob`, `getJob`, `getSlice`, `summariseHeart`, …) give function names to generated clients.

## Changing the API

Edit `schemas.py` / `app.py`, then run `uv run python -m cardia_api.openapi` to rewrite `openapi.json` and commit both. `tests/test_api.py` fails while the two differ. Until 1.0.0, `/api/v1` changes only by adding fields; anything else goes to the team first.

## Inside

| File | What |
|---|---|
| `app.py` | Routes |
| `schemas.py` | The contract's types |
| `security.py` | Host, origin and token checks |
| `jobs.py` | Job queue: a pool of worker processes (`spawn`), progress, cancel |
| `worker.py` | One slice in a worker: `ttc_pipeline.analyse_slice` (the function the golden set is made with), then the layers and `result.json` |
| `store.py` | The data folder: images by SHA-256 and one folder per slice |
| `mock.py` | Fake analysis for `--mock` |

`tests/test_api_golden.py` runs the 30 study scans through the API and checks every number and mask against the golden set (it needs the data, the models and the golden set, so it skips in CI).
