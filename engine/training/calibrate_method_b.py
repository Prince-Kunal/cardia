"""Phase 0: re-derive Method B's cut-offs and decide its front end (PLAN.md §2f, §8).

Runs the research repo's cut-off recipe (`training/method_b.py`) on three versions of the input:

1. the repo's own run (original front end, generator carried across slices): must reproduce the
   repo's 11.75 / 18.66 and its per-slice numbers exactly, which shows the recipe port is exact;
2. the shared front end (lighting correction, tissue mask, shared hole model);
3. the original front end seeded per slice, minus the shared hole model's holes (what the engine runs
   if 2 fails).

Pass rule (fixed before running): the shared front end is used if its time-control slices are within
2.9 pp of YHS (held out by heart); otherwise Method B keeps its original front end (3). Writes
models/a_cut/a_cut.json and its manifest entry.

    cd engine && uv run python -m training.calibrate_method_b
"""

import datetime

from ttc_pipeline import PIPELINE_VERSION, HoleModel, read_rgb, run_front_end
from ttc_pipeline.method_b import A_CUT_JSON, method_b_tissue, smoothed_a
from ttc_pipeline.models import MODELS_DIR

from .manifest import update_manifest, write_json
from .method_b import GRID, PASS_MAE_PP, calibrate, read_out
from .method_b_original import repo_front_end
from .study import study_scans

MODEL_VERSION = "1.0.0"


def repo_calibration(scans, yhs):
    """The recipe on the research repo's own run. Returns (calibration, {name: (white-balanced photo, tissue)})."""
    repo = repo_front_end(scans)
    a = {n: smoothed_a(wb) for n, (wb, _) in repo.items()}
    return calibrate(a, {n: t for n, (_, t) in repo.items()}, yhs), repo


def engine_calibrations(scans, yhs, hole_model):
    """The recipe on the shared front end, and on the original front end as the engine runs it."""
    a_shared, t_shared, a_orig, t_orig = {}, {}, {}, {}
    for name, path in scans.items():
        rgb = read_rgb(path)
        fe = run_front_end(rgb, hole_model)
        a_shared[name], t_shared[name] = smoothed_a(fe.norm), fe.tissue
        t_orig[name], wb = method_b_tissue(rgb, fe.holes)
        a_orig[name] = smoothed_a(wb)
    return calibrate(a_shared, t_shared, yhs), calibrate(a_orig, t_orig, yhs)


def summary(c):
    return {
        "conservative": c.conservative,
        "liberal": c.liberal,
        "time_control_loho_cuts": c.loho_cuts,
        "time_control_mae_vs_yhs_pp": round(c.mae_vs_yhs, 3),
        "passes": c.passes,
    }


def main(models_dir=MODELS_DIR):
    scans = study_scans()
    assert len(scans) == 30, f"expected the 30 study scans in data/, found {len(scans)}"
    yhs = read_out("*InfSizeYHS.out")
    hole_model = HoleModel.load(models_dir)
    repo, _ = repo_calibration(scans, yhs)
    shared, original = engine_calibrations(scans, yhs, hole_model)
    print("research repo's run reproduced:", summary(repo))
    print("shared front end:", summary(shared))
    print("original front end, seeded per slice, shared holes removed:", summary(original))
    if shared.passes:
        raise SystemExit("The shared front end passes: switch ttc_pipeline.method_b to it before writing a_cut.json.")
    info = {
        "model": "a_cut",
        "model_version": MODEL_VERSION,
        "trained": datetime.date.today().isoformat(),
        "pipeline_version": PIPELINE_VERSION,
        "hole_model_version": hole_model.version,
        "front_end": (
            "original (research repo ttc/segment.py: white balance, chroma + GrabCut outline, lumen excluded), "
            "GrabCut seeded per slice; real holes from the shared hole model removed"
        ),
        "a_star": "scikit-image CIELAB a* of the white-balanced photo, Gaussian blur sigma 1.5",
        "conservative": original.conservative,
        "liberal": original.liberal,
        "recipe": {
            "conservative": (
                f"a* cut on a grid {GRID[0]}-{GRID[-1]} step {GRID[1] - GRID[0]} with the smallest mean absolute "
                "error of slice infarct % vs YHS on the time-control slices; accuracy reported leave one heart out"
            ),
            "liberal": "valley of a 2-component GMM on a* pooled from all 30 slices (5,000 px per slice, seed 42)",
        },
        "calibration": summary(original),
        "pass_rule": f"shared front end if time-control MAE vs YHS <= {PASS_MAE_PP} pp, else the original front end",
        "shared_front_end_trial": summary(shared),
        "research_repo_reproduced": summary(repo),
    }
    write_json(models_dir / A_CUT_JSON, info)
    update_manifest({A_CUT_JSON: {"model_version": MODEL_VERSION}}, models_dir)
    print(f"Wrote {A_CUT_JSON}: conservative {original.conservative}, liberal {original.liberal}")


if __name__ == "__main__":
    main()
