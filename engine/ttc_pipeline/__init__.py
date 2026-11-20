"""Cardia's analysis pipeline, ported from the reference notebook without changing behaviour (PLAN.md §7).

Shared front end so far: read -> lighting correction -> tissue mask. Hole removal, Method A and
Method B follow in later steps of Phase 0.
"""

from .lighting import find_paper, flat_field, normalise_lighting
from .read import parse_name, read_rgb
from .tissue import TissueMask, tissue_mask

PIPELINE_VERSION = "0.1.0"

__all__ = [
    "PIPELINE_VERSION",
    "TissueMask",
    "find_paper",
    "flat_field",
    "normalise_lighting",
    "parse_name",
    "read_rgb",
    "tissue_mask",
]
