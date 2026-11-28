# Cardia

Cardia measures infarct size on scanned TTC heart slices automatically, and teaches the science behind it with an interactive 3D heart. It is built as a local web app first (a browser UI plus a Python engine on your own computer) and will become a desktop app for Windows and macOS.

* **Live demo: <https://139-84-209-207.sslip.io>.** The real engine in public mode, redeployed on every push to `main` ([deploy/README.md](deploy/README.md)). Everyone who opens the link shares one library and can see, add and delete hearts (PLAN.md D14); backup, restore and the watch folder are off.
* The plan: [PLAN.md](PLAN.md)
* Who does what, setup and workflow: [CONTRIBUTING.md](CONTRIBUTING.md)

## Layout

| Path | What | In git |
|---|---|---|
| `engine/` | Python engine: `ttc_pipeline/` (analysis), `cardia_api/` (the local API the web app calls, contract in `openapi.json`), `training/` (one-time training and Phase 0 checks), `models/`, `annotations/`, `tests/` | yes |
| `web/` | React + TypeScript web app: the landing page, Analyze (import, library, reports, export, sync), Learn (lessons, quizzes, the 3D heart) and Help. Layout: [web/README.md](web/README.md) | yes |
| `content/` | Learn lessons, glossary and quizzes, in English (`content/en/`) | yes |
| `cloud/` | The Supabase schema for cloud sync, with row-level security per workspace (off until the project's keys exist) | yes |
| `deploy/` | The public demo: server setup, Caddy (HTTPS on sslip.io) and the systemd service; `.github/workflows/deploy.yml` redeploys on every push to `main` | yes |
| `scripts/` | `setup.sh`, `check_data.py`, `study-data.sha256` | yes |
| `data/` | GVSU study scans and `.out` reference files (41 files, checked by SHA-256). Private but not secret: GVSU shared them for us to use as we like, deployment included | yes |
| `reference/` | The notebook's saved results (`results_local/`), the golden set (`golden/`) and Phase 0 outputs (`phase0/`); also, not in git, the notebook itself (team Drive) and a clone of the research repo (`research-repo/`) | yes, except the notebook, its caches and the research repo |

## Quick start

```bash
scripts/setup.sh <your-github-username>
cd engine && uv run python -m cardia_api --mock   # the engine API with fake analysis, for UI work
cd engine && uv run python -m cardia_api          # the real engine
cd web && pnpm install --frozen-lockfile && pnpm dev   # the web app, in another terminal
```

The engine listens on 127.0.0.1 only and prints a link that opens the app (the dev server on port 5173) with a fresh token. How the app uses it: [engine/cardia_api/README.md](engine/cardia_api/README.md).

## Study data at a glance

* 30 slices from 8 hearts. All are RGB TIFFs, about 300–700 px per side, and tagged 1200 dpi (0.0212 mm per pixel).
* References: Ref-0 is the professor's `*InfSize.out` for all 8 hearts. Ref-YHS (`*InfSizeYHS.out`) covers hearts 109, 119 and 129, 11 slices in total.
* 10 hand-marked holes on 8 slices (from notebook Step 21), in `engine/annotations/holes/`.

## Three methods (2026-11-25): A and B compared, C apart

Every slice is measured three ways (PLAN.md D13). The app shows **Method A** and **Method B** side by side, because they are the same machine-learning recipe with a different teacher, and **Method C** apart, because it is a colour rule with no machine learning. Method A is the default headline.

| | Method A: K-Means + RF | **Method B: DBSCAN + RF** | Method C: stain ratio |
|---|---|---|---|
| What decides dead | A random forest on 22 numbers per pixel; p ≥ 0.5 | The same 22 numbers and forest recipe; p ≥ 0.5 | Less than half the red stain of living muscle, leaning cream |
| Taught by | K-Means (3 colour groups) | DBSCAN (dense colour crowds), its settings tuned against Ref-1 | Nothing: two reference colours from the study photos |
| Source | `GVSU_Infarct_Pipeline_main.ipynb`, frozen forest | `GVSU_Infarct_Pipeline_dbscan_search.ipynb` "Tuned DBSCAN + RF", trained here | Designed 2026-11-24 (was Method B in pipeline 0.5.x) |

**Method B** (`engine/training/method_b.py`, a step-for-step port of the notebook's `DBSCANTuned`, `tune_dbscan` and `fit_model`). DBSCAN's settings are picked on the training hearts in two stages: every colour scale × eps × min points × groups × matching scored by how well DBSCAN alone matches Ref-1, then the best 4 per matching with every example rule and cut-off scored through a small forest. On all 8 hearts the port picks the notebook's own settings (colour at σ 1, eps at the 2nd percentile of 40-neighbour distances, the palest and reddest groups, matched by group centre, margin 0.6, cut-off 0.5); its stage-1 scores match the notebook's saved run to 2·10⁻⁵. The notebook saved no Method B model, so `engine/training/export_method_b.py` trains the forest (150 trees, 2,000 pixels per class per slice) on all 8 hearts and freezes it in `engine/models/dbscan_rf/`.

Held-out results from `engine/training/scorecard.py` (each heart scored by a model that never saw it; heart % weighted by slice weight):

| Check | Method A | **Method B** | Method C |
|---|---|---|---|
| Time-control hearts 108 / 109 / 119 / 129 (YHS: — / 1.5 / 3.0 / 4.4) | 21.8 / 6.7 / 25.0 / 34.2% | 19.4 / 7.5 / 16.7 / 37.7% | 6.6 / 0.5 / 10.7 / 8.8% |
| Infarct hearts 206 / 207 / 208 / 210 (Ref-1: 79.5 / 78.7 / 64.4 / 56.1) | 81.2 / 81.4 / 64.6 / 52.0% | 80.1 / 72.5 / 51.8 / 49.8% | 66.5 / 66.6 / 59.4 / 30.1% |
| Heart MAE vs Ref-1 / vs YHS | 4.1 / 19.0 pp | 5.2 / 17.7 pp | 12.1 / 4.3 pp |
| Dead-area overlap with Ref-1: Dice (ROC AUC) | 0.913 (0.963) | 0.862 (0.923) | 0.746 (0.886) |
| Edge ring, points (Ref-1: 12.1) | 15.4 | 22.6 | −0.5 |
| Mild / strong shadow (75% / 55% light): dead pixels that flip | 41% / 66% | 29% / 43% | 0.14% / 0.33% |
| Rotate + flip + 8% darker: mean (max) shift | 0.26 (0.62) pp | 0.25 (0.56) pp | 0.19 (1.91) pp |
| Shipped model vs held-out, mean slice difference | 2.2 pp | **11.2 pp** | 0.6 pp |

The held-out Method B reproduces the notebook's Tuned DBSCAN + RF (Dice 0.864, heart error 4.9 pp there; 0.862 and 5.2 pp here). **Known limits of Method B:** DBSCAN's best settings change from one set of 7 hearts to the next (colour scale σ 1, 2 or 4; eps from the 2nd to the 20th percentile; extremes or split groups), and the shipped forest, tuned on all 8, reads higher than its held-out versions: on the time-control hearts 28.0 / 14.3 / 33.8 / 41.2% (YHS 1.5 / 3.0 / 4.4 for 109 / 119 / 129), above Method A. Its settings were chosen to agree with Ref-1, so it is not independent of that reference, and shadows flip a third of its dead pixels. For heart 207 the port's held-out tuning picks 40 min points where the notebook picked 25 (a near tie); the shipped settings are the notebook's.

Results stored by pipeline 0.5.x show their stain ratio as Method C and no Method B; results from 0.3.0 or 0.4.0 show Method A only. To get every method, move the heart to the trash and import its scans again.

## Method C, "stain ratio" (2026-11-24; Method B until 2026-11-25)

Method C is a colour rule; the earlier a\* cut and the short-lived "stain hue" method are retired (PLAN.md D12): the a\* cut missed unstained tissue on the infarct hearts, the stain hue still missed the pale-pink and mottled tissue around it, and Method A calls pale pink tissue dead on the control hearts.

Method C asks of each pixel: **does it hold less than half the red stain of living muscle?**

* **Colour as light absorbed.** The paper flat field kept in linear light, unclipped (the 8-bit corrected image clips the red channel of under-exposed scans, 53% of 119IS80's tissue), turned into optical density per channel. Stain s = OD(green) − OD(red): formazan absorbs green, hardly any red. Tint θ = atan2(s, OD(blue) − OD(red)): unstained tissue absorbs blue. A shadow adds the same optical density to every channel, so neither number moves.
* **Dead = less than half the living stain, leaning cream.** Two reference colours come from the 30 study slices: clearly unstained tissue and clearly stained tissue. Tissue holding half the stain lies midway between them in optical density (Beer–Lambert): stain 0.309, tint 35.5°. Pixels below both are dead. The tint condition keeps out whitish-pink pale tissue, about as common on the control hearts as on the infarct hearts. The range and the borderline band are the same rule at 40% and 60% of the stain.
* **The slice edge is filled from inside.** Every slice's outer edge reads pale whatever its state (the tissue thins and the paper shows through). Pixels within 17 px of the outline take the colour from further in; 17 px is where the pale edge has recovered 90% of the way to the slice's plateau.
* **No reference or label sets any number.** With any one heart left out, the cut moves by at most 0.009 in stain and 0.6° in tint. `engine/training/calibrate_method_c.py` reproduces `engine/models/stain_ratio/stain_ratio.json`; YHS is read only afterwards.

Its held-out results are in the table above (they are unchanged from pipeline 0.5.0). By eye, Method C's dead area covers the cream and white-cream tissue and the mottled zones around it, and leaves red and salmon-pink muscle alone. **Known limits:** on the control hearts, pale non-muscle tissue (valves, fat, the base) and pale patches count as dead, so hearts 119 and 129 read 10.7% and 8.8% where YHS reads 3.0% and 4.4%; the line at half the living stain is a definition, not something checked against expert tracings, which cannot be obtained; its range (40–60% of the stain) does not contain YHS on 10 of 11 time-control slices.

## Phase 0 results (2026-11-23)

*Historical: the Method B column is the retired a\* cut, as scored on 2026-11-23. `reference/phase0/` now holds the scorecard of the three current methods (above).*

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
