"""Method A on the 30 study slices (PLAN.md §2e, §8). Skips without the data, the hole outlines and the
notebook's saved results.

* The engine's forest is the notebook's frozen forest, exported unchanged and byte-reproducibly.
* The notebook's app path (its front end and all-hearts hole model, then the frozen forest) gives exactly
  the results it printed for 108IS132, 109IS104 and 207IS110.
* The training recipe comes close to the notebook, but not exactly: K-Means float32 sums depend on the
  CPU and thread count, and the notebook's held-out run shared a generator across labellers in an order
  that changed between Python processes (training/method_a.py).
"""

import numpy as np
import pandas as pd
import pytest

from training.export_method_a import main as export_forest
from training.holes import fit_hole_model
from training.method_a import fit_k_means_rf, loho_probabilities
from training.method_a_original import SOURCE, load_notebook_model
from training.notebook_holes import FEATURES_4, notebook_candidates
from training.study import REPO
from ttc_pipeline import HoleModel, ModelFileError, read_rgb, run_front_end
from ttc_pipeline.method_a import RF_JOBLIB, ForestModel, method_a, pixel_features
from ttc_pipeline.models import read_manifest

SLICE_PCT = REPO / "reference" / "results_local" / "slice_infarct_pct.csv"
# Printed by the notebook with its final model: Step 69 (108IS132) and Part O (109IS104, 207IS110).
# (infarct %, tissue px, holes removed % of slice, unsure %); None = not printed.
NOTEBOOK_PRINTED = {
    "108IS132mg.tif": (13.56, 134940, None, None),
    "109IS104mg.tif": (7.72, 116264, 0.00, 1.1),
    "207IS110mg.tif": (86.71, 180866, 1.71, 1.3),
}


@pytest.fixture(scope="module")
def notebook_model():
    if not SOURCE.exists():
        pytest.skip("needs reference/results_local/final_model_K_Means_RF.joblib")
    model = load_notebook_model()
    model["rf"].n_jobs = 1
    return model


@pytest.fixture(scope="module")
def features(study, notebook_tissue):
    """Each slice's 22 features on the notebook's tissue masks, as the forest was trained (study order)."""
    return [pixel_features(s.norm, notebook_tissue[s.name]) for s in study.values()]


def test_the_engine_forest_is_the_notebook_forest(notebook_model, features, tmp_path):
    try:
        forest = ForestModel.load()
    except ModelFileError as e:
        pytest.skip(f"no exported forest on this machine: {e}")
    for f in features:
        assert np.array_equal(
            forest.dead_probability(f), notebook_model["rf"].predict_proba(f)[:, 1].astype(np.float32)
        )
    export_forest(models_dir=tmp_path)
    assert read_manifest(tmp_path)["files"][RF_JOBLIB]["sha256"] == read_manifest()["files"][RF_JOBLIB]["sha256"]


def test_the_notebook_app_path_gives_its_printed_results(study, notebook_cs, notebook_model):
    nb_hole_model = fit_hole_model(notebook_cs.table, FEATURES_4)  # the notebook's HOLE_MODEL (all hearts)
    for name, (pct, tissue_px, holes_pct, unsure) in NOTEBOOK_PRINTED.items():
        s = study[name]
        lab, cands = notebook_candidates(s.norm, s.tm.tissue, s.paper)
        keep = cands.label[nb_hole_model.predict_proba(cands[FEATURES_4].values)[:, 1] >= 0.8] if len(cands) else []
        holes = np.isin(lab, list(keep)) & s.tm.tissue
        tissue = s.tm.tissue & ~holes
        p = notebook_model["rf"].predict_proba(pixel_features(s.norm, tissue))[:, 1].astype(np.float32)
        assert int(tissue.sum()) == tissue_px, name
        assert round(100 * float((p >= 0.5).mean()), 2) == pct, name
        if holes_pct is not None:
            assert round(100 * holes.sum() / (tissue.sum() + holes.sum()), 2) == holes_pct, name
            assert round(100 * float(((p > 0.35) & (p < 0.65)).mean()), 1) == unsure, name


def test_the_training_recipe_comes_close_to_the_notebook(study, features, notebook_model):
    if not SLICE_PCT.exists():
        pytest.skip("needs reference/results_local/slice_infarct_pct.csv")
    labeller, _ = fit_k_means_rf(features, list(range(len(features))))
    assert np.abs(labeller.km.cluster_centers_ - notebook_model["labeller"].km.cluster_centers_).max() < 1e-3
    held_out = loho_probabilities(features, [s.heart for s in study.values()])
    notebook = pd.read_csv(SLICE_PCT).set_index("file")["K-Means + RF"]
    # the notebook kept its held-out probabilities as float16
    ours = [
        100 * float((held_out[i].astype(np.float16).astype(np.float32) >= 0.5).mean()) for i in range(len(features))
    ]
    diff = np.abs(np.array(ours) - notebook.loc[list(study)].to_numpy())
    assert diff.mean() < 0.25 and diff.max() < 1.0, (diff.mean(), diff.max())


def test_method_a_on_a_scan_is_bit_identical_twice(scans):
    try:
        hole_model, forest = HoleModel.load(), ForestModel.load()
    except ModelFileError as e:
        pytest.skip(f"no frozen models on this machine: {e}")
    fe = run_front_end(read_rgb(scans["207IS110mg.tif"]), hole_model)
    first = method_a(fe.norm, fe.tissue, fe.holes.uncertain, forest)
    second = method_a(fe.norm, fe.tissue, fe.holes.uncertain, forest)
    assert np.array_equal(first.p, second.p, equal_nan=True) and first.dead_pct == second.dead_pct
