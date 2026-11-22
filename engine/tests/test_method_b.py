"""Method B on synthetic photos and its cut-off file (no lab data needed)."""

import json

import cv2
import numpy as np
import pytest

from ttc_pipeline import ModelFileError
from ttc_pipeline.holes import Holes
from ttc_pipeline.method_b import A_CUT_JSON, ACuts, method_b, original_tissue_mask
from ttc_pipeline.models import MANIFEST, sha256_file


def synthetic_slice(h=300, w=360):
    """Warm paper, a red disc (alive) with a cream patch (dead) and a pink band (borderline)."""
    yy, xx = np.mgrid[0:h, 0:w]
    img = np.zeros((h, w, 3)) + [225.0, 222.0, 215.0]
    disc = (yy - 150) ** 2 + (xx - 180) ** 2 < 90**2
    img[disc] = [170.0, 40.0, 50.0]
    cream = disc & ((yy - 150) ** 2 + (xx - 215) ** 2 < 30**2)
    img[cream] = [225.0, 205.0, 165.0]
    pink = disc & (np.abs(yy - 90) < 6) & (np.abs(xx - 170) < 40)
    img[pink] = [215.0, 165.0, 150.0]
    img += np.random.default_rng(5).normal(0, 1.0, img.shape)
    return np.clip(img, 0, 255).astype(np.uint8), disc, cream, pink


NO_HOLES = Holes(removed=np.zeros((300, 360), bool), uncertain=np.zeros((300, 360), bool), candidates=None)
CUTS = ACuts(conservative=11.75, liberal=18.6, info={"model_version": "test"})


def test_the_outline_is_the_same_whatever_ran_before():
    img, disc, _, _ = synthetic_slice()
    first = original_tissue_mask(img)["tissue"]
    cv2.setRNGSeed(12345)  # disturb OpenCV's generator, as another slice's GrabCut would
    cv2.randu(np.empty((50, 50), np.float32), 0, 1)
    assert np.array_equal(original_tissue_mask(img)["tissue"], first)
    assert (first & disc).sum() / (first | disc).sum() > 0.97


def core(m):
    """The part of a region at least 3 px from its edge (edges blur into their neighbours)."""
    return m & ~cv2.dilate((~m).astype(np.uint8), np.ones((7, 7))).astype(bool)


def test_cream_is_dead_pink_is_borderline_red_is_alive():
    img, disc, cream, pink = synthetic_slice()
    b = method_b(img, NO_HOLES, CUTS)
    assert b.dead[core(cream)].all(), "cream tissue is dead"
    assert b.borderline[core(pink)].all(), "pale pink tissue is borderline"
    red = core(disc & ~cream & ~pink) & ~cv2.dilate((cream | pink).astype(np.uint8), np.ones((9, 9))).astype(bool)
    assert not (b.dead | b.borderline)[red].any(), "red tissue is alive"
    assert b.dead_pct <= b.high_pct and b.low_pct == b.dead_pct  # no uncertain holes here


def test_uncertain_holes_widen_the_range_and_removed_holes_leave_the_tissue():
    img, *_ = synthetic_slice()
    yy, xx = np.mgrid[0:300, 0:360]
    spot = (yy - 190) ** 2 + (xx - 140) ** 2 < 15**2  # in the red part
    uncertain = Holes(removed=np.zeros_like(spot), uncertain=spot, candidates=None)
    b = method_b(img, uncertain, CUTS)
    assert b.low_pct > b.dead_pct, "counted as holes, the alive spot leaves the tissue, so the dead share rises"
    removed = Holes(removed=spot, uncertain=np.zeros_like(spot), candidates=None)
    assert not method_b(img, removed, CUTS).tissue[spot].any()


def test_the_cut_file_is_checked_against_the_manifest(tmp_path):
    (tmp_path / "a_cut").mkdir()
    (tmp_path / A_CUT_JSON).write_text(json.dumps({"model_version": "t", "conservative": 11.75, "liberal": 18.6}))
    files = {A_CUT_JSON: {"sha256": sha256_file(tmp_path / A_CUT_JSON)}}
    (tmp_path / MANIFEST).write_text(json.dumps({"files": files}))
    cuts = ACuts.load(tmp_path)
    assert (cuts.conservative, cuts.liberal, cuts.version) == (11.75, 18.6, "t")
    (tmp_path / A_CUT_JSON).write_text(json.dumps({"model_version": "t", "conservative": 5.0, "liberal": 18.6}))
    with pytest.raises(ModelFileError, match="Refusing"):
        ACuts.load(tmp_path)
