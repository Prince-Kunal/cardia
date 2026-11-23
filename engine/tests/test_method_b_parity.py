"""Method B on the 30 study slices: the port reproduces the research repo exactly, and the shipped
cut-off file is what the recipe gives (PLAN.md §2f, §8). Skips without the data and the repo's outputs.
"""

import json

import numpy as np
import pandas as pd
import pytest

from training.calibrate_method_b import engine_calibrations, repo_calibration
from training.method_b import read_out
from training.study import REPO
from ttc_pipeline import HoleModel, ModelFileError, read_rgb, run_front_end
from ttc_pipeline.method_b import A_CUT_JSON, ACuts, method_b
from ttc_pipeline.models import MODELS_DIR

REPO_OUTPUTS = REPO / "reference" / "research-repo" / "outputs"


@pytest.fixture(scope="module")
def yhs(scans):
    values = read_out("*InfSizeYHS.out")
    if len(values) != 11:
        pytest.skip(f"needs the 3 *InfSizeYHS.out files in data/ (found {len(values)} slices)")
    return values


@pytest.fixture(scope="module")
def repo_outputs():
    files = REPO_OUTPUTS / "measurements.csv", REPO_OUTPUTS / "final" / "per_slice.csv"
    if not all(f.exists() for f in files):
        pytest.skip(
            "needs reference/research-repo/outputs: git clone https://github.com/Prince-Kunal/infarct-algorithms"
        )
    return [pd.read_csv(f) for f in files]


@pytest.fixture(scope="module")
def repo_run(scans, yhs):
    return repo_calibration(scans, yhs)


def test_original_front_end_reproduces_measure_py(repo_run, repo_outputs):
    """measure.py's tissue areas and both infarct % (cuts 11.75 / 18.66), exactly, on all 30 slices."""
    from ttc_pipeline.method_b import smoothed_a

    _, run = repo_run
    measured = repo_outputs[0].set_index("file")
    for name, (wb, tissue) in run.items():
        a = smoothed_a(wb)
        n = max(int(tissue.sum()), 1)
        row = measured.loc[name]
        assert int(tissue.sum()) == row.tissue_area_px, name
        assert 100.0 * (tissue & (a < 11.75)).sum() / n == row.infarct_pct_conservative, name
        assert 100.0 * (tissue & (a < 18.66)).sum() / n == row.infarct_pct_liberal, name


def test_recipe_reproduces_the_repo_cuts(repo_run, repo_outputs):
    cal, _ = repo_run
    assert (cal.conservative, cal.liberal) == (11.75, 18.66)
    assert cal.loho_cuts == {"109": 11.75, "119": 12.0, "129": 9.25}
    per_slice = repo_outputs[1].set_index("stem")
    for name, value in cal.loho_pct.items():
        assert value == per_slice.loc[name[:-4], "final_pct"], name
    assert round(cal.mae_vs_yhs, 1) == 2.4


def test_the_shipped_cut_file_is_what_the_recipe_gives(scans, yhs, on_reference_platform):
    try:
        hole_model = HoleModel.load()
    except ModelFileError as e:
        pytest.skip(f"no frozen hole model on this machine: {e}")
    shared, original = engine_calibrations(scans, yhs, hole_model)
    info = json.loads((MODELS_DIR / A_CUT_JSON).read_text())
    assert not shared.passes, "the shared front end failed the 2.9 pp rule, so Method B keeps its own"
    assert (info["conservative"], info["liberal"]) == (11.75, 18.6)
    assert info["calibration"]["time_control_loho_cuts"] == original.loho_cuts  # a grid: the same everywhere
    if on_reference_platform:
        assert (original.conservative, original.liberal) == (11.75, 18.6)
        assert info["calibration"]["time_control_mae_vs_yhs_pp"] == round(original.mae_vs_yhs, 3)
        assert info["shared_front_end_trial"]["time_control_mae_vs_yhs_pp"] == round(shared.mae_vs_yhs, 3)
    else:  # the liberal cut is a GMM valley; another platform's linear algebra moves it by ~0.01 (Linux: 18.587)
        assert original.conservative == 11.75 and abs(original.liberal_exact - 18.6) <= 0.05
        assert abs(info["calibration"]["time_control_mae_vs_yhs_pp"] - original.mae_vs_yhs) < 0.01
        assert abs(info["shared_front_end_trial"]["time_control_mae_vs_yhs_pp"] - shared.mae_vs_yhs) < 0.01


def test_method_b_on_a_scan_is_bit_identical_twice(scans):
    try:
        hole_model, cuts = HoleModel.load(), ACuts.load()
    except ModelFileError as e:
        pytest.skip(f"no frozen models on this machine: {e}")
    rgb = read_rgb(scans["207IS143mg.tif"])
    fe = run_front_end(rgb, hole_model)
    first, second = method_b(rgb, fe.holes, cuts), method_b(rgb, fe.holes, cuts)
    assert np.array_equal(first.dead, second.dead) and np.array_equal(first.tissue, second.tissue)
    assert first.dead_pct == second.dead_pct
