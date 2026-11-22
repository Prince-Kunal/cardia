"""Method A pieces on synthetic data, and the guarded model loader (no lab data needed)."""

import hashlib
import json
import os

import joblib
import numpy as np
import pytest
import sklearn
from sklearn.ensemble import RandomForestClassifier

from training.method_a_original import UnsafeModelFile, load_notebook_model
from ttc_pipeline import ModelFileError, normalise_lighting, tissue_mask
from ttc_pipeline.method_a import (
    FEATURE_NAMES,
    RF_JOBLIB,
    RF_JSON,
    ForestModel,
    apply_cut,
    masked_blur,
    method_a,
    pixel_features,
)
from ttc_pipeline.models import MANIFEST, sha256_file


def synthetic_slice(h=300, w=360):
    """Warm paper, a red disc (alive) with a cream patch (dead)."""
    yy, xx = np.mgrid[0:h, 0:w]
    img = np.zeros((h, w, 3)) + [225.0, 222.0, 215.0]
    disc = (yy - 150) ** 2 + (xx - 180) ** 2 < 90**2
    img[disc] = [170.0, 40.0, 50.0]
    cream = disc & ((yy - 150) ** 2 + (xx - 215) ** 2 < 30**2)
    img[cream] = [225.0, 205.0, 165.0]
    img += np.random.default_rng(7).normal(0, 1.0, img.shape)
    return np.clip(img, 0, 255).astype(np.uint8), cream


def test_masked_blur_keeps_the_paper_out_of_the_edge():
    x = np.zeros((40, 40), np.float32)
    m = np.zeros((40, 40), bool)
    m[10:30, 10:30] = True
    x[m] = 50.0
    out = masked_blur(x, m, 4)
    assert np.allclose(out[m], 50.0, atol=1e-3), "a uniform slice stays uniform up to its edge"


def test_pixel_features_are_the_22_in_order():
    img, _ = synthetic_slice()
    norm, paper = normalise_lighting(img)
    t = tissue_mask(norm, paper).tissue
    F = pixel_features(norm, t)
    assert F.shape == (int(t.sum()), 22) and F.dtype == np.float32 and len(FEATURE_NAMES) == 22
    assert np.isfinite(F).all()
    rim = F[:, FEATURE_NAMES.index("rim_dist")]
    assert rim.min() > 0 and rim.max() < 1


def test_apply_cut_is_the_identity_at_one_half_and_moves_the_cut_otherwise():
    p = np.linspace(0, 1, 101, dtype=np.float32)
    assert np.array_equal(apply_cut(p, 0.5), p)
    q = apply_cut(p, 0.3)
    assert np.array_equal(q >= 0.5, p >= 0.3) and np.all(np.diff(q) >= 0)


def small_forest(norm, tissue, cream):
    """A forest that learned cream = dead, red = alive on this synthetic slice."""
    F = pixel_features(norm, tissue)
    y = cream[tissue].astype(int)
    return RandomForestClassifier(n_estimators=10, random_state=0).fit(F, y)


def test_method_a_calls_cream_dead_and_red_alive():
    img, cream = synthetic_slice()
    norm, paper = normalise_lighting(img)
    t = tissue_mask(norm, paper).tissue
    model = ForestModel(small_forest(norm, t, cream), 0.5, {"model_version": "test"})
    a = method_a(norm, t, np.zeros_like(t), model)
    assert abs(a.dead_pct - 100 * cream[t].mean()) < 1.0
    assert np.isnan(a.p[~t]).all() and not np.isnan(a.p[t]).any()
    assert a.low_pct <= a.dead_pct <= a.high_pct and not a.many_unsure
    again = method_a(norm, t, np.zeros_like(t), model)
    assert np.array_equal(again.p[t], a.p[t])


def write_forest(models_dir, sklearn_version=None, features=None):
    rf = RandomForestClassifier(n_estimators=3, random_state=0).fit(
        np.random.default_rng(0).normal(size=(50, 22)), [0, 1] * 25
    )
    (models_dir / "kmeans_rf").mkdir(parents=True)
    joblib.dump(rf, models_dir / RF_JOBLIB)
    info = {
        "model_version": "test",
        "cut": 0.5,
        "features": features or FEATURE_NAMES,
        "sklearn_version": sklearn_version or sklearn.__version__,
    }
    (models_dir / RF_JSON).write_text(json.dumps(info))
    files = {rel: {"sha256": sha256_file(models_dir / rel)} for rel in (RF_JOBLIB, RF_JSON)}
    (models_dir / MANIFEST).write_text(json.dumps({"files": files}))


def test_the_forest_file_is_checked(tmp_path):
    write_forest(tmp_path / "ok")
    assert ForestModel.load(tmp_path / "ok").rf.n_jobs == 1, "predicts with one thread"
    write_forest(tmp_path / "old", sklearn_version="0.0.1")
    with pytest.raises(ModelFileError, match="scikit-learn"):
        ForestModel.load(tmp_path / "old")
    write_forest(tmp_path / "feat", features=FEATURE_NAMES[:-1])
    with pytest.raises(ModelFileError, match="features"):
        ForestModel.load(tmp_path / "feat")
    with open(tmp_path / "ok" / RF_JOBLIB, "ab") as f:
        f.write(b"\0")
    with pytest.raises(ModelFileError, match="Refusing"):
        ForestModel.load(tmp_path / "ok")


class _RunsACommand:
    def __reduce__(self):
        return (os.system, ("echo should-never-run",))


def test_the_guarded_loader_refuses_code_and_unknown_files(tmp_path):
    evil = tmp_path / "evil.joblib"
    joblib.dump({"rf": _RunsACommand()}, evil)
    evil_sha = hashlib.sha256(evil.read_bytes()).hexdigest()
    with pytest.raises(UnsafeModelFile, match="not on the allow-list"):
        load_notebook_model(evil, sha256=evil_sha)
    with pytest.raises(UnsafeModelFile, match="SHA-256"):
        load_notebook_model(evil)  # not the known notebook file
    fine = tmp_path / "fine.joblib"
    joblib.dump({"rf": RandomForestClassifier(n_estimators=2), "a": np.arange(3)}, fine)
    out = load_notebook_model(fine, sha256=hashlib.sha256(fine.read_bytes()).hexdigest())
    assert isinstance(out["rf"], RandomForestClassifier)
