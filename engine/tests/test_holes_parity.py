"""Holes on the 30 study slices: the notebook port is exact, and the shipped hole file is the one Phase 0 chose.

Needs the study scans, the hand-marked outlines and (for the first test) the notebook's saved
masks; skips without them.
"""

import json

import joblib
import numpy as np
import pytest
from PIL import Image

from training.holes import build_candidates, choose_features, fit_hole_model, held_out_summary, load_labels, loho_scores
from training.notebook_holes import FEATURES_4, notebook_candidates
from ttc_pipeline import HoleModel, ModelFileError
from ttc_pipeline.holes import FEATURES, decide_holes
from ttc_pipeline.models import HOLE_MODEL_JSON, MODELS_DIR, read_manifest, sha256_file


@pytest.fixture(scope="module")
def slices(study, hole_labels):
    return list(study.values())


@pytest.fixture(scope="module")
def labels(hole_labels):
    return load_labels(hole_labels)[0]


@pytest.fixture(scope="module")
def shipped(slices, labels):
    return build_candidates(slices, labels)


def test_notebook_hole_decisions_reproduce_its_masks(slices, labels, reference_masks):
    """Notebook Steps 20-22, held out per heart, give its saved tissue masks on all 30 slices."""
    cs = build_candidates(slices, labels, candidates_fn=notebook_candidates)
    features, scores = choose_features(cs.table)
    assert features == FEATURES_4, "the notebook kept flatness"
    held_out = scores["4 measures"]
    for i, s in enumerate(slices):
        rows = (cs.table.slice == i).values
        tissue = s.tm.tissue
        if rows.any():
            holes = decide_holes(cs.labels[s.name], cs.table[rows], held_out[rows].values, tissue, 0.8, 0.5)
            tissue = tissue & ~holes.removed
        ref = np.asarray(Image.open(reference_masks / f"{s.name[:-4]}_tissue.png")) > 0
        assert np.array_equal(tissue, ref), f"{s.name}: {(tissue ^ ref).sum()} px differ"


def test_shipped_recipe_held_out_matches_the_model_file(slices, labels, shipped):
    """The held-out numbers recorded in hole_model.json (the Phase 0 evidence) are what the code gives."""
    info = json.loads((MODELS_DIR / HOLE_MODEL_JSON).read_text())
    summary = held_out_summary(shipped, loho_scores(shipped.table, FEATURES), slices, labels)
    assert summary == info["held_out"]
    assert (summary["holes_found"], summary["false_holes"]) == (5, 2)


def test_the_frozen_hole_model_is_reproducible(shipped, tmp_path):
    """Retraining from the labels gives a byte-identical file to the one in the manifest."""
    try:
        model = HoleModel.load()
    except ModelFileError as e:
        pytest.skip(f"no frozen hole model on this machine: {e}")
    fresh = fit_hole_model(shipped.table, FEATURES)
    joblib.dump(fresh, tmp_path / "hole_model.joblib")
    assert sha256_file(tmp_path / "hole_model.joblib") == read_manifest()["files"]["holes/hole_model.joblib"]["sha256"]
    X = shipped.table[FEATURES]
    assert np.array_equal(model.score(X), fresh.predict_proba(X.values)[:, 1])
