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
| `b_tissue_px` | Method B's own outline, shared holes removed |
| `a_dead_pct`, `a_low_pct`, `a_high_pct`, `a_unsure_pct` | Method A (K-Means + RF): dead at p ≥ 0.5, range, 0.35 < p < 0.65 |
| `b_dead_pct`, `b_low_pct`, `b_high_pct`, `b_borderline_pct` | Method B (a\* cut): a\* < 11.75, range, 11.75 ≤ a\* < 18.60 |
| `qc_flags` | Semicolon-separated slice-level QC flags: `unvalidated_input`, `many_unsure`, `holes_removed`, `uncertain_holes` |
| `pipeline_version`, `models_manifest_sha256` | What produced the row |

Masks per slice (PNG, 0/255): `tissue`, `holes_removed`, `a_dead`, `b_tissue`, `b_dead`, `b_borderline`. `meta.json` records the pipeline and model versions and the platform that generated the set.

## Where it comes from

`engine/training/golden.py` runs the engine exactly as the app does: shared front end and hole model, Method A with the notebook's frozen forest, Method B with its own front end and the shipped cuts. Before that, Phase 0 showed each part reproduces its source: the shared steps and the notebook's held-out hole decisions give the notebook's tissue masks on all 30 slices; Method B reproduces the research repo's `measure.py`; Method A's forest gives the notebook's printed results (PLAN.md §2d–§2f).

## Pass rules

* Same OS as the reference run: identical numbers and masks.
* Another OS: every slice within **0.1 pp**, **IoU ≥ 0.99** on every mask, identical QC flags.
* Running the same file twice gives bit-identical output.

## Storage

The set is committed in `reference/golden/` (decided 2026-11-23, PLAN.md §13 item 12). `golden.sha256` in this folder lists every golden file's SHA-256, and `test_golden.py` checks the set against it. CI runs the golden tests on macOS and Linux. To regenerate it: `cd engine && uv run python -m training.golden`.

Any intended change to engine output bumps the pipeline version, regenerates this set, and is listed in "What's new".
