"""The shared front end in one call: read photo -> lighting correction -> tissue mask -> hole removal."""

from dataclasses import dataclass

import numpy as np

from .holes import Holes, find_holes
from .lighting import normalise_lighting
from .models import HoleModel
from .tissue import tissue_mask


@dataclass(frozen=True)
class FrontEnd:
    norm: np.ndarray  # lighting-corrected photo (RGB uint8)
    paper: np.ndarray  # bare paper used as the white reference
    tissue: np.ndarray  # final tissue: the slice, with real holes removed
    tissue_before_holes: np.ndarray
    filled: np.ndarray  # enclosed gaps filled in as tissue (glare, very pale tissue)
    holes: Holes  # removed and uncertain holes, and every candidate with its score
    chroma_threshold: float


def run_front_end(rgb: np.ndarray, hole_model: HoleModel) -> FrontEnd:
    norm, paper = normalise_lighting(rgb)
    tm = tissue_mask(norm, paper)
    holes = find_holes(norm, tm.tissue, paper, hole_model)
    return FrontEnd(
        norm=norm,
        paper=paper,
        tissue=tm.tissue & ~holes.removed,
        tissue_before_holes=tm.tissue,
        filled=tm.filled,
        holes=holes,
        chroma_threshold=tm.threshold,
    )
