"""Method B "DBSCAN + RF" (ttc_pipeline/method_b.py, training/method_b.py, training/export_method_b.py)."""

import numpy as np
import pytest

from training.export_method_b import NOTEBOOK_BEST
from training.method_b import DEAD, IGN, LIVE, DBSCANTuned
from ttc_pipeline import ModelFileError, load_dbscan_forest
from ttc_pipeline.method_a import FEATURE_NAMES, UNSURE, summarise_a
from ttc_pipeline.method_b import method_b


@pytest.fixture(scope="module")
def model():
    try:
        return load_dbscan_forest()
    except ModelFileError as e:
        pytest.skip(f"no frozen Method B model: {e}")


def test_the_frozen_forest_is_the_notebooks_recipe(model):
    info = model.info
    assert info["features"] == FEATURE_NAMES and info["dead_class"] == 1
    # The tuning picked the notebook's own settings (dbscan_search notebook, Step 37 on all 8 hearts).
    assert info["dbscan"]["same_as_notebook"] is True
    d = info["dbscan"]
    assert (d["colour_scale"], d["eps_percentile"], d["min_points"], d["groups"]) == ("s1", 2, 40, "extremes")
    assert (d["matching"], d["example_rule"], d["cut"]) == ("group centre", "margin 0.6", 0.5)
    roles = [g["role"] for g in d["groups_found"]]
    assert roles.count("dead") == 1 and roles.count("alive") == 1
    assert info["forest"]["n_estimators"] == 150 and info["forest"]["min_samples_leaf"] == 10
    assert set(info["leave_one_heart_out"]) == {"108", "109", "119", "129", "206", "207", "208", "210"}


def test_method_b_reads_slices_as_method_a_does(model):
    """Same summary as Method A: dead at p >= 0.5, unsure 0.35 < p < 0.65, on the same tissue."""
    rng = np.random.default_rng(0)
    tissue = np.zeros((40, 40), bool)
    tissue[5:35, 5:35] = True
    features = rng.normal(size=(int(tissue.sum()), len(FEATURE_NAMES))).astype(np.float32)
    b = method_b(None, tissue, np.zeros_like(tissue), model, features)
    want = summarise_a(model.dead_probability(features), tissue, np.zeros_like(tissue))
    assert b.dead_pct == want.dead_pct and np.array_equal(b.dead, want.dead)
    assert np.isnan(b.p[~tissue]).all() and ((b.p[tissue] >= 0) & (b.p[tissue] <= 1)).all()
    assert b.unsure_pct == pytest.approx(100 * float(((b.p > UNSURE[0]) & (b.p < UNSURE[1]))[tissue].mean()))


def test_the_palest_dense_group_teaches_dead_and_the_reddest_alive():
    """Two dense colour crowds (L*, a*, b*): cream and red. DBSCAN finds them; the labeller names them."""
    rng = np.random.default_rng(1)
    cream = rng.normal([85, 6, 19], 0.6, size=(3000, 3))
    red = rng.normal([50, 32, 20], 0.6, size=(3000, 3))
    X = np.vstack([cream, red]).astype(np.float32)
    L = DBSCANTuned(**{**NOTEBOOK_BEST, "q": 10}).fit(X)
    assert L.ok and L.n_groups == 2
    y = L.label(np.array([[85, 6, 19], [50, 32, 20], [67.5, 19, 19.5]], np.float32))
    assert y[0] == DEAD and y[1] == LIVE and y[2] == IGN  # halfway between: no example (margin 0.6)
