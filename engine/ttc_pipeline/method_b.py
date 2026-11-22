"""Method B "a* cut" (research repo `ttc/segment.py`, `ttc/infarct.py`, `ttc/pipeline.py`; PLAN.md §2f).

Phase 0 tried Method B on the shared front end: its cut re-derived there was 3.80 pp from the YHS
values on the time-control slices, above the 2.9 pp limit. So, as PLAN.md §2f decides, Method B
keeps its original front end (white balance, chroma + GrabCut outline, lumen excluded) and takes
the real holes from the shared hole model.

One change from the research repo: GrabCut is seeded for every slice. It draws on OpenCV's
process-wide random generator, so without a seed a slice's outline depended on what ran before it
(one slice measured twice in a row: 209,932 then 210,087 px).

Dead = smoothed a* < the conservative cut; borderline = between the conservative and the liberal
cut. Both cuts come from `models/a_cut/a_cut.json`.
"""

import json
from dataclasses import dataclass

import cv2
import numpy as np
from scipy import ndimage as ndi
from skimage import color, filters, measure, morphology

from .holes import Holes
from .models import MODELS_DIR, verified_path

A_CUT_JSON = "a_cut/a_cut.json"
GRABCUT_SEED = 0  # OpenCV's start-of-process generator state


def white_balance(rgb, border_frac=0.06):
    """Scale channels so the paper (bright, low-saturation pixels at the image border) is neutral."""
    img = rgb.astype(np.float32)
    h, w = img.shape[:2]
    b = max(4, int(min(h, w) * border_frac))
    frame = np.zeros((h, w), bool)
    frame[:b], frame[-b:], frame[:, :b], frame[:, -b:] = True, True, True, True
    mx, mn = img.max(2), img.min(2)
    sat = (mx - mn) / np.maximum(mx, 1)
    cand = frame & (mx >= np.percentile(mx[frame], 50)) & (sat <= np.percentile(sat[frame], 50))
    if cand.sum() < 50:  # fall back to brightest neutral pixels anywhere
        cand = (mx >= np.percentile(mx, 90)) & (sat <= np.percentile(sat, 30))
    paper = np.median(img[cand], axis=0)
    out = np.clip(img * (paper.mean() / np.maximum(paper, 1)) * (245.0 / max(paper.mean(), 1)), 0, 255)
    return out.astype(np.uint8), paper


def lab_features(rgb_wb):
    lab = color.rgb2lab(rgb_wb)  # true CIELAB units
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    C = np.hypot(a, b)
    hue = np.degrees(np.arctan2(b, a))
    return L, a, b, C, hue


def _keep_main_components(mask, min_frac=0.15):
    lab = measure.label(mask, connectivity=2)
    if lab.max() == 0:
        return mask
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    keep = np.flatnonzero(sizes >= min_frac * sizes.max())
    return np.isin(lab, keep)


def original_tissue_mask(rgb, use_grabcut=True, chroma_bounds=(6.0, 14.0), seed=GRABCUT_SEED):
    """Method B's outline: dict(tissue, lumen, chroma_cut, wb). `tissue` excludes lumen.

    `seed=None` leaves OpenCV's generator as it is, as the research repo did (used only to reproduce it).
    """
    wb, _ = white_balance(rgb)
    C = lab_features(wb)[3]  # chroma
    Cs = cv2.GaussianBlur(C.astype(np.float32), (0, 0), 1.0)
    cut = float(np.clip(filters.threshold_otsu(Cs), *chroma_bounds))
    m = Cs > cut
    m = morphology.opening(m, morphology.disk(2))
    m = _keep_main_components(m)
    if use_grabcut and m.any():
        gc = np.full(m.shape, cv2.GC_PR_BGD, np.uint8)
        gc[morphology.dilation(m, morphology.disk(12)) == 0] = cv2.GC_BGD
        gc[m] = cv2.GC_PR_FGD
        gc[morphology.erosion(m, morphology.disk(6))] = cv2.GC_FGD
        bgd, fgd = np.zeros((1, 65)), np.zeros((1, 65))
        if seed is not None:
            cv2.setRNGSeed(seed)
        cv2.grabCut(cv2.cvtColor(wb, cv2.COLOR_RGB2BGR), gc, None, bgd, fgd, 4, cv2.GC_INIT_WITH_MASK)
        g = (gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD)
        g &= Cs > 0.6 * cut  # GrabCut may grab grid lines/shadow: veto clearly neutral pixels
        m = _keep_main_components(morphology.opening(g, morphology.disk(1)))
    m = morphology.closing(m, morphology.disk(3))
    filled = ndi.binary_fill_holes(m)
    holes = filled & ~m
    hl = measure.label(holes)
    sizes = np.bincount(hl.ravel())
    sizes[0] = 0
    small = np.isin(hl, np.flatnonzero((sizes > 0) & (sizes < 150)))
    tissue = m | small
    hull = morphology.convex_hull_image(tissue)
    interior = morphology.erosion(hull, morphology.disk(8))
    lumen = (filled & ~tissue) | (interior & ~tissue)
    return {"tissue": tissue, "lumen": lumen, "chroma_cut": cut, "wb": wb}


def smoothed_a(rgb, sigma=1.5):
    """Redness a* per pixel, blurred to suppress sensor grain."""
    _, a, _, _, _ = lab_features(rgb)
    return cv2.GaussianBlur(a.astype(np.float32), (0, 0), sigma)


@dataclass(frozen=True)
class ACuts:
    conservative: float  # dead = a* < this (the headline)
    liberal: float  # a* < this is the top of the range; between the two is borderline
    info: dict  # the contents of a_cut.json

    @property
    def version(self) -> str:
        return self.info["model_version"]

    @classmethod
    def load(cls, models_dir=MODELS_DIR) -> ACuts:
        info = json.loads(verified_path(A_CUT_JSON, models_dir).read_text())
        return cls(float(info["conservative"]), float(info["liberal"]), info)


@dataclass(frozen=True)
class MethodB:
    tissue: np.ndarray  # Method B's own outline, real holes removed
    dead: np.ndarray  # a* < conservative cut, inside the tissue
    borderline: np.ndarray  # conservative <= a* < liberal, inside the tissue
    dead_pct: float  # dead / tissue
    borderline_pct: float
    low_pct: float  # conservative cut, uncertain holes counted as holes
    high_pct: float  # liberal cut, uncertain holes counted as tissue


def _pct(part, whole):
    n = int(whole.sum())
    return 100.0 * float((part & whole).sum()) / n if n else float("nan")


def method_b_tissue(rgb, holes: Holes):
    """Method B's outline with the shared hole model's removed holes taken out; and its white-balanced photo."""
    seg = original_tissue_mask(rgb)
    return seg["tissue"] & ~holes.removed, seg["wb"]


def method_b(rgb, holes: Holes, cuts: ACuts) -> MethodB:
    """Method B on one photo. `holes` comes from the shared front end (`run_front_end`)."""
    tissue, wb = method_b_tissue(rgb, holes)
    uncertain = holes.uncertain & tissue
    a = smoothed_a(wb)
    dead = tissue & (a < cuts.conservative)
    liberal = tissue & (a < cuts.liberal)
    return MethodB(
        tissue=tissue,
        dead=dead,
        borderline=liberal & ~dead,
        dead_pct=_pct(dead, tissue),
        borderline_pct=_pct(liberal & ~dead, tissue),
        low_pct=_pct(dead, tissue & ~uncertain),
        high_pct=_pct(liberal, tissue),
    )
