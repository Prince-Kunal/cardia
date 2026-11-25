"""Train and freeze Method B "DBSCAN + RF" (GVSU_Infarct_Pipeline_dbscan_search.ipynb, "Tuned DBSCAN + RF").

The notebook saved no Method B model (its Step 69 saves only the recommended K-Means + RF), so this script runs
the notebook's recipe (training/method_b.py) on the same 30 slices and freezes the result:

1. the study slices as the notebook saw them: the engine's lighting correction, the notebook's saved tissue
   masks (reference/results_local/masks) and Ref-1 inside them;
2. DBSCAN's settings tuned on all 8 hearts (and, for the scorecard's held-out check, on each set of 7);
3. the forest trained on all 8 hearts with the winning settings, written to models/dbscan_rf/.

Check: the tuning picks the same settings as the notebook's saved run (colour scale s1, eps at the 2nd
percentile, 40 min points, the palest and reddest groups, matched by group centre, margin 0.6, cut-off 0.5).

    cd engine && uv run python -m training.export_method_b        # about 25 minutes
"""

import datetime

import joblib
import numpy as np
import sklearn

from ttc_pipeline import PIPELINE_VERSION, normalise_lighting, parse_name, read_rgb
from ttc_pipeline.method_a import FEATURE_NAMES, pixel_features
from ttc_pipeline.method_b import DBSCAN_RF_JOBLIB, DBSCAN_RF_JSON
from ttc_pipeline.models import MODELS_DIR, sha256_file

from .export_method_a import canonical_forest
from .manifest import update_manifest, write_json
from .method_b import DEAD, LIVE, fit_dbscan_rf, tune_dbscan
from .scorecard import ref1
from .study import study_scans

MODEL_VERSION = "1.0.0"
NOTEBOOK_BEST = {
    "space": "s1",
    "q": 2,
    "ms": 40,
    "mode": "extremes",
    "base": "centre",
    "rule": "margin",
    "val": 0.6,
    "cut": 0.5,
}


def notebook_study():
    """Per slice, in study order: the 22 features on the notebook's tissue, Ref-1 dead on those pixels, heart."""
    features, y_ref, hearts = [], [], []
    for name, path in study_scans().items():
        rgb = read_rgb(path)
        norm, _ = normalise_lighting(rgb)
        tissue, dead = ref1(rgb, name)
        features.append(pixel_features(norm, tissue))
        y_ref.append(dead[tissue])
        hearts.append(parse_name(name)[0])
    return features, y_ref, hearts


def main(models_dir=MODELS_DIR):
    features, y_ref, hearts = notebook_study()
    every = list(range(len(features)))
    print(f"{len(features)} slices from {len(set(hearts))} hearts. Tuning DBSCAN on all hearts…")
    best = tune_dbscan(features, y_ref, hearts, every)["best"]
    if best != NOTEBOOK_BEST:
        print(f"WARNING: the tuning picked {best}, the notebook {NOTEBOOK_BEST}")
    held_out = {}
    for h in sorted(set(hearts)):
        print(f"Tuning without heart {h}…")
        held_out[h] = tune_dbscan(features, y_ref, hearts, [i for i in every if hearts[i] != h], log=lambda _: None)[
            "best"
        ]
    labeller, rf = fit_dbscan_rf(features, every, best)
    canonical_forest(rf)
    (models_dir / DBSCAN_RF_JOBLIB).parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(rf, models_dir / DBSCAN_RF_JOBLIB)
    groups = [
        {
            "mean_L_a_b": np.round(m, 2).tolist(),
            "role": {DEAD: "dead", LIVE: "alive"}.get(labeller.groups[c], "unlabelled"),
        }
        for c, m in labeller.means.items()
    ]
    info = {
        "model": "dbscan_rf",
        "model_version": MODEL_VERSION,
        "trained": datetime.date.today().isoformat(),
        "pipeline_version": PIPELINE_VERSION,
        "method": "Method B: DBSCAN + RF (the notebook's Tuned DBSCAN + RF)",
        "source": (
            "GVSU_Infarct_Pipeline_dbscan_search.ipynb Steps 36-37 and fit_model (Step 48), ported in "
            "training/method_b.py; trained on the 30 study slices (8 hearts) with the notebook's tissue masks"
        ),
        "features": FEATURE_NAMES,
        "dead_class": 1,
        "cut": float(labeller.cut),
        "dbscan": {
            **labeller.describe(),
            "tuned_on": "all 8 hearts, by average Dice per heart against Ref-1 (training/method_b.py tune_dbscan)",
            "groups_found": groups,
            "same_as_notebook": best == NOTEBOOK_BEST,
        },
        "leave_one_heart_out": held_out,
        "forest": {
            k: getattr(rf, k)
            for k in ("n_estimators", "min_samples_leaf", "max_features", "class_weight", "random_state")
        },
        "training_pixels": {"examples_per_class_per_slice": 2000},
        "notes": (
            "Ref-1 only picks DBSCAN's settings; the forest learns from DBSCAN's labels. The engine predicts with "
            "one thread so p is bit-identical between runs."
        ),
        "sklearn_version": sklearn.__version__,
        "numpy_version": np.__version__,
        "joblib_sha256": sha256_file(models_dir / DBSCAN_RF_JOBLIB),
    }
    write_json(models_dir / DBSCAN_RF_JSON, info)
    update_manifest(
        {DBSCAN_RF_JOBLIB: {"model_version": MODEL_VERSION}, DBSCAN_RF_JSON: {"model_version": MODEL_VERSION}},
        models_dir,
    )
    print(
        f"Wrote {DBSCAN_RF_JOBLIB} ({(models_dir / DBSCAN_RF_JOBLIB).stat().st_size / 1e6:.2f} MB) and {DBSCAN_RF_JSON}"
    )
    print("Settings:", labeller.describe())
    print("Held-out settings:", held_out)


if __name__ == "__main__":
    main()
