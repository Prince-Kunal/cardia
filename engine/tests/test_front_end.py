"""Shared front end on synthetic photos: needs no lab data, so it runs on every machine and in CI."""

import numpy as np
import pytest
from scipy import ndimage as ndi

from ttc_pipeline import normalise_lighting, parse_name, tissue_mask
from ttc_pipeline.color import lin_to_srgb, srgb_to_lin


def synthetic_slice(h=300, w=360, seed=1):
    """Grey paper lit unevenly from the left, a darker grid line, and a red disc with a cream patch."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w]
    light = 0.75 + 0.25 * xx / w  # brighter towards the right
    img = np.empty((h, w, 3), np.float64)
    paper = np.array([225.0, 222.0, 215.0])  # slightly warm paper
    img[:] = paper
    img[58:61] = 0.75 * paper  # a printed grid line: darker, same tint as the paper
    disc = (yy - 150) ** 2 + (xx - 180) ** 2 < 80**2
    img[disc] = [170.0, 40.0, 50.0]  # living tissue: red
    cream = disc & ((yy - 150) ** 2 + (xx - 210) ** 2 < 30**2)
    img[cream] = [225.0, 200.0, 160.0]  # dead tissue: cream
    img = img * light[..., None] + rng.normal(0, 1.5, img.shape)
    return np.clip(img, 0, 255).astype(np.uint8), disc


def test_colour_round_trip():
    x = np.arange(256, dtype=np.uint8)
    back = (lin_to_srgb(srgb_to_lin(x)) * 255 + 0.5).astype(np.uint8)
    assert np.array_equal(back, x)


def test_lighting_makes_the_paper_even_and_neutral():
    img, disc = synthetic_slice()
    norm, paper = normalise_lighting(img)
    assert not (paper & disc).any(), "the paper mask must not touch the tissue"
    # The darkest 35% of the paper (here the dim left side) is left out of the fit, but the
    # fitted surface still evens it out. Check all bare paper, away from the tissue and grid line.
    background = np.ones(disc.shape, bool)
    background[40:270, 90:280] = False
    background[55:64] = False
    target = 255 * lin_to_srgb(np.float64(0.88))  # paper is set to 0.88 in linear light
    for side in (norm[:, :60][background[:, :60]], norm[:, -60:][background[:, -60:]]):
        assert np.abs(np.median(side, 0) - target).max() <= 2, "paper should be the same neutral grey on both sides"


def test_tissue_mask_finds_the_disc_and_not_the_grid():
    img, disc = synthetic_slice()
    norm, paper = normalise_lighting(img)
    tm = tissue_mask(norm, paper)
    assert not (disc & ~tm.tissue).any(), "all of the disc is tissue, including the pale cream patch"
    near_disc = ndi.binary_dilation(disc, iterations=2)  # the 5x5 chroma blur widens a sharp edge by 1-2 px
    assert not (tm.tissue & ~near_disc).any(), "nothing beyond the disc's edge is tissue (paper, grid line)"
    assert tm.threshold >= 5.5


def test_same_photo_twice_is_bit_identical():
    img, _ = synthetic_slice()
    n1, p1 = normalise_lighting(img)
    n2, p2 = normalise_lighting(img.copy())
    assert np.array_equal(n1, n2) and np.array_equal(p1, p2)
    t1, t2 = tissue_mask(n1, p1), tissue_mask(n2, p2)
    assert np.array_equal(t1.tissue, t2.tissue) and t1.threshold == t2.threshold


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("109IS104mg.tif", ("109", 104.0)),
        ("206IS89.5mg.TIF", ("206", 89.5)),
        ("scan_207IS110mg.png", ("207", 110.0)),
        ("my slice.jpg", ("my slice", None)),
        ("206IS1.2.3mg.tif", ("206", None)),  # a heart ID, but no readable weight
    ],
)
def test_parse_name(name, expected):
    assert parse_name(name) == expected
