"""Hole candidates, hole decisions and the model-file guard, on synthetic data (no lab data needed)."""

import json
from types import SimpleNamespace

import joblib
import numpy as np
import pandas as pd
import pytest
import sklearn
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from ttc_pipeline import HoleModel, ModelFileError, run_front_end
from ttc_pipeline.config import CFG
from ttc_pipeline.holes import FEATURES, decide_holes, hole_candidates
from ttc_pipeline.lighting import normalise_lighting
from ttc_pipeline.models import HOLE_MODEL_JOBLIB, HOLE_MODEL_JSON, MANIFEST, sha256_file
from ttc_pipeline.tissue import tissue_mask

PAPER = np.array([225.0, 222.0, 215.0])
HOLE = np.array([120.0, 85.0, 72.0])  # darker paper, tinted warm by light bounced off the tissue


def slice_with_holes(h=320, w=380):
    """A red slice with a sharp-walled hole showing darker paper, and a dark spot too small to count."""
    yy, xx = np.mgrid[0:h, 0:w]
    img = np.zeros((h, w, 3)) + PAPER
    disc = (yy - 160) ** 2 + (xx - 190) ** 2 < 120**2
    img[disc] = [170.0, 40.0, 50.0]
    hole = (yy - 140) ** 2 + (xx - 160) ** 2 < 22**2  # ~1500 px
    img[hole] = HOLE  # paper seen through the slice
    speck = (yy - 220) ** 2 + (xx - 250) ** 2 < 6**2  # ~110 px, under the 200-px minimum
    img[speck] = HOLE
    img += np.random.default_rng(3).normal(0, 1.0, img.shape)
    return np.clip(img, 0, 255).astype(np.uint8), disc, hole, speck


@pytest.fixture(scope="module")
def synthetic():
    img, disc, hole, speck = slice_with_holes()
    norm, paper = normalise_lighting(img)
    tm = tissue_mask(norm, paper)
    return img, norm, paper, tm, disc, hole, speck


def test_the_hole_is_a_candidate_and_the_speck_is_not(synthetic):
    _, norm, paper, tm, _, hole, speck = synthetic
    lab, cands = hole_candidates(norm, tm.tissue, paper)
    assert len(cands) == 1, cands
    cand = lab == cands.label.iloc[0]
    assert (cand & hole).sum() / hole.sum() > 0.85 and not (cand & speck).any()
    row = cands.iloc[0]
    assert row.contrast > 40, "much darker than the tissue around it"
    assert row.edge_vs_inside > 2, "sharp wall, flat floor"
    assert 40 <= row.thickness <= 46, "about the hole's 44-px diameter"
    assert set(lab[lab > 0].ravel()) == set(cands.label), "the label image holds only the listed candidates"


def test_decide_holes_uses_the_cut_and_the_uncertain_band():
    lab = np.zeros((10, 10), int)
    lab[0:2, 0:2], lab[4:6, 4:6], lab[8:10, 8:10] = 1, 2, 3
    tissue = np.ones((10, 10), bool)
    cands = pd.DataFrame({"label": [1, 2, 3]})
    holes = decide_holes(lab, cands, [0.9, 0.6, 0.2], tissue, cut=0.8, uncertain_from=0.5)
    assert np.array_equal(holes.removed, lab == 1)
    assert np.array_equal(holes.uncertain, lab == 2)
    assert list(holes.candidates.score) == [0.9, 0.6, 0.2]


def test_run_front_end_removes_what_the_model_calls_a_hole(synthetic):
    img, *_, hole, _ = synthetic
    always_hole = SimpleNamespace(score=lambda c: np.ones(len(c)), cut=0.8, uncertain_from=0.5)
    fe = run_front_end(img, always_hole)
    assert np.array_equal(fe.tissue, fe.tissue_before_holes & ~fe.holes.removed)
    assert (fe.holes.removed & hole).sum() / hole.sum() > 0.85
    never_hole = SimpleNamespace(score=lambda c: np.zeros(len(c)), cut=0.8, uncertain_from=0.5)
    assert np.array_equal(run_front_end(img, never_hole).tissue, fe.tissue_before_holes)


# ---------- the model-file guard ----------


def write_model_files(models_dir, sklearn_version=None, settings=None):
    """A small hole model in the engine's file format, with a matching manifest."""
    rng = np.random.default_rng(0)
    X = rng.normal(size=(40, 3))
    y = (X[:, 0] > 0).astype(int)
    pipeline = make_pipeline(StandardScaler(), LogisticRegression()).fit(X, y)
    (models_dir / "holes").mkdir(parents=True)
    joblib.dump(pipeline, models_dir / HOLE_MODEL_JOBLIB)
    info = {
        "model_version": "test",
        "features": FEATURES,
        "cut": 0.8,
        "uncertain_from": 0.5,
        "candidate_settings": settings or CFG["holes"],
        "sklearn_version": sklearn_version or sklearn.__version__,
    }
    (models_dir / HOLE_MODEL_JSON).write_text(json.dumps(info))
    files = {rel: {"sha256": sha256_file(models_dir / rel)} for rel in (HOLE_MODEL_JOBLIB, HOLE_MODEL_JSON)}
    (models_dir / MANIFEST).write_text(json.dumps({"files": files}))
    return pipeline, X


def test_a_listed_unchanged_model_loads_and_scores(tmp_path):
    pipeline, X = write_model_files(tmp_path)
    model = HoleModel.load(tmp_path)
    cands = pd.DataFrame(X, columns=FEATURES)
    # Same input array on both sides: a column-major copy of X can differ in the last bit on some BLAS builds.
    assert np.array_equal(model.score(cands), pipeline.predict_proba(cands[FEATURES].values)[:, 1])
    assert (model.cut, model.uncertain_from, model.version) == (0.8, 0.5, "test")


def test_a_changed_model_file_is_refused(tmp_path):
    write_model_files(tmp_path)
    with open(tmp_path / HOLE_MODEL_JOBLIB, "ab") as f:
        f.write(b"\0")
    with pytest.raises(ModelFileError, match="Refusing"):
        HoleModel.load(tmp_path)


def test_a_missing_or_unlisted_model_file_is_refused(tmp_path):
    write_model_files(tmp_path)
    (tmp_path / HOLE_MODEL_JOBLIB).unlink()
    with pytest.raises(ModelFileError, match="missing"):
        HoleModel.load(tmp_path)
    with pytest.raises(ModelFileError, match="not listed"):
        HoleModel.load(tmp_path / "empty")


def test_a_model_for_another_environment_or_recipe_is_refused(tmp_path):
    write_model_files(tmp_path / "a", sklearn_version="0.0.1")
    with pytest.raises(ModelFileError, match="scikit-learn"):
        HoleModel.load(tmp_path / "a")
    write_model_files(tmp_path / "b", settings={**CFG["holes"], "min_px": 150})
    with pytest.raises(ModelFileError, match="candidate settings"):
        HoleModel.load(tmp_path / "b")
