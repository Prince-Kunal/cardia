"""Method B "stain ratio" (ttc_pipeline/method_b.py, training/calibrate_method_b.py)."""

import numpy as np
import pytest

from training.calibrate_method_b import edge_width, rule, study_od, tissue_od
from training.study import read_out
from ttc_pipeline import HoleModel, ModelFileError, parse_name
from ttc_pipeline.color import lin_to_srgb
from ttc_pipeline.method_b import (
    StainRatioModel,
    fill_edge,
    method_b,
    stain_and_tint,
    stain_maps,
    summarise_b,
)


@pytest.fixture(scope="module")
def model() -> StainRatioModel:
    try:
        return StainRatioModel.load()
    except ModelFileError as e:
        pytest.skip(f"no frozen Method B model: {e}")


def od_at(model, f):
    """OD of tissue holding a fraction f of the living stain (the model's own reference colours)."""
    cal = model.info["calibration"]
    u, s = np.array(cal["unstained_od"]), np.array(cal["stained_od"])
    return u + f * (s - u)


def verdict(model, od):
    s, t = stain_and_tint(np.asarray(od, np.float64))
    return bool(s < model.s_cut and t < model.tint_cut)


def test_less_than_half_the_living_stain_is_dead(model):
    for f in (0.0, 0.2, 0.4, 0.48):
        assert verdict(model, od_at(model, f)), f
    for f in (0.52, 0.6, 0.8, 1.0):
        assert not verdict(model, od_at(model, f)), f


def test_a_shadow_changes_neither_stain_nor_tint(model):
    for f in (0.1, 0.5, 0.9):
        od = od_at(model, f)
        for k in (0.125, 0.26, 0.5):  # 75%, 55%, 32% light
            assert np.allclose(stain_and_tint(od + k), stain_and_tint(od))


def test_whitish_pink_is_not_dead(model):
    """Pale and red-leaning (little blue absorbed): low stain, but on the red side of the tint cut."""
    od = np.array([0.02, 0.20, 0.22])  # linear light about 0.95, 0.63, 0.60: pale pink-white
    s, t = stain_and_tint(od)
    assert s < model.s_cut and t > model.tint_cut
    assert not verdict(model, od)


def test_the_cuts_are_ordered(model):
    assert model.s_low < model.s_cut < model.s_high
    assert model.tint_low < model.tint_cut < model.tint_high


def test_the_range_and_borderline(model):
    s = np.array([[0.1, model.s_low + 0.01, model.s_high - 0.001, 0.6]], np.float32)
    t = np.full_like(s, 20.0)
    tissue = np.ones_like(s, bool)
    b = summarise_b(s, t, tissue, np.zeros_like(tissue), model)
    assert b.dead.tolist() == [[True, True, False, False]]
    assert b.borderline.tolist() == [[False, True, True, False]]
    assert (b.low_pct, b.dead_pct, b.high_pct) == (25.0, 50.0, 75.0)


def synthetic_photo(model, f_inside, size=200, r=70, shade=None):
    """White paper with a round slice of tissue holding a fraction `f_inside` of the living stain; the
    outer 10 px of the slice paler (the edge effect). `shade`: multiply the slice's light by this."""
    yy, xx = np.mgrid[:size, :size]
    d = np.hypot(yy - size / 2, xx - size / 2)
    tissue = d < r
    lin = np.ones((size, size, 3), np.float32)
    lin[tissue] = 10 ** -od_at(model, f_inside)
    rim = tissue & (d > r - 10)
    lin[rim] = 0.5 * lin[rim] + 0.5  # half paper
    if shade is not None:
        lin[tissue] *= shade
    rgb = np.clip(np.round(lin_to_srgb(lin) * 255), 0, 255).astype(np.uint8)
    paper = d > r + 15
    return rgb, paper, tissue


def test_the_slice_edge_takes_the_colour_from_further_in(model):
    rgb, paper, tissue = synthetic_photo(model, 0.9)
    s, _ = stain_maps(rgb, paper, tissue, np.zeros_like(tissue), model.sigma, model.edge_px)
    assert np.nanmax(s) - np.nanmin(s) < 0.02  # the paler rim reads like the inside
    s0, _ = stain_maps(rgb, paper, tissue, np.zeros_like(tissue), model.sigma, 0)
    assert np.nanmin(s0) < np.nanmax(s0) - 0.1  # without the fill it does not
    assert fill_edge(np.ones((3, 3, 3)), np.zeros((3, 3), bool), np.zeros((3, 3), bool), 5).shape == (3, 3, 3)


@pytest.mark.parametrize("f, dead", [(0.2, True), (0.8, False)])
def test_whole_slices_and_their_shadows(model, f, dead):
    for shade in (None, 0.75, 0.55):
        rgb, paper, tissue = synthetic_photo(model, f, shade=shade)
        b = method_b(rgb, paper, tissue, np.zeros_like(tissue), np.zeros_like(tissue), model)
        assert b.dead_pct == pytest.approx(100.0 if dead else 0.0, abs=0.5), shade


def test_deterministic(model):
    rgb, paper, tissue = synthetic_photo(model, 0.45)
    a = method_b(rgb, paper, tissue, np.zeros_like(tissue), np.zeros_like(tissue), model)
    b = method_b(rgb, paper, tissue, np.zeros_like(tissue), np.zeros_like(tissue), model)
    assert np.array_equal(a.dead, b.dead) and a.dead_pct == b.dead_pct


# ---------- the frozen file against its recipe, on the study photos ----------


@pytest.fixture(scope="module")
def study_px(scans):
    raw = study_od(scans, HoleModel.load())
    edge_px, _, _ = edge_width(raw)
    return edge_px, tissue_od(raw, edge_px)


def test_the_frozen_file_matches_its_recipe(model, study_px):
    edge_px, px = study_px
    assert model.edge_px == edge_px
    r = rule(px, list(px))
    assert r["cuts"] == model.info["cuts"]
    assert model.info["recipe"]["labels_or_references_used"] is False


def test_the_cuts_hardly_move_with_any_heart_left_out(model):
    for h, cuts in model.info["calibration"]["leave_one_heart_out"].items():
        assert abs(cuts["dead"]["s"] - model.s_cut) < 0.015, h
        assert abs(cuts["dead"]["tint"] - model.tint_cut) < 1.0, h


def test_the_time_control_slices_against_yhs(model, study_px):
    """A record, not a target: no lab value set any cut. Guards against an unnoticed change."""
    _, px = study_px
    yhs = read_out("*InfSizeYHS.out")
    err = []
    for name, v in yhs.items():
        s, t = stain_and_tint(px[name])
        err.append(abs(100 * float(((s < model.s_cut) & (t < model.tint_cut)).mean()) - v))
    assert len(err) == 11 and np.mean(err) == pytest.approx(
        model.info["evidence"]["time_control_slices_mae_vs_yhs_pp"], abs=0.01
    )
    assert np.mean(err) < 6.5
    assert {parse_name(n)[0] for n in yhs} == {"109", "119", "129"}
