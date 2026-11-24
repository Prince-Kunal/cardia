"""Heart numbers from slice numbers (PLAN.md §2g).

Heart % = the slices' percentages weighted by slice weight. If any slice has no weight, every slice is
weighted by its tissue area instead, and the heart is flagged. Dead mass = % x weight, so it is known
only when every weight is. A slice with no tissue (percentages NaN) is left out of the numbers.
"""

import math
from dataclasses import dataclass

A_COLUMNS = ("a_dead_pct", "a_unsure_pct", "a_low_pct", "a_high_pct")
B_COLUMNS = ("b_dead_pct", "b_borderline_pct", "b_low_pct", "b_high_pct")  # both methods read the shared tissue


@dataclass(frozen=True)
class HeartNumbers:
    weighting: str  # "slice_weight" or "tissue_area"
    total_weight_mg: float | None  # None unless every slice has a weight
    flags: tuple[str, ...]  # "weights_missing"
    pct: dict[str, float | None]  # every column of A_COLUMNS and B_COLUMNS
    a_dead_mg: float | None
    b_dead_mg: float | None


def _weighted(values, weights) -> float | None:
    pairs = [(v, w) for v, w in zip(values, weights, strict=True) if v is not None and not math.isnan(v) and w > 0]
    total = sum(w for _, w in pairs)
    return sum(v * w for v, w in pairs) / total if total else None


def heart_numbers(slices: list[dict]) -> HeartNumbers:
    """`slices`: one dict per slice with `weight_mg` (None if unknown), `tissue_px` and the percentage columns
    of `SliceAnalysis.numbers()`."""
    if not slices:
        raise ValueError("a heart needs at least one slice")
    weights = [s["weight_mg"] for s in slices]
    by_weight = all(w is not None for w in weights)
    w = [float(x) for x in weights] if by_weight else [float(s["tissue_px"]) for s in slices]
    pct = {c: _weighted([s[c] for s in slices], w) for c in A_COLUMNS + B_COLUMNS}
    total = sum(weights) if by_weight else None

    def dead_mg(col):
        if not by_weight:
            return None
        known = [(s[col], m) for s, m in zip(slices, weights, strict=True) if not math.isnan(s[col])]
        return sum(v / 100.0 * m for v, m in known) if known else None

    return HeartNumbers(
        weighting="slice_weight" if by_weight else "tissue_area",
        total_weight_mg=total,
        flags=() if by_weight else ("weights_missing",),
        pct=pct,
        a_dead_mg=dead_mg("a_dead_pct"),
        b_dead_mg=dead_mg("b_dead_pct"),
    )
