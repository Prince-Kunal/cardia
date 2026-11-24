"""The study set (PLAN.md §1d): the 8 hearts and 30 slices the pipeline was checked on, as context for a
heart's report. Read from the golden set in reference/golden, which records the pipeline version and the
model files it was measured with; a report compares only hearts measured the same way.

Each study heart's numbers come from the same heart_numbers() as any heart in the library, so the
comparison is like with like.
"""

import csv
import json
import math
from functools import cache
from pathlib import Path

from ttc_pipeline import heart_numbers

from .schemas import StudyHeart, StudySet

GOLDEN = Path(__file__).resolve().parents[2] / "reference" / "golden"
NUMBERS = (
    "tissue_px",
    "a_dead_pct",
    "a_unsure_pct",
    "a_low_pct",
    "a_high_pct",
    "b_dead_pct",
    "b_borderline_pct",
    "b_low_pct",
    "b_high_pct",
)


def _number(text: str) -> float:
    return float(text) if text.strip() else math.nan


@cache
def load(golden: Path = GOLDEN) -> StudySet | None:
    """The study set's hearts, or None when the golden set is not next to the engine (as in a build
    that leaves the reference folder out)."""
    try:
        meta = json.loads((golden / "meta.json").read_text())
        with open(golden / "per_slice.csv", newline="") as f:
            rows = list(csv.DictReader(f))
    except FileNotFoundError:
        return None
    hearts: dict[str, list[dict]] = {}
    for row in rows:
        weight = row.get("weight_mg", "").strip()
        hearts.setdefault(row["heart"], []).append(
            {"weight_mg": float(weight) if weight else None, **{k: _number(row[k]) for k in NUMBERS}}
        )
    out = []
    for heart_id, slices in sorted(hearts.items(), key=lambda kv: (len(kv[0]), kv[0])):
        hn = heart_numbers(slices)
        out.append(
            StudyHeart(
                heart_id=heart_id,
                slices=len(slices),
                total_weight_mg=hn.total_weight_mg,
                method_a_dead_pct=hn.pct["a_dead_pct"],
                method_b_dead_pct=hn.pct["b_dead_pct"],
            )
        )
    return StudySet(
        pipeline_version=meta["pipeline_version"],
        models_manifest_sha256=meta.get("models_manifest_sha256"),
        hearts=out,
    )
