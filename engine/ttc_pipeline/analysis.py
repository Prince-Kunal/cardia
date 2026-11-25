"""One slice as the app analyses it: shared front end, the three methods, slice QC flags (PLAN.md §2g).

Method A (K-Means + RF) and Method B (DBSCAN + RF) are the two machine-learning methods and read the same 22
pixel features; Method C (stain ratio) is a colour rule with no machine learning.

The golden set (`training/golden.py`) and the local API (`cardia_api`) both call `analyse_slice`, so
the golden test checks exactly what the app runs.
"""

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .method_a import UNSURE, ForestModel, ForestResult, pixel_features, summarise_a
from .method_b import load_dbscan_forest, method_b
from .method_c import MethodC, StainRatioModel, method_c
from .models import MANIFEST, MODELS_DIR, HoleModel, read_manifest, sha256_file
from .pipeline import FrontEnd, run_front_end

TIFF_SUFFIXES = (".tif", ".tiff")
QC_FLAGS = ("unvalidated_input", "many_unsure", "holes_removed", "uncertain_holes")
STAGES = ("front_end", "method_a", "method_b", "method_c")  # what `progress` is told, in order


@dataclass(frozen=True)
class Models:
    """Every frozen model file the analysis uses, each checked against the manifest when loaded."""

    holes: HoleModel
    forest: ForestModel  # Method A
    dbscan: ForestModel  # Method B
    stain: StainRatioModel  # Method C
    manifest_sha256: str
    files: dict  # the manifest's "files": {path: {sha256, model_version, ...}}

    @classmethod
    def load(cls, models_dir=MODELS_DIR) -> Models:
        return cls(
            holes=HoleModel.load(models_dir),
            forest=ForestModel.load(models_dir),
            dbscan=load_dbscan_forest(models_dir),
            stain=StainRatioModel.load(models_dir),
            manifest_sha256=sha256_file(Path(models_dir) / MANIFEST),
            files=read_manifest(models_dir)["files"],
        )


def qc_flags(file_name, a: ForestResult, holes) -> list[str]:
    """Slice-level QC flags that need no other slice (PLAN.md §2g), in the order of QC_FLAGS. "many_unsure" is
    about Method A, the headline method."""
    flags = []
    if not str(file_name).lower().endswith(TIFF_SUFFIXES):
        flags.append("unvalidated_input")
    if a.many_unsure:
        flags.append("many_unsure")
    if holes.removed.any():
        flags.append("holes_removed")
    if holes.uncertain.any():
        flags.append("uncertain_holes")
    return flags


@dataclass(frozen=True)
class SliceAnalysis:
    front_end: FrontEnd
    a: ForestResult  # Method A: K-Means + RF
    b: ForestResult  # Method B: DBSCAN + RF
    c: MethodC  # Method C: stain ratio
    qc_flags: tuple[str, ...]

    def numbers(self) -> dict:
        """The slice's numbers, one column each in the golden set's `per_slice.csv`."""
        fe, a, b, c = self.front_end, self.a, self.b, self.c
        return {
            "tissue_px": int(fe.tissue.sum()),
            "holes_removed_px": int(fe.holes.removed.sum()),
            "holes_uncertain_px": int(fe.holes.uncertain.sum()),
            "filled_px": int(fe.filled.sum()),
            "a_dead_pct": a.dead_pct,
            "a_low_pct": a.low_pct,
            "a_high_pct": a.high_pct,
            "a_unsure_pct": a.unsure_pct,
            "b_dead_pct": b.dead_pct,
            "b_low_pct": b.low_pct,
            "b_high_pct": b.high_pct,
            "b_unsure_pct": b.unsure_pct,
            "c_dead_pct": c.dead_pct,
            "c_low_pct": c.low_pct,
            "c_high_pct": c.high_pct,
            "c_borderline_pct": c.borderline_pct,
            "qc_flags": ";".join(self.qc_flags),
        }

    def masks(self) -> dict[str, np.ndarray]:
        """Every boolean mask the app can show, by layer name."""
        fe, a, b, c = self.front_end, self.a, self.b, self.c
        return {
            "tissue": fe.tissue,
            "holes_removed": fe.holes.removed,
            "holes_uncertain": fe.holes.uncertain,
            "filled": fe.filled,
            "a_dead": a.dead,
            "a_unsure": fe.tissue & (a.p > UNSURE[0]) & (a.p < UNSURE[1]),
            "b_dead": b.dead,
            "b_unsure": fe.tissue & (b.p > UNSURE[0]) & (b.p < UNSURE[1]),
            "c_dead": c.dead,
            "c_borderline": c.borderline,
        }


def analyse_slice(rgb, file_name, models: Models, progress: Callable[[str], None] | None = None) -> SliceAnalysis:
    """Analyse one photo (RGB uint8). `file_name` decides the non-TIFF flag; `progress` hears each of STAGES."""
    tell = progress or (lambda stage: None)
    tell("front_end")
    fe = run_front_end(rgb, models.holes)
    tell("method_a")
    features = pixel_features(fe.norm, fe.tissue)  # shared by Methods A and B
    a = summarise_a(models.forest.dead_probability(features), fe.tissue, fe.holes.uncertain)
    tell("method_b")
    b = method_b(fe.norm, fe.tissue, fe.holes.uncertain, models.dbscan, features)
    tell("method_c")
    c = method_c(rgb, fe.paper, fe.tissue, fe.holes.removed, fe.holes.uncertain, models.stain)
    return SliceAnalysis(fe, a, b, c, tuple(qc_flags(file_name, a, fe.holes)))
