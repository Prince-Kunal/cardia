"""Train the shared hole model and write models/holes/hole_model.{joblib,json} and the manifest entries.

One-time and offline (PLAN.md D5): run it only when the labels, the candidate recipe or its settings
change, and bump MODEL_VERSION when you do. The .joblib is derived from GVSU data and stays out of
git (team Drive); the .json and models/manifest.json are committed.

    cd engine && uv run python -m training.train_hole_model
"""

import datetime
import json

import joblib
import numpy as np
import sklearn

from ttc_pipeline import PIPELINE_VERSION
from ttc_pipeline.config import CFG
from ttc_pipeline.holes import FEATURES
from ttc_pipeline.models import HOLE_MODEL_JOBLIB, HOLE_MODEL_JSON, MANIFEST, MODELS_DIR, read_manifest, sha256_file

from .holes import ENGINE, LABELS_PATH, build_candidates, fit_hole_model, held_out_summary, load_labels, loho_scores
from .study import study_slices

MODEL_VERSION = "1.0.0"
RECIPE = (
    "Research repo ttc/hole_regions.py (2026-11-18) candidates and measures, on the shared front end "
    "(notebook lighting correction and tissue mask). Chosen in Phase 0 on 2026-11-20 (PLAN.md §2d)."
)


def write_json(path, obj):
    path.write_text(json.dumps(obj, indent=2) + "\n")


def main(models_dir=MODELS_DIR):
    labels, labels_sha = load_labels()
    slices = study_slices()
    assert len(slices) == 30, f"expected the 30 study slices in data/, found {len(slices)}"
    cs = build_candidates(slices, labels)
    held_out = held_out_summary(cs, loho_scores(cs.table, FEATURES), slices, labels)
    model = fit_hole_model(cs.table, FEATURES)

    out = models_dir / "holes"
    out.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, models_dir / HOLE_MODEL_JOBLIB)
    joblib_sha = sha256_file(models_dir / HOLE_MODEL_JOBLIB)
    info = {
        "model": "hole_model",
        "model_version": MODEL_VERSION,
        "trained": datetime.date.today().isoformat(),
        "pipeline_version": PIPELINE_VERSION,
        "recipe": RECIPE,
        "features": FEATURES,
        "cut": CFG["holes"]["score_cut"],
        "uncertain_from": CFG["holes"]["uncertain_from"],
        "candidate_settings": CFG["holes"],
        "training_labels": {
            "file": str(LABELS_PATH.relative_to(ENGINE)),
            "sha256": labels_sha,
            "holes": cs.n_holes,
            "slices_with_holes": len(labels),
            "candidates": len(cs.table),
            "candidates_matching_a_hole": int(cs.table.is_hole.sum()),
        },
        "held_out": held_out,
        "sklearn_version": sklearn.__version__,
        "numpy_version": np.__version__,
        "joblib_sha256": joblib_sha,
    }
    write_json(models_dir / HOLE_MODEL_JSON, info)

    files = read_manifest(models_dir)["files"]
    files[HOLE_MODEL_JOBLIB] = {"sha256": joblib_sha, "model_version": MODEL_VERSION, "in_git": False}
    files[HOLE_MODEL_JSON] = {"sha256": sha256_file(models_dir / HOLE_MODEL_JSON), "model_version": MODEL_VERSION}
    manifest = {
        "description": "Every model file the engine loads, with its SHA-256. "
        "The engine refuses a file that is missing or differs. Files with in_git false come from the team Drive.",
        "files": dict(sorted(files.items())),
    }
    write_json(models_dir / MANIFEST, manifest)

    print(f"Hole model {MODEL_VERSION}: {', '.join(FEATURES)}; trained on {len(cs.table)} candidates.")
    print("Held out:", json.dumps(held_out))
    print(f"Wrote {HOLE_MODEL_JOBLIB} (sha256 {joblib_sha[:12]}…), {HOLE_MODEL_JSON} and {MANIFEST} in {models_dir}")


if __name__ == "__main__":
    main()
