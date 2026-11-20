"""Cardia's analysis pipeline, ported from the reference code without changing behaviour (PLAN.md §7).

Shared front end: read -> lighting correction -> tissue mask -> hole removal (the shared hole
model). Method A and Method B follow in later steps of Phase 0.
"""

from .holes import Holes, find_holes
from .lighting import find_paper, flat_field, normalise_lighting
from .models import HoleModel, ModelFileError
from .pipeline import FrontEnd, run_front_end
from .read import parse_name, read_rgb
from .tissue import TissueMask, tissue_mask

PIPELINE_VERSION = "0.2.0"

__all__ = [
    "PIPELINE_VERSION",
    "FrontEnd",
    "HoleModel",
    "Holes",
    "ModelFileError",
    "TissueMask",
    "find_holes",
    "find_paper",
    "flat_field",
    "normalise_lighting",
    "parse_name",
    "read_rgb",
    "run_front_end",
    "tissue_mask",
]
