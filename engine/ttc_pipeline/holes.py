"""Real holes: heart chambers cut through, where the paper shows.

Holes are tinted by light bouncing off the tissue, so the tissue mask counts them as tissue
(mostly as living tissue, since they are dark). A net of dark candidate regions is measured, and
the shared hole model (`models/holes/`) scores each one from 0 (crease) to 1 (hole).

Recipe: the research repo's `ttc/hole_regions.py` (2026-11-18), run on the shared front end. Phase 0
chose it over the notebook's version (Steps 20-22) on 2026-11-20: same holes found (5 of 10 held
out), half the false holes (2 vs 4). See PLAN.md §2d and `training/compare_hole_versions.py`.
"""

from dataclasses import dataclass

import cv2
import numpy as np
import pandas as pd
from scipy import ndimage as ndi
from skimage import color, measure, morphology

from .config import CFG

FEATURES = ["edge_vs_inside", "contrast", "thickness"]
CANDIDATE_COLUMNS = ["label", "area_px", "x", "y", *FEATURES]


def hole_candidates(norm_img, tissue, paper=None):
    """Dark regions inside the slice that might be holes, with the measurements used to judge them.

    A candidate lies inside the filled slice outline, more than 6 px from its edge, and is either
    "darker paper" (V = max(R, G, B) < 145, G/R > 0.5, B/G < 0.95: paper seen through the slice)
    or "very dark" (L* < 32: a shadowed hole); after opening, closing and filling, it has >= 200 px.
    `tissue` is the tissue mask before hole removal. Returns (label image, one row per candidate).
    `paper` is unused: the brightness cut is fixed because the lighting correction already sets the paper.
    """
    H = CFG["holes"]
    wb = cv2.GaussianBlur(norm_img.astype(np.float32), (0, 0), 1.5)
    V = wb.max(2)
    g_r = wb[..., 1] / np.maximum(wb[..., 0], 1)
    b_g = wb[..., 2] / np.maximum(wb[..., 1], 1)
    Ls = cv2.GaussianBlur(color.rgb2lab(norm_img)[..., 0].astype(np.float32), (0, 0), 1.5)
    outline = ndi.binary_fill_holes(tissue)
    depth = ndi.distance_transform_edt(outline)
    darker_paper = (V < H["v_max"]) & (g_r > H["g_r"]) & (b_g < H["b_g"])
    m = (depth > H["edge_margin_px"]) & (darker_paper | (Ls < H["dark_L"]))
    m = morphology.closing(morphology.opening(m, morphology.disk(2)), morphology.disk(3))
    m = ndi.binary_fill_holes(m) & outline
    lab = measure.label(m, connectivity=2)
    grad = np.hypot(cv2.Sobel(V, cv2.CV_32F, 1, 0), cv2.Sobel(V, cv2.CV_32F, 0, 1))
    keep = np.zeros(lab.max() + 1, bool)
    rows = []
    for r in measure.regionprops(lab):
        if r.area < H["min_px"]:
            continue
        keep[r.label] = True
        comp = lab == r.label
        ring = morphology.dilation(comp, morphology.disk(12)) & ~morphology.dilation(comp, morphology.disk(4))
        ring &= tissue
        if not ring.any():
            ring = morphology.dilation(comp, morphology.disk(4)) & ~comp
        inner = ndi.binary_erosion(comp, iterations=2)
        if inner.sum() < 20:
            inner = comp
        border = comp & ~ndi.binary_erosion(comp)
        rows.append(
            {
                "label": r.label,
                "area_px": int(r.area),
                "x": r.centroid[1],
                "y": r.centroid[0],
                # sharp wall and flat floor (hole) vs soft edge and shading inside (crease)
                "edge_vs_inside": float(np.mean(grad[border]) / max(np.mean(grad[inner]), 1e-3)),
                # how much darker than the tissue just around it, in V units (0-255)
                "contrast": float(np.median(V[ring]) - np.median(V[comp])),
                # width of its widest part, px
                "thickness": float(2 * ndi.distance_transform_edt(comp).max()),
            }
        )
    lab = np.where(keep[lab], lab, 0)
    return lab, pd.DataFrame(rows, columns=CANDIDATE_COLUMNS)


@dataclass(frozen=True)
class Holes:
    removed: np.ndarray  # candidates scoring >= the cut-off: taken out of the tissue
    uncertain: np.ndarray  # candidates in the uncertain band: kept as tissue, they widen the reported range
    candidates: pd.DataFrame  # one row per candidate, with its measurements and "score"


def decide_holes(lab, cands, scores, tissue, cut, uncertain_from):
    """Turn candidate scores (one per row of `cands`) into masks."""
    scores = np.asarray(scores, float)
    cands = cands.assign(score=scores)
    removed = np.isin(lab, list(cands.label[scores >= cut])) & tissue
    uncertain = np.isin(lab, list(cands.label[(scores >= uncertain_from) & (scores < cut)])) & tissue
    return Holes(removed=removed, uncertain=uncertain, candidates=cands)


def find_holes(norm_img, tissue, paper, model):
    """Score every candidate with the hole model (a `HoleModel`) and decide which are holes."""
    lab, cands = hole_candidates(norm_img, tissue, paper)
    scores = model.score(cands) if len(cands) else np.zeros(0)
    return decide_holes(lab, cands, scores, tissue, cut=model.cut, uncertain_from=model.uncertain_from)
