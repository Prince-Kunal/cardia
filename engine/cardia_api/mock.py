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
from ttc_pipeline.method_c import StainRatioModel, stain_and_tint, summarise_c
from ttc_pipeline.pipeline import FrontEnd

MOCK_PIPELINE_VERSION = "mock"


def _largest(mask):
    lab, n = ndi.label(mask)
    if n == 0:
        return mask
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    return lab == sizes.argmax()


def mock_analyse(rgb, file_name, stain: StainRatioModel, delay_s=0.0, progress=None) -> SliceAnalysis:
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
    b = summarise_a(np.clip(p * 0.9 + 0.02, 0.0, 1.0)[tissue], tissue, holes.uncertain)  # made up, like A
    tell("method_c")
    time.sleep(delay_s)
    od = -np.log10(np.clip(cv2.GaussianBlur(rgb.astype(np.float32) / 255.0, (0, 0), 2.0), 1e-3, None))
    s, t = stain_and_tint(od)
    nan = np.float32(np.nan)
    c = summarise_c(np.where(tissue, s, nan), np.where(tissue, t, nan), tissue, holes.uncertain, stain)
    return SliceAnalysis(fe, a, b, c, tuple(qc_flags(file_name, a, holes)))
