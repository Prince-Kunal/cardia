"""Lighting correction (reference notebook Part D, Steps 11-12).

Finds the bare paper, then divides each colour channel by a smooth surface fitted to the
paper so the paper becomes the same neutral grey in every photo.
"""

import cv2
import numpy as np
from skimage import morphology

from .color import largest_components, lin_to_srgb, srgb_to_lin, to_lab
from .config import CFG


def rough_tissue(lab, border=12):
    h, w = lab.shape[:2]
    band = np.zeros((h, w), bool)
    band[:border] = band[-border:] = True
    band[:, :border] = band[:, -border:] = True
    ch = np.hypot(lab[..., 1], lab[..., 2])
    pb = band & (ch <= np.percentile(ch[band], 50))
    paper_ab = np.median(lab[pb][:, 1:3], 0)
    d = np.hypot(lab[..., 1] - paper_ab[0], lab[..., 2] - paper_ab[1])
    return largest_components(morphology.opening(cv2.GaussianBlur(d, (5, 5), 0) > 8, morphology.disk(2)))


def find_paper(img):
    """Bare paper: everything well away from a rough tissue outline, minus the darkest 35%."""
    lab = to_lab(img)
    rough = rough_tissue(lab)
    near = morphology.dilation(rough, morphology.disk(20))
    L = lab[..., 0]
    return ~near & (L >= np.percentile(L[~near], 35)), rough


def flat_field(img, paper, target=CFG["paper_target_linear"]):
    lin = srgb_to_lin(img)
    h, w = paper.shape
    yy, xx = np.mgrid[0:h, 0:w]
    xs, ys = xx / w - 0.5, yy / h - 0.5
    terms = [np.ones_like(xs), xs, ys, xs * xs, ys * ys, xs * ys]  # 2nd-order surface
    A = np.stack([t[paper] for t in terms], 1)
    sel = np.random.default_rng(0).choice(len(A), min(50000, len(A)), replace=False)
    out = np.empty_like(lin)
    for c in range(3):
        coef, *_ = np.linalg.lstsq(A[sel], lin[..., c][paper][sel], rcond=None)
        field = np.clip(sum(cf * t for cf, t in zip(coef, terms)), 0.05, None)
        out[..., c] = lin[..., c] / field * target
    return (lin_to_srgb(out) * 255 + 0.5).astype(np.uint8)


def normalise_lighting(img):
    """Return the lighting-corrected photo and the paper mask used as the white reference."""
    paper, _ = find_paper(img)
    return flat_field(img, paper), paper
