"""Freeze Method A's forest into the engine's model format (PLAN.md §2e, D5).

Reads the notebook's `final_model_K_Means_RF.joblib` through the guarded loader (known SHA-256,
allow-listed classes only), keeps the random forest (the K-Means labeller is training-only), and writes
models/kmeans_rf/kmeans_rf.joblib, kmeans_rf.json and their manifest entries.
The forest is exported as it is, never retrained: retraining on another machine changes it slightly.

    cd engine && uv run python -m training.export_method_a
"""

import datetime
import sys

import joblib
import numpy as np
import sklearn

from ttc_pipeline import PIPELINE_VERSION
from ttc_pipeline.method_a import FEATURE_NAMES, RF_JOBLIB, RF_JSON
from ttc_pipeline.models import MODELS_DIR, sha256_file

from .manifest import update_manifest, write_json
from .method_a_original import SOURCE, SOURCE_SHA256, load_notebook_model

MODEL_VERSION = "1.0.0"


def _interned(value):
    if isinstance(value, str):
        return sys.intern(value)
    if isinstance(value, tuple):
        return tuple(_interned(v) for v in value)
    if isinstance(value, list):
        return [_interned(v) for v in value]
    if isinstance(value, dict):
        return {_interned(k): _interned(v) for k, v in value.items()}
    return value


def canonical_forest(rf):
    """Make the forest's pickle depend only on its content, so two exports are byte-identical.

    * A tree node is a C struct with a few unused padding bytes that otherwise hold leftover memory: each
      tree's node array is rebuilt from a zeroed buffer.
    * Pickle writes a repeated string as a back-reference only if it is the same object, and whether equal
      strings are the same object depends on what ran before in the process: every attribute name and string
      value is interned.
    """
    for est in [rf, rf.estimator, getattr(rf, "estimator_", rf.estimator), *rf.estimators_]:
        # names too: scikit-learn restores attributes with __dict__.update, which does not intern them
        est.__dict__ = _interned(dict(vars(est)))
    for est in rf.estimators_:
        state = est.tree_.__getstate__()
        nodes = state["nodes"]
        clean = np.zeros(nodes.shape, dtype=nodes.dtype)
        for name in nodes.dtype.names:
            clean[name] = nodes[name]
        est.tree_.__setstate__({**state, "nodes": clean})
    return rf


def main(models_dir=MODELS_DIR, source=SOURCE):
    nb = load_notebook_model(source)
    assert nb["method"] == "K-Means + RF" and nb["feat"] == "base" and nb["post"] is None and nb["pca"] is None
    assert nb["features"] == FEATURE_NAMES, "the notebook's feature list differs from the engine's"
    rf = nb["rf"]
    reference = rf.estimators_[0].tree_.__getstate__()["nodes"].copy()
    canonical_forest(rf)
    assert all(
        np.array_equal(reference[f], rf.estimators_[0].tree_.__getstate__()["nodes"][f]) for f in reference.dtype.names
    )
    (models_dir / RF_JOBLIB).parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(rf, models_dir / RF_JOBLIB)
    km = nb["labeller"].km
    info = {
        "model": "kmeans_rf",
        "model_version": MODEL_VERSION,
        "exported": datetime.date.today().isoformat(),
        "pipeline_version": PIPELINE_VERSION,
        "method": "Method A: K-Means + RF",
        "source": {
            "file": "final_model_K_Means_RF.joblib (reference notebook Step 67, trained on all 8 hearts)",
            "sha256": SOURCE_SHA256,
        },
        "features": FEATURE_NAMES,
        "dead_class": 1,
        "cut": float(nb["cut"]),
        "forest": {
            "n_estimators": rf.n_estimators,
            "min_samples_leaf": rf.min_samples_leaf,
            "max_features": rf.max_features,
            "class_weight": rf.class_weight,
            "random_state": rf.random_state,
        },
        "kmeans_training_labels": {
            "centres_L_a_b": np.round(km.cluster_centers_, 2).tolist(),
            "alive_centre": int(nb["labeller"].live),
            "dead_centre": int(nb["labeller"].dead),
        },
        "notes": (
            "The forest is the notebook's own, exported unchanged (tree padding zeroed and strings interned so the "
            "export is byte-reproducible). The engine predicts with one thread so p is "
            "bit-identical between runs. Retraining with training/method_a.py on another machine gives a slightly "
            "different forest (K-Means float32 sums depend on CPU and thread count)."
        ),
        "sklearn_version": sklearn.__version__,
        "numpy_version": np.__version__,
        "joblib_sha256": sha256_file(models_dir / RF_JOBLIB),
    }
    write_json(models_dir / RF_JSON, info)
    update_manifest(
        {RF_JOBLIB: {"model_version": MODEL_VERSION}, RF_JSON: {"model_version": MODEL_VERSION}},
        models_dir,
    )
    print(f"Wrote {RF_JOBLIB} (sha256 {info['joblib_sha256'][:12]}…) and {RF_JSON} from {source.name}")


if __name__ == "__main__":
    main()
