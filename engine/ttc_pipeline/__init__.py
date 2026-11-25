"""Cardia's analysis pipeline, ported from the reference code without changing behaviour (PLAN.md §7).

Shared front end: read -> lighting correction -> tissue mask -> hole removal (the shared hole
model). Then three methods on the same tissue:
* Method A ("K-Means + RF"): the reference notebook's frozen forest, taught by K-Means colour groups.
* Method B ("DBSCAN + RF", 2026-11-25): the same 22 pixel features and forest recipe, taught by tuned DBSCAN
  colour groups (GVSU_Infarct_Pipeline_dbscan_search.ipynb, "Tuned DBSCAN + RF").
* Method C ("stain ratio", 2026-11-24): a colour rule, no machine learning. It reads the red stain and the
  tint of the tissue as light absorbed, unclipped. It was Method B until 2026-11-25.
"""

from .analysis import Models, SliceAnalysis, analyse_slice
from .heart import HeartNumbers, heart_numbers
from .holes import Holes, find_holes
from .lighting import find_paper, flat_field, normalise_lighting
from .method_a import ForestModel, ForestResult, MethodA, method_a
from .method_b import MethodB, load_dbscan_forest, method_b
from .method_c import MethodC, StainRatioModel, method_c
from .models import HoleModel, ModelFileError
from .pipeline import FrontEnd, run_front_end
from .read import parse_name, read_rgb
from .tissue import TissueMask, tissue_mask

PIPELINE_VERSION = "0.6.0"  # 0.6.0: Method B is DBSCAN + RF; the stain ratio is Method C. A unchanged

__all__ = [
    "PIPELINE_VERSION",
    "ForestModel",
    "ForestResult",
    "FrontEnd",
    "HeartNumbers",
    "HoleModel",
    "Holes",
    "MethodA",
    "MethodB",
    "MethodC",
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
    "load_dbscan_forest",
    "method_a",
    "method_b",
    "method_c",
    "normalise_lighting",
    "parse_name",
    "read_rgb",
    "run_front_end",
    "tissue_mask",
]
