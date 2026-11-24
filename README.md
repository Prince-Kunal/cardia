# Cardia

Cardia measures infarct size on scanned TTC heart slices automatically, and teaches the science behind it with an interactive 3D heart. It is built as a local web app first (a browser UI plus a Python engine on your own computer) and will become a desktop app for Windows and macOS.

* The plan: [PLAN.md](PLAN.md)
* Who does what, setup and workflow: [CONTRIBUTING.md](CONTRIBUTING.md)

## Layout

| Path | What | In git |
|---|---|---|
| `engine/` | Python engine: `ttc_pipeline/` (analysis), `cardia_api/` (the local API the web app calls, contract in `openapi.json`), `training/` (one-time training and Phase 0 checks), `models/`, `annotations/`, `tests/` | yes |
| `web/` | React + TypeScript web app (milestone 2) | yes |
| `content/` | Learn lessons, glossary and quizzes, one folder per language | yes |
| `scripts/` | `setup.sh`, `check_data.py`, `study-data.sha256` | yes |
| `data/` | GVSU study scans and `.out` reference files (41 files, checked by SHA-256) | yes |
| `reference/` | The notebook's saved results (`results_local/`), the golden set (`golden/`) and Phase 0 outputs (`phase0/`); also, not in git, the notebook itself (team Drive) and a clone of the research repo (`research-repo/`) | yes, except the notebook, its caches and the research repo |

## Quick start

```bash
scripts/setup.sh <your-github-username>
cd engine && uv run python -m cardia_api --mock   # the engine API with fake analysis, for UI work
cd engine && uv run python -m cardia_api          # the real engine
```

The engine listens on 127.0.0.1 only and prints a link that opens the app with a fresh token. How the app uses it: [engine/cardia_api/README.md](engine/cardia_api/README.md).

## Study data at a glance

* 30 slices from 8 hearts. All are RGB TIFFs, about 300–700 px per side, and tagged 1200 dpi (0.0212 mm per pixel).
* References: Ref-0 is the professor's `*InfSize.out` for all 8 hearts. Ref-YHS (`*InfSizeYHS.out`) covers hearts 109, 119 and 129, 11 slices in total.
* 10 hand-marked holes on 8 slices (from notebook Step 21), in `engine/annotations/holes/`.

## Method B, "stain ratio" (2026-11-24): the default

Methods are now A (K-Means + RF, the notebook's) and B, the stain ratio. The earlier Method B (a\* cut) and the short-lived Method C (stain hue) are retired (PLAN.md D12): the a\* cut missed unstained tissue on the infarct hearts, Method C still missed the pale-pink and mottled tissue around it, and Method A calls pale pink tissue dead on the control hearts.

Method B asks of each pixel: **does it hold less than half the red stain of living muscle?**

* **Colour as light absorbed.** The paper flat field kept in linear light, unclipped (the 8-bit corrected image clips the red channel of under-exposed scans, 53% of 119IS80's tissue), turned into optical density per channel. Stain s = OD(green) − OD(red): formazan absorbs green, hardly any red. Tint θ = atan2(s, OD(blue) − OD(red)): unstained tissue absorbs blue. A shadow adds the same optical density to every channel, so neither number moves.
* **Dead = less than half the living stain, leaning cream.** Two reference colours come from the 30 study slices: clearly unstained tissue and clearly stained tissue. Tissue holding half the stain lies midway between them in optical density (Beer–Lambert): stain 0.309, tint 35.5°. Pixels below both are dead. The tint condition keeps out whitish-pink pale tissue, about as common on the control hearts as on the infarct hearts. The range and the borderline band are the same rule at 40% and 60% of the stain.
* **The slice edge is filled from inside.** Every slice's outer edge reads pale whatever its state (the tissue thins and the paper shows through). Pixels within 17 px of the outline take the colour from further in; 17 px is where the pale edge has recovered 90% of the way to the slice's plateau.
* **No reference or label sets any number.** With any one heart left out, the cut moves by at most 0.009 in stain and 0.6° in tint. `engine/training/calibrate_method_b.py` reproduces `engine/models/stain_ratio/stain_ratio.json`; YHS is read only afterwards.

Held-out results from `engine/training/scorecard.py` (heart % weighted by slice weight):

| Check | Method A | **Method B (stain ratio)** | Retired: a\* cut / Method C |
|---|---|---|---|
| Time-control hearts 108 / 109 / 119 / 129 (YHS: — / 1.5 / 3.0 / 4.4) | 21.8 / 6.7 / 25.0 / 34.2% | **6.6 / 0.5 / 10.7 / 8.8%** | 3.5 / 0.8 / 5.1 / 0.9% ; 4.3 / 0.4 / 5.8 / 3.1% |
| Time-control slices vs YHS, MAE | 22.2 pp | 5.6 pp (not tuned) | 2.4 pp (tuned on YHS) ; 2.1 pp |
| Infarct hearts 206 / 207 / 208 / 210 (Ref-1: 79.5 / 78.7 / 64.4 / 56.1) | 81.2 / 81.4 / 64.6 / 52.0% | **66.5 / 66.6 / 59.4 / 30.1%** | 47.8 / 44.8 / 35.2 / 11.9% ; 53.4 / 49.0 / 41.7 / 17.5% |
| Dead-area overlap with Ref-1: Dice (ROC AUC) | 0.913 (0.963) | 0.746 (0.886) | 0.562 (0.837) ; — |
| Edge ring, points (Ref-1: 12.1) | 15.4 | **−0.5** | 12.9 ; — |
| Mild / strong shadow (75% / 55% light): pixels that flip | 41% / 66% of dead | **0.35% of alive, 0.14% of dead / 0.56%, 0.33%** | 3.2% / 6.6% of alive ; about 1% / 2.6% (own test) |
| Rotate + flip + 8% darker: mean (max) shift | 0.26 (0.62) pp | 0.19 (1.91) pp | 0.37 (1.29) pp ; 0.24 pp |

By eye, Method B's dead area covers the cream and white-cream tissue and the mottled zones around it, and leaves red and salmon-pink muscle alone. **Known limits:** on the control hearts, pale non-muscle tissue (valves, fat, the base) and pale patches count as dead, so hearts 119 and 129 read 10.7% and 8.8% where YHS reads 3.0% and 4.4%; the line at half the living stain is a definition, not something checked against expert tracings, which cannot be obtained; its range (40–60% of the stain) does not contain YHS on 10 of 11 time-control slices. Method A runs on every slice and shows beside it. Results stored by pipeline 0.3.0 or 0.4.0 still open, with Method A only; to get Method B, move the heart to the trash and import its scans again.

## Phase 0 results (2026-11-23)

*Historical: the Method B column is the retired a\* cut, as scored on 2026-11-23. `reference/phase0/` now holds the scorecard of the stain ratio (above).*

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
* **Golden set:** the 30 slices as the engine analyses them, in `reference/golden/`, checked by `engine/tests/test_golden.py` against the hashes in `engine/tests/golden/golden.sha256`.
