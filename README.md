# Cardia

Cardia measures infarct size on scanned TTC heart slices automatically, and teaches the science behind it with an interactive 3D heart. It is built as a local web app first (a browser UI plus a Python engine on your own computer) and will become a desktop app for Windows and macOS.

* The plan: [PLAN.md](PLAN.md)
* Who does what, setup and workflow: [CONTRIBUTING.md](CONTRIBUTING.md)

## Layout

| Path | What | In git |
|---|---|---|
| `engine/` | Python engine: `ttc_pipeline/` (analysis), `cardia_api/` (the local API the web app calls, contract in `openapi.json`), `training/` (one-time training and Phase 0 checks), `models/`, `tests/` | yes, except model binaries (`*.joblib`) and `annotations/` (team Drive) |
| `web/` | React + TypeScript web app (milestone 2) | yes |
| `content/` | Learn lessons, glossary and quizzes, one folder per language | yes |
| `scripts/` | `setup.sh`, `check_data.py`, `study-data.sha256` | yes |
| `data/` | GVSU study scans and `.out` reference files (41 files, checked by SHA-256) | **never** |
| `reference/` | Reference notebook, its saved results (`results_local/`), link to the research repo, the golden set (`golden/`) and Phase 0 outputs (`phase0/`) | **never** |

## Quick start

```bash
scripts/setup.sh <your-github-username>
cd engine && uv run python -m cardia_api --mock   # the engine API with fake analysis, for UI work
cd engine && uv run python -m cardia_api          # the real engine (model binaries from the team Drive)
```

The engine listens on 127.0.0.1 only and prints a link that opens the app with a fresh token. How the app uses it: [engine/cardia_api/README.md](engine/cardia_api/README.md).

## Study data at a glance

* 30 slices from 8 hearts. All are RGB TIFFs, about 300–700 px per side, and tagged 1200 dpi (0.0212 mm per pixel).
* References: Ref-0 is the professor's `*InfSize.out` for all 8 hearts. Ref-YHS (`*InfSizeYHS.out`) covers hearts 109, 119 and 129, 11 slices in total.
* 10 hand-marked holes on 8 slices (from notebook Step 21), in `engine/annotations/holes/` (team Drive).

## Phase 0 results (2026-11-23)

Both methods as the engine runs them, put through the same checks by `engine/training/scorecard.py`. Every number is held out: Method A scores each heart with a forest trained on the other 7; Method B scores each time-control heart with the cut chosen on the other two. None of the references is ground truth: Ref-0 is the professor's grayscale rule, Ref-1 the same rule inside the real tissue, Ref-YHS a second lab measurement that covers only hearts 109, 119 and 129. Details and decisions: PLAN.md §2d–§2h and §8.

| Check | Method A (K-Means + RF) | Method B (a\* cut) | Phase 0 rule |
|---|---|---|---|
| Time-control slices vs Ref-YHS, MAE | 22.2 pp | **2.4 pp** | B: ≤ 2.9 pp ✓ |
| Heart % vs Ref-YHS / Ref-1 / Ref-0, MAE | 19.0 / **4.0** / **7.7** pp | **2.1** / 24.5 / 20.5 pp | A: ≤ 5 pp vs YHS ✗ |
| Time-control hearts 108 / 109 / 119 / 129 (expected ≈ 0–5%) | 21.4 / 6.7 / 24.9 / 34.2% | 3.5 / 0.8 / 5.1 / 0.9% | |
| High-infarct hearts 206 / 207 / 208 / 210 (Ref-1: 79.5 / 78.7 / 64.4 / 56.1%) | 81.2 / 81.4 / 64.6 / 52.0% | 47.8 / 44.8 / 35.2 / 11.9% | |
| Dead-area overlap with Ref-1: Dice (ROC AUC) | **0.913** (0.963) | 0.562 (0.837) | |
| Edge ring, points (Ref-1: 12.1) | 15.3 | 12.9 | |
| Mild shadow (75% light): verdicts that flip under it | 40.9% | **3.2%** | < 5% (A ✗, B ✓) |
| Rotate + flip + 8% darker: mean (max) shift | 0.26 (0.62) pp | 0.37 (1.29) pp | ≤ 1.0 pp ✓ |
| Outline area vs slice weight, mean within-heart r | 0.930 | 0.950 | ≥ 0.95 (A ✗, B ✓) |
| Range contains YHS on time-control slices; slices ≤ 10 pp wide | 0 of 11; 100% | 6 of 11; 30% | both ✗ |
| Same file twice | bit-identical | bit-identical | ✓ |

* **What it means:** A agrees with the professor-based references, B with YHS, and they differ by 6–40 pp per heart. Expert tracings (Ref-2) are needed to say which is right (PLAN.md §13 items 9 and 13).
* **Decisions (2026-11-23):** both methods are shown side by side with no "methods disagree" flag; only Method B's range is shown; Method A ships as is with its limits stated and a shadow warning. Ranges and the A-or-B choice are revisited once the app is built.
* **Port checks:** the shared steps and Method B reproduce the notebook and the research repo exactly; Method A's frozen forest reproduces the notebook's printed results exactly (PLAN.md §2e).
* **Golden set:** the 30 slices as the engine analyses them, in `reference/golden/` (team Drive), checked by `engine/tests/test_golden.py` against the hashes in `engine/tests/golden/golden.sha256`.
