"""What the engine tells the UI about its methods and image layers."""

from ttc_pipeline.method_a import UNSURE, UNSURE_FLAG_PCT
from ttc_pipeline.method_c import StainRatioModel

from .schemas import Layer, LayerInfo, MethodInfo

# PLAN.md §2g (decided 2026-11-23): the forests' ranges (Methods A and B) are computed but hidden. Method C's
# range (2026-11-24) is shown: where the line falls if "half the living stain" were 40% or 60% of it.
RANGE_SHOWN = {"a": False, "b": False, "c": True}
METHOD_NAMES = {"a": "Method A: K-Means + RF", "b": "Method B: DBSCAN + RF", "c": "Method C: stain ratio"}
# Saved with the settings, so a headline letter saved when it meant another method is recognised (app.py).
METHODS_MARK, METHOD_LETTERS = "methods", "a=kmeans_rf b=dbscan_rf c=stain_ratio"
FOREST_UNSURE = f"unsure: {UNSURE[0]} < p < {UNSURE[1]}"


def methods(stain: StainRatioModel) -> list[MethodInfo]:
    """In display order: the two machine-learning methods side by side, then the colour rule."""
    return [
        MethodInfo(
            key="a",
            name=METHOD_NAMES["a"],
            kind="machine_learning",
            dead_rule="probability of dead p ≥ 0.5 (frozen random forest on 22 pixel features, taught by K-Means)",
            unsure_rule=f"{FOREST_UNSURE}; more than {UNSURE_FLAG_PCT:g}% unsure flags the slice",
            range_shown=RANGE_SHOWN["a"],
        ),
        MethodInfo(
            key="b",
            name=METHOD_NAMES["b"],
            kind="machine_learning",
            dead_rule="probability of dead p ≥ 0.5 (frozen random forest on the same 22 pixel features, taught by DBSCAN)",
            unsure_rule=FOREST_UNSURE,
            range_shown=RANGE_SHOWN["b"],
        ),
        MethodInfo(
            key="c",
            name=METHOD_NAMES["c"],
            kind="colour_rule",
            dead_rule=f"less than half the red stain of living muscle, leaning cream: stain log(R/G) < {stain.s_cut:.3g} "
            f"and tint < {stain.tint_cut:.3g}° (light absorbed, shadow-proof)",
            unsure_rule=f"borderline: between 40% and 60% of the living stain (stain {stain.s_low:.3g} to {stain.s_high:.3g})",
            range_shown=RANGE_SHOWN["c"],
        ),
    ]


LAYERS = [
    LayerInfo(key=Layer.original, kind="photo", title="Original", description="The scan as imported"),
    LayerInfo(
        key=Layer.corrected,
        kind="photo",
        title="Lighting corrected",
        description="After the paper-based lighting correction; Methods A and B read this image (Method C reads it "
        "unclipped)",
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
    LayerInfo(key=Layer.b_dead, kind="mask", title="Method B dead", description="p ≥ 0.5"),
    LayerInfo(key=Layer.b_unsure, kind="mask", title="Method B unsure", description="0.35 < p < 0.65"),
    LayerInfo(
        key=Layer.b_probability,
        kind="heatmap",
        title="Method B probability",
        description="Probability of dead for every tissue pixel",
    ),
    LayerInfo(
        key=Layer.c_dead,
        kind="mask",
        title="Method C dead",
        description="Less than half the red stain of living muscle, leaning cream",
    ),
    LayerInfo(
        key=Layer.c_borderline,
        kind="mask",
        title="Method C borderline",
        description="Between 40% and 60% of the living stain",
    ),
    LayerInfo(
        key=Layer.c_stain_missing,
        kind="heatmap",
        title="Method C stain missing",
        description="Share of the living stain missing at each tissue pixel: dark = as red as living muscle, "
        "yellow = unstained",
    ),
]
