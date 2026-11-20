# Cardia

Cardia measures infarct size on scanned TTC heart slices automatically, and teaches the science behind it with an interactive 3D heart. It is built as a local web app first (a browser UI plus a Python engine on your own computer) and will become a desktop app for Windows and macOS.

* The plan: [PLAN.md](PLAN.md)
* Who does what, setup and workflow: [CONTRIBUTING.md](CONTRIBUTING.md)

## Layout

| Path | What | In git |
|---|---|---|
| `engine/` | Python engine: `ttc_pipeline/` (analysis), `cardia_api/` (local API), `models/`, `annotations/`, `tests/` | yes (model binaries: pending, see CONTRIBUTING) |
| `web/` | React + TypeScript web app (milestone 2) | yes |
| `content/` | Learn lessons, glossary and quizzes, one folder per language | yes |
| `scripts/` | `setup.sh`, `check_data.py`, `study-data.sha256` | yes |
| `data/` | GVSU study scans and `.out` reference files (41 files, checked by SHA-256) | **never** |
| `reference/` | Reference notebook, its saved results (`results_local/`), link to the research repo | **never** |

## Quick start

```bash
scripts/setup.sh <your-github-username>
cd engine && uv run python -c "import cv2, numpy, sklearn; print('engine ok')"
```

## Study data at a glance

* 30 slices from 8 hearts. All are RGB TIFFs, about 300–700 px per side, and tagged 1200 dpi (0.0212 mm per pixel).
* References: Ref-0 is the professor's `*InfSize.out` for all 8 hearts. Ref-YHS (`*InfSizeYHS.out`) covers hearts 109, 119 and 129, 11 slices in total.
* 10 hand-marked holes on 8 slices, stored as polygons inline in notebook Step 21.
