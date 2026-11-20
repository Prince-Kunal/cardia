# Golden set

The reference outputs the engine must reproduce (PLAN.md §7). Phase 0 generates them, and every engine change is tested against them. Owner: Melove, with Prince for Method B.

## What it holds

The 30 study slices, each run through the shared front end and both methods:

`per_slice.csv`, one row per slice:

| Column | Meaning |
|---|---|
| `file`, `heart`, `weight_mg` | From the file name |
| `image_sha256` | SHA-256 of the input TIFF (must match `scripts/study-data.sha256`) |
| `tissue_px`, `holes_removed_px`, `holes_uncertain_px`, `filled_px` | Shared tissue mask and hole decisions |
| `a_dead_pct`, `a_low_pct`, `a_high_pct`, `a_unsure_pct` | Method A (K-Means + RF): dead at p ≥ 0.5, range, 0.35 < p < 0.65 |
| `b_dead_pct`, `b_low_pct`, `b_high_pct`, `b_borderline_pct` | Method B (a\* cut): a\* < 11.75, range, 11.75 ≤ a\* < 18.66 |
| `qc_flags` | Semicolon-separated QC flags |
| `pipeline_version`, `models_manifest_sha256` | What produced the row |

Masks per slice (PNG, 0/255): `tissue`, `holes_removed`, `a_dead`, `b_dead`, `b_borderline`.

## Where it comes from

* **Method A and the shared steps:** the reference notebook (`GVSU_Infarct_Pipeline_main.ipynb`, Parts D, E, G, L, O) with the frozen `final_model_K_Means_RF.joblib`. Its tissue masks must equal `reference/results_local/masks/*_tissue.png`.
* **Method B:** `ttc/` from the research repo, after its Phase 0 re-calibration (PLAN.md §2f).

## Pass rules

* Same OS as the reference run: identical numbers and masks.
* Another OS: every slice within **0.1 pp**, **IoU ≥ 0.99** on every mask, identical QC flags.
* Running the same file twice gives bit-identical output.

## Storage

The masks and `per_slice.csv` are derived from GVSU scans. Until the team settles PLAN.md §13 item 12 (public repo), they live in the team Drive next to the models, with their SHA-256 in `engine/models/manifest.json`, and are not committed. Tests look for them in `reference/golden/` and skip with a clear message when they are missing.

Any intended change to engine output bumps the pipeline version, regenerates this set (from the notebook first), and is listed in "What's new".
