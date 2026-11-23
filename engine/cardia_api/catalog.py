"""What the engine tells the UI about its methods and image layers."""

from ttc_pipeline.method_a import UNSURE, UNSURE_FLAG_PCT
from ttc_pipeline.method_b import ACuts

from .schemas import Layer, LayerInfo, MethodInfo

# PLAN.md §2g (decided 2026-11-23): only Method B's range is shown for now; Method A's is computed but hidden.
RANGE_SHOWN = {"a": False, "b": True}


def methods(cuts: ACuts) -> list[MethodInfo]:
    return [
        MethodInfo(
            key="a",
            name="Method A: K-Means + RF",
            dead_rule="probability of dead p ≥ 0.5 (frozen random forest on 22 pixel features)",
            unsure_rule=f"unsure: {UNSURE[0]} < p < {UNSURE[1]}; more than {UNSURE_FLAG_PCT:g}% unsure flags the slice",
            range_shown=RANGE_SHOWN["a"],
        ),
        MethodInfo(
            key="b",
            name="Method B: a* cut",
            dead_rule=f"smoothed redness a* < {cuts.conservative:g}",
            unsure_rule=f"borderline: {cuts.conservative:g} ≤ a* < {cuts.liberal:g}",
            range_shown=RANGE_SHOWN["b"],
        ),
    ]


LAYERS = [
    LayerInfo(key=Layer.original, kind="photo", title="Original", description="The scan as imported"),
    LayerInfo(
        key=Layer.corrected,
        kind="photo",
        title="Lighting corrected",
        description="After the paper-based lighting correction; Method A reads this image",
    ),
    LayerInfo(key=Layer.tissue, kind="mask", title="Tissue", description="Shared tissue outline, real holes removed"),
    LayerInfo(
        key=Layer.holes_removed,
        kind="mask",
        title="Holes removed",
        description="Real holes (chambers cut through) taken out of the tissue",
    ),
    LayerInfo(
        key=Layer.holes_uncertain,
        kind="mask",
        title="Uncertain holes",
        description="Might be holes; kept as tissue, they widen the range",
    ),
    LayerInfo(
        key=Layer.filled,
        kind="mask",
        title="Filled in",
        description="Enclosed gaps filled in as tissue (glare, very pale tissue)",
    ),
    LayerInfo(key=Layer.a_dead, kind="mask", title="Method A dead", description="p ≥ 0.5"),
    LayerInfo(key=Layer.a_unsure, kind="mask", title="Method A unsure", description="0.35 < p < 0.65"),
    LayerInfo(
        key=Layer.a_probability,
        kind="heatmap",
        title="Method A probability",
        description="Probability of dead for every tissue pixel",
    ),
    LayerInfo(
        key=Layer.b_tissue,
        kind="mask",
        title="Method B tissue",
        description="Method B's own outline, real holes removed",
    ),
    LayerInfo(key=Layer.b_dead, kind="mask", title="Method B dead", description="a* below the conservative cut"),
    LayerInfo(
        key=Layer.b_borderline,
        kind="mask",
        title="Method B borderline",
        description="a* between the conservative and the liberal cut",
    ),
]
