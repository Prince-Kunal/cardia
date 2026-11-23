"""Heart numbers from slice numbers (PLAN.md §2g)."""

import math

import pytest

from ttc_pipeline.heart import A_COLUMNS, B_COLUMNS, heart_numbers


def slice_row(weight, tissue, b_tissue, a_dead, b_dead):
    row = {"weight_mg": weight, "tissue_px": tissue, "b_tissue_px": b_tissue}
    row |= {c: a_dead for c in A_COLUMNS} | {c: b_dead for c in B_COLUMNS}
    return row


def test_slices_are_weighted_by_slice_weight():
    h = heart_numbers([slice_row(100.0, 1000, 900, 10.0, 20.0), slice_row(300.0, 5000, 4000, 30.0, 40.0)])
    assert h.weighting == "slice_weight" and h.flags == ()
    assert h.total_weight_mg == 400.0
    assert h.pct["a_dead_pct"] == pytest.approx((10 * 100 + 30 * 300) / 400)
    assert h.pct["b_dead_pct"] == pytest.approx((20 * 100 + 40 * 300) / 400)
    assert h.a_dead_mg == pytest.approx(0.10 * 100 + 0.30 * 300)
    assert h.b_dead_mg == pytest.approx(h.pct["b_dead_pct"] / 100 * 400)


def test_a_missing_weight_switches_every_slice_to_its_tissue_area():
    h = heart_numbers([slice_row(None, 1000, 3000, 10.0, 20.0), slice_row(300.0, 3000, 1000, 30.0, 40.0)])
    assert h.weighting == "tissue_area" and h.flags == ("weights_missing",)
    assert h.total_weight_mg is None and h.a_dead_mg is None and h.b_dead_mg is None
    assert h.pct["a_dead_pct"] == pytest.approx((10 * 1000 + 30 * 3000) / 4000)  # Method A's tissue
    assert h.pct["b_dead_pct"] == pytest.approx((20 * 3000 + 40 * 1000) / 4000)  # Method B's own tissue


def test_a_slice_without_tissue_is_left_out():
    h = heart_numbers([slice_row(100.0, 0, 0, math.nan, math.nan), slice_row(300.0, 3000, 1000, 30.0, 40.0)])
    assert h.pct["a_dead_pct"] == pytest.approx(30.0)
    assert h.a_dead_mg == pytest.approx(90.0)
    assert heart_numbers([slice_row(100.0, 0, 0, math.nan, math.nan)]).pct["a_dead_pct"] is None


def test_a_heart_needs_a_slice():
    with pytest.raises(ValueError, match="at least one"):
        heart_numbers([])
