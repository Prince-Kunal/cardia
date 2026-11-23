"""A fake analysis for building and testing the UI without model files or lab data (`--mock`).

Every number it gives is made up: tissue = colourful pixels, "dead" = pale ones. Results say
`mock: true` and pipeline version "mock". It reuses the real summaries, QC flags and layers, so the
shape of every answer is exactly the real one.
"""

import time

import cv2
import numpy as np
import pandas as pd
from scipy import ndimage as ndi

from ttc_pipeline.analysis import SliceAnalysis, qc_flags
from ttc_pipeline.holes import CANDIDATE_COLUMNS, Holes
from ttc_pipeline.method_a import summarise_a
from ttc_pipeline.method_b import ACuts, summarise_b
from ttc_pipeline.pipeline import FrontEnd

MOCK_PIPELINE_VERSION = "mock"


def _largest(mask):
    lab, n = ndi.label(mask)
    if n == 0:
        return mask
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    return lab == sizes.argmax()


def mock_analyse(rgb, file_name, cuts: ACuts, delay_s=0.0, progress=None) -> SliceAnalysis:
    tell = progress or (lambda stage: None)
    tell("front_end")
    time.sleep(delay_s)
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    a_star, b_star = lab[..., 1] - 128, lab[..., 2] - 128
    colourful = _largest(ndi.binary_opening(np.hypot(a_star, b_star) > 12, iterations=2))
    filled = ndi.binary_fill_holes(colourful) & ~colourful
    tissue = colourful | filled
    none = np.zeros_like(tissue)
    holes = Holes(removed=none, uncertain=none, candidates=pd.DataFrame(columns=[*CANDIDATE_COLUMNS, "score"]))
    fe = FrontEnd(
        norm=rgb,
        paper=np.array([255.0, 255.0, 255.0]),
        tissue=tissue,
        tissue_before_holes=tissue,
        filled=filled,
        holes=holes,
        chroma_threshold=12.0,
    )
    tell("method_a")
    time.sleep(delay_s)
    p = np.clip((30.0 - a_star) / 25.0, 0.0, 1.0).astype(np.float32)
    a = summarise_a(p[tissue], tissue, holes.uncertain)
    tell("method_b")
    time.sleep(delay_s)
    smoothed = cv2.GaussianBlur(a_star, (0, 0), 1.5)
    b = summarise_b(smoothed, tissue, holes.uncertain, cuts.conservative, cuts.liberal)
    return SliceAnalysis(fe, a, b, tuple(qc_flags(file_name, a, holes)))
