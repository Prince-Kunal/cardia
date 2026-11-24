"""Cardia's analysis pipeline, ported from the reference code without changing behaviour (PLAN.md §7).

Shared front end: read -> lighting correction -> tissue mask -> hole removal (the shared hole
model). Method A ("K-Means + RF") reads the shared front end with the notebook's frozen forest.
Method B ("stain ratio", 2026-11-24) reads the red stain and the tint of the shared front end's tissue as light
absorbed, unclipped; it replaced the earlier a* cut (old Method B) and the short-lived Method C ("stain hue").
"""

from .analysis import Models, SliceAnalysis, analyse_slice
from .heart import HeartNumbers, heart_numbers
from .holes import Holes, find_holes
from .lighting import find_paper, flat_field, normalise_lighting
from .method_a import ForestModel, MethodA, method_a
from .method_b import MethodB, StainRatioModel, method_b
from .models import HoleModel, ModelFileError
from .pipeline import FrontEnd, run_front_end
from .read import parse_name, read_rgb
from .tissue import TissueMask, tissue_mask

PIPELINE_VERSION = "0.5.0"  # 0.5.0: Method B is the stain ratio; the a* cut and Method C removed. A unchanged

__all__ = [
    "PIPELINE_VERSION",
    "ForestModel",
    "FrontEnd",
    "HeartNumbers",
    "HoleModel",
    "Holes",
    "MethodA",
    "MethodB",
    "ModelFileError",
    "Models",
    "SliceAnalysis",
    "StainRatioModel",
    "TissueMask",
    "analyse_slice",
    "find_holes",
    "find_paper",
    "flat_field",
    "heart_numbers",
    "method_a",
    "method_b",
    "normalise_lighting",
    "parse_name",
    "read_rgb",
    "run_front_end",
    "tissue_mask",
]
