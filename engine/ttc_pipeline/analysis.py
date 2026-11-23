"""One slice as the app analyses it: shared front end, both methods, slice QC flags (PLAN.md §2g).

The golden set (`training/golden.py`) and the local API (`cardia_api`) both call `analyse_slice`, so
the golden test checks exactly what the app runs.
"""

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .method_a import UNSURE, ForestModel, MethodA, method_a
from .method_b import ACuts, MethodB, method_b
from .models import MANIFEST, MODELS_DIR, HoleModel, read_manifest, sha256_file
from .pipeline import FrontEnd, run_front_end

TIFF_SUFFIXES = (".tif", ".tiff")
QC_FLAGS = ("unvalidated_input", "many_unsure", "holes_removed", "uncertain_holes")
STAGES = ("front_end", "method_a", "method_b")  # what `progress` is told, in order


@dataclass(frozen=True)
class Models:
    """Every frozen model file the analysis uses, each checked against the manifest when loaded."""

    holes: HoleModel
    forest: ForestModel
    cuts: ACuts
    manifest_sha256: str
    files: dict  # the manifest's "files": {path: {sha256, model_version, ...}}

    @classmethod
    def load(cls, models_dir=MODELS_DIR) -> Models:
        return cls(
            holes=HoleModel.load(models_dir),
            forest=ForestModel.load(models_dir),
            cuts=ACuts.load(models_dir),
            manifest_sha256=sha256_file(Path(models_dir) / MANIFEST),
            files=read_manifest(models_dir)["files"],
        )


def qc_flags(file_name, a: MethodA, holes) -> list[str]:
    """Slice-level QC flags that need no other slice (PLAN.md §2g), in the order of QC_FLAGS."""
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
    a: MethodA
    b: MethodB
    qc_flags: tuple[str, ...]

    def numbers(self) -> dict:
        """The slice's numbers, one column each in the golden set's `per_slice.csv`."""
        fe, a, b = self.front_end, self.a, self.b
        return {
            "tissue_px": int(fe.tissue.sum()),
            "holes_removed_px": int(fe.holes.removed.sum()),
            "holes_uncertain_px": int(fe.holes.uncertain.sum()),
            "filled_px": int(fe.filled.sum()),
            "a_dead_pct": a.dead_pct,
            "a_low_pct": a.low_pct,
            "a_high_pct": a.high_pct,
            "a_unsure_pct": a.unsure_pct,
            "b_tissue_px": int(b.tissue.sum()),
            "b_dead_pct": b.dead_pct,
            "b_low_pct": b.low_pct,
            "b_high_pct": b.high_pct,
            "b_borderline_pct": b.borderline_pct,
            "qc_flags": ";".join(self.qc_flags),
        }

    def masks(self) -> dict[str, np.ndarray]:
        """Every boolean mask the app can show, by layer name."""
        fe, a, b = self.front_end, self.a, self.b
        return {
            "tissue": fe.tissue,
            "holes_removed": fe.holes.removed,
            "holes_uncertain": fe.holes.uncertain,
            "filled": fe.filled,
            "a_dead": a.dead,
            "a_unsure": fe.tissue & (a.p > UNSURE[0]) & (a.p < UNSURE[1]),
            "b_tissue": b.tissue,
            "b_dead": b.dead,
            "b_borderline": b.borderline,
        }


def analyse_slice(rgb, file_name, models: Models, progress: Callable[[str], None] | None = None) -> SliceAnalysis:
    """Analyse one photo (RGB uint8). `file_name` decides the non-TIFF flag; `progress` hears each of STAGES."""
    tell = progress or (lambda stage: None)
    tell("front_end")
    fe = run_front_end(rgb, models.holes)
    tell("method_a")
    a = method_a(fe.norm, fe.tissue, fe.holes.uncertain, models.forest)
    tell("method_b")
    b = method_b(rgb, fe.holes, models.cuts)
    return SliceAnalysis(fe, a, b, tuple(qc_flags(file_name, a, fe.holes)))
