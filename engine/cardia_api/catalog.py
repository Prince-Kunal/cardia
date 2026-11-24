"""What the engine tells the UI about its methods and image layers."""

from ttc_pipeline.method_a import UNSURE, UNSURE_FLAG_PCT
from ttc_pipeline.method_b import StainRatioModel

from .schemas import Layer, LayerInfo, MethodInfo

# PLAN.md §2g (decided 2026-11-23): Method A's range is computed but hidden. Method B's range (2026-11-24) is
# shown: where the line falls if "half the living stain" were 40% or 60% of it.
RANGE_SHOWN = {"a": False, "b": True}
METHOD_NAMES = {"a": "Method A: K-Means + RF", "b": "Method B: stain ratio"}


def methods(stain: StainRatioModel) -> list[MethodInfo]:
    return [
        MethodInfo(
            key="b",
            name=METHOD_NAMES["b"],
            dead_rule=f"less than half the red stain of living muscle, leaning cream: stain log(R/G) < {stain.s_cut:.3g} "
            f"and tint < {stain.tint_cut:.3g}° (light absorbed, shadow-proof)",
            unsure_rule=f"borderline: between 40% and 60% of the living stain (stain {stain.s_low:.3g} to {stain.s_high:.3g})",
            range_shown=RANGE_SHOWN["b"],
        ),
        MethodInfo(
            key="a",
            name=METHOD_NAMES["a"],
            dead_rule="probability of dead p ≥ 0.5 (frozen random forest on 22 pixel features)",
            unsure_rule=f"unsure: {UNSURE[0]} < p < {UNSURE[1]}; more than {UNSURE_FLAG_PCT:g}% unsure flags the slice",
            range_shown=RANGE_SHOWN["a"],
        ),
    ]


LAYERS = [
    LayerInfo(key=Layer.original, kind="photo", title="Original", description="The scan as imported"),
    LayerInfo(
        key=Layer.corrected,
        kind="photo",
        title="Lighting corrected",
        description="After the paper-based lighting correction; Method A reads this image (Method B reads it unclipped)",
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
        key=Layer.b_dead,
        kind="mask",
        title="Method B dead",
        description="Less than half the red stain of living muscle, leaning cream",
    ),
    LayerInfo(
        key=Layer.b_borderline,
        kind="mask",
        title="Method B borderline",
        description="Between 40% and 60% of the living stain",
    ),
    LayerInfo(
        key=Layer.b_stain_missing,
        kind="heatmap",
        title="Method B stain missing",
        description="Share of the living stain missing at each tissue pixel: dark = as red as living muscle, "
        "yellow = unstained",
    ),
]
