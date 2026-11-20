"""The reference notebook's hole candidates and measures (Steps 20-21), ported exactly.

Not shipped: Phase 0 chose the research repo's version for the shared hole file (PLAN.md §2d). This
is kept to show the port is exact (the notebook's held-out hole decisions reproduce its saved
masks on all 30 slices) and for `compare_hole_versions.py`.
"""

import cv2
import numpy as np
import pandas as pd
from scipy import ndimage as ndi
from skimage import measure, morphology

from ttc_pipeline.color import to_lab

NOTEBOOK_HOLES = {"v_frac": 145 / 245, "g_r": 0.5, "b_g": 0.95, "dark_L": 32, "min_px": 150}  # notebook CFG["holes"]
FEATURES_3 = ["edge_vs_inside", "contrast", "thickness"]
FEATURES_4 = [*FEATURES_3, "flatness"]
COLUMNS = [
    "label",
    "area_px",
    "x",
    "y",
    "edge_vs_inside",
    "contrast",
    "thickness",
    "flatness",
    "depth",
    "darker_paper_share",
]


def hole_flatness(lab, sigma=1.2, win=7):
    """Local spread of the colour after sensor grain is smoothed away (low = a flat surface, such as paper)."""
    total = np.zeros(lab.shape[:2], np.float32)
    for c in range(3):
        x = cv2.GaussianBlur(lab[..., c], (0, 0), sigma)
        m1 = cv2.blur(x, (win, win))
        m2 = cv2.blur(x * x, (win, win))
        total += np.maximum(m2 - m1 * m1, 0) * (1.0 if c == 0 else 1.5)
    return np.sqrt(total)


def notebook_candidates(norm_img, tissue, paper):
    """Notebook `hole_candidates`: (label image, one row per candidate)."""
    H = NOTEBOOK_HOLES
    img = cv2.GaussianBlur(norm_img.astype(np.float32), (0, 0), 1.5)
    R, G, B = img[..., 0], img[..., 1], img[..., 2]
    V = img.max(2)
    pV = float(np.median(V[paper]))
    unit = pV / 245  # brightness scaled to this photo's paper
    L = cv2.GaussianBlur(to_lab(norm_img)[..., 0], (0, 0), 1.5)
    outline = ndi.binary_fill_holes(tissue)
    depth = ndi.distance_transform_edt(outline)
    rel = depth / max(depth.max(), 1)
    darker_paper = (V < H["v_frac"] * pV) & (G / np.maximum(R, 1) > H["g_r"]) & (B / np.maximum(G, 1) < H["b_g"])
    m = outline & (darker_paper | (L < H["dark_L"]))
    m = (
        ndi.binary_fill_holes(morphology.closing(morphology.opening(m, morphology.disk(2)), morphology.disk(3)))
        & outline
    )
    # The notebook passes min_px positionally; scikit-image 0.26 reads that as max_size (removes <= min_px).
    lab = measure.label(morphology.remove_small_objects(m, max_size=H["min_px"]))
    gy, gx = np.gradient(V)
    steep = np.hypot(gx, gy) / unit
    rows = []
    FL = hole_flatness(to_lab(norm_img))
    fl_ref = float(np.percentile(FL[tissue], 12)) + 1e-6  # this slice's flattest tissue
    for r in measure.regionprops(lab):
        reg = lab == r.label
        band = morphology.dilation(reg, morphology.disk(2)) & ~morphology.erosion(reg, morphology.disk(2))
        inner = morphology.erosion(reg, morphology.disk(2))
        inner = inner if inner.sum() > 10 else reg
        ring = morphology.dilation(reg, morphology.disk(12)) & ~morphology.dilation(reg, morphology.disk(4)) & tissue
        rows.append(
            {
                "label": r.label,
                "area_px": int(r.area),
                "x": r.centroid[1],
                "y": r.centroid[0],
                "edge_vs_inside": float(np.percentile(steep[band], 90) / (np.median(steep[inner]) + 0.5)),
                "contrast": (float(np.median(V[ring])) - float(np.median(V[reg]))) / unit if ring.any() else 0.0,
                "thickness": 2 * float(ndi.distance_transform_edt(reg).max()),
                "depth": float(np.median(rel[reg])),
                "flatness": float(np.median(FL[inner])) / fl_ref,
                "darker_paper_share": float(darker_paper[reg].mean()),
            }
        )
    return lab, pd.DataFrame(rows, columns=COLUMNS)
