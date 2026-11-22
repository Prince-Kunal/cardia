"""Reproducing the research repo's Method B runs exactly (PLAN.md §8: "Method B on its original front
end reproduces measure.py exactly").

The repo ran GrabCut without a seed, so each slice's outline depended on the slices processed before
it in the same process. `repo_front_end` resets OpenCV's generator once and processes the slices in
the repo's order, which reproduces its saved outputs exactly. The engine instead seeds every slice
(`ttc_pipeline.method_b.original_tissue_mask`).
"""

import cv2
import numpy as np
from sklearn.mixture import GaussianMixture

from ttc_pipeline import read_rgb
from ttc_pipeline.method_b import GRABCUT_SEED, original_tissue_mask

BATCH_A = ("206", "207", "208", "210")  # the infarct hearts; the research repo loaded these first


def repo_order(names):
    """The research repo's processing order: infarct hearts first, then time-control hearts, each by file name."""
    return sorted(names, key=lambda n: (n[:3] not in BATCH_A, n))


def repo_front_end(scans):
    """{file name: (white-balanced photo, tissue)} for `scans` ({file name: path}), run as the research repo did."""
    cv2.setRNGSeed(GRABCUT_SEED)  # the start-of-process state, then carried from slice to slice
    out = {}
    for name in repo_order(scans):
        seg = original_tissue_mask(read_rgb(scans[name]), seed=None)
        out[name] = (seg["wb"], seg["tissue"])
    return out


class RednessModel:
    """Research repo: the label-free a* cut, the valley of a 2-component GMM on a* pooled over all slices."""

    def __init__(self, n_per_slice=5000, seed=42):
        self.n, self.seed = n_per_slice, seed
        self.a_cut = 18.0  # fallback before fitting

    def fit(self, a_images, tissues):
        """`a_images`: smoothed a* per slice (the repo passed photos and smoothed them here)."""
        rng = np.random.default_rng(self.seed)
        xs = []
        for a_img, t in zip(a_images, tissues, strict=True):
            a = a_img[t]
            xs.append(a[rng.choice(len(a), min(self.n, len(a)), replace=False)])
        x = np.concatenate(xs)[:, None]
        self.gmm = GaussianMixture(2, means_init=[[8.0], [30.0]], random_state=self.seed).fit(x)
        self.inf = int(np.argmin(self.gmm.means_.ravel()))
        grid = np.linspace(self.gmm.means_.min(), self.gmm.means_.max(), 2000)[:, None]
        p = self.gmm.predict_proba(grid)[:, self.inf]
        self.a_cut = float(grid[np.argmin(np.abs(p - 0.5)), 0])
        return self
