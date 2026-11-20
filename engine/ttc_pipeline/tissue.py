"""Tissue mask (reference notebook Part E, Steps 14-19).

chroma -> threshold -> remove specks -> cut ruler bridges -> fill the right holes.
Real holes (heart chambers cut through) are removed afterwards by the hole model
(Steps 20-22), which is ported separately.
"""

from dataclasses import dataclass

import cv2
import numpy as np
from scipy import ndimage as ndi
from skimage import measure, morphology

from .color import largest_components, to_lab
from .config import CFG


def chroma_map(norm_img):
    lab = to_lab(norm_img)
    return cv2.GaussianBlur(np.hypot(lab[..., 1], lab[..., 2]), (5, 5), 0)


def chroma_threshold(ch, paper):
    return float(max(np.percentile(ch[paper], 99) + 2.0, 5.5))


def remove_specks(binary):
    return largest_components(morphology.opening(binary, morphology.disk(2)))


def cut_ruler_bridges(m):
    body = largest_components(morphology.opening(m, morphology.disk(5)))
    return largest_components(morphology.closing(m & morphology.dilation(body, morphology.disk(6)), morphology.disk(2)))


def fill_holes(m, norm_img, paper):
    """Fill an enclosed hole if it is tiny (< 0.2% of the slice) or bright (<= 10 L* darker than the paper)."""
    lab = to_lab(norm_img)
    paper_L = float(np.median(lab[..., 0][paper]))
    holes = ndi.binary_fill_holes(m) & ~m
    hl = measure.label(holes)
    n = hl.max()
    if n:
        hs = np.bincount(hl.ravel(), minlength=n + 1)
        hL = np.asarray(ndi.mean(lab[..., 0], hl, index=np.arange(n + 1)))
        fill = (hs <= CFG["hole_small_frac"] * m.sum()) | (hL >= paper_L - CFG["hole_dark_dL"])
        fill[0] = False
        m = m | fill[hl]
    return m


@dataclass(frozen=True)
class TissueMask:
    tissue: np.ndarray  # the slice, holes filled where they are tissue; real holes not yet removed
    threshold: float  # the chroma cut-off measured on this photo
    filled: np.ndarray  # pixels added by fill_holes (glare, very pale tissue)


def tissue_mask(norm_img, paper):
    """The notebook's `tissue_mask` up to, not including, hole removal."""
    ch = chroma_map(norm_img)
    t = chroma_threshold(ch, paper)
    m0 = cut_ruler_bridges(remove_specks(ch > t))
    m1 = fill_holes(m0, norm_img, paper)
    return TissueMask(tissue=m1, threshold=t, filled=m1 & ~m0)
