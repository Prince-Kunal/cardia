"""The 30 GVSU study slices through the shared front end (lighting correction and tissue mask)."""

import os
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from ttc_pipeline import normalise_lighting, parse_name, read_rgb, tissue_mask
from ttc_pipeline.read import STUDY_NAME
from ttc_pipeline.tissue import TissueMask

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "data"


def study_scans(data=DATA) -> dict[str, Path]:
    """{file name: path} for the study scans anywhere under data/ (symlinks followed), sorted by name."""
    found = {}
    for d, _, files in os.walk(data, followlinks=True):
        for f in files:
            if STUDY_NAME.search(f) and "new_slices" not in Path(d).parts:
                found[f] = Path(d) / f
    return dict(sorted(found.items()))


@dataclass(frozen=True)
class StudySlice:
    name: str
    heart: str
    norm: np.ndarray  # lighting-corrected photo
    paper: np.ndarray  # paper mask
    tm: TissueMask  # tissue mask before hole removal


def front_end(path) -> StudySlice:
    name = Path(path).name
    norm, paper = normalise_lighting(read_rgb(path))
    return StudySlice(name, parse_name(name)[0], norm, paper, tissue_mask(norm, paper))


def study_slices(data=DATA) -> list[StudySlice]:
    """All study slices in study order (by heart, then file name), as in the notebook."""
    return [front_end(p) for p in study_scans(data).values()]
