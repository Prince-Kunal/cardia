"""Heart numbers and heart records for the API, from stored slice results and the library."""

from datetime import datetime, timedelta

from ttc_pipeline import heart_numbers

from .catalog import RANGE_SHOWN
from .library import TRASH_DAYS
from .schemas import Heart, HeartSummary
from .store import Store


class MixedVersions(Exception):
    """The slices were analysed with different pipeline versions or models, so they can't be combined."""


def _nan(x):
    return float("nan") if x is None else x


def _row(r: dict, weight_mg: float | None) -> dict:
    a, b = r["method_a"], r["method_b"] or {"dead_pct": None, "borderline_pct": None, "range": {}}
    return {
        "weight_mg": weight_mg,
        "tissue_px": r["tissue"]["tissue_px"],
        "a_dead_pct": _nan(a["dead_pct"]),
        "a_unsure_pct": _nan(a["unsure_pct"]),
        "a_low_pct": _nan(a["range"]["low_pct"]),
        "a_high_pct": _nan(a["range"]["high_pct"]),
        "b_dead_pct": _nan(b["dead_pct"]),
        "b_borderline_pct": _nan(b["borderline_pct"]),
        "b_low_pct": _nan(b["range"].get("low_pct")),
        "b_high_pct": _nan(b["range"].get("high_pct")),
    }


def summarise(results: list[dict], weights: list[float | None], heart_id: str | None = None) -> HeartSummary:
    """Heart numbers (PLAN.md §2g) from slice results and each slice's weight (None if unknown)."""
    if len({(r["pipeline_version"], r["models_manifest_sha256"]) for r in results}) > 1:
        raise MixedVersions("These slices were analysed with different pipeline versions or models.")
    hn = heart_numbers([_row(r, w) for r, w in zip(results, weights, strict=True)])
    has_b = all(r["method_b"] is not None for r in results)
    flags = list(hn.flags) + (["mixed_heart_ids"] if len({r["heart_id"] for r in results}) > 1 else [])
    return HeartSummary(
        heart_id=heart_id or results[0]["heart_id"],
        slice_ids=[r["slice_id"] for r in results],
        weighting=hn.weighting,
        total_weight_mg=hn.total_weight_mg,
        flags=flags,
        pipeline_version=results[0]["pipeline_version"],
        models_manifest_sha256=results[0]["models_manifest_sha256"],
        mock=results[0]["mock"],
        method_a={
            "dead_pct": hn.pct["a_dead_pct"],
            "dead_mg": hn.a_dead_mg,
            "unsure_pct": hn.pct["a_unsure_pct"],
            "range": {"low_pct": hn.pct["a_low_pct"], "high_pct": hn.pct["a_high_pct"], "shown": RANGE_SHOWN["a"]},
        },
        method_b={
            "dead_pct": hn.pct["b_dead_pct"],
            "dead_mg": hn.b_dead_mg,
            "borderline_pct": hn.pct["b_borderline_pct"],
            "range": {"low_pct": hn.pct["b_low_pct"], "high_pct": hn.pct["b_high_pct"], "shown": RANGE_SHOWN["b"]},
        }
        if has_b
        else None,
    )


def heart_record(heart: dict, store: Store) -> Heart:
    """A library heart (Library.get_heart) with its slices' numbers and the heart numbers."""
    slices, results, weights = [], [], []
    for s in heart["slices"]:
        r = store.read_result(s["slice_id"])
        if r is None:  # the result folder was removed by hand: leave the slice out
            continue
        typed = s["typed_weight_mg"]
        weight = typed if typed is not None else r["weight_mg"]
        source = "typed" if typed is not None else ("file_name" if r["weight_mg"] is not None else None)
        slices.append(
            {
                "slice_id": r["slice_id"],
                "position": s["position"],
                "file_name": r["file_name"],
                "weight_mg": weight,
                "weight_source": source,
                "method_a_dead_pct": r["method_a"]["dead_pct"],
                "method_b_dead_pct": (r["method_b"] or {}).get("dead_pct"),
                "qc_flags": r["qc_flags"],
            }
        )
        results.append(r)
        weights.append(weight)
    try:
        summary = summarise(results, weights, heart["label"]) if results else None
    except MixedVersions:
        summary = None
    deleted = heart["deleted_at"]
    purge = (datetime.fromisoformat(deleted) + timedelta(days=TRASH_DAYS)).isoformat() if deleted else None
    fields = {k: v for k, v in heart.items() if k != "slices"}
    return Heart.model_validate({**fields, "purge_after": purge, "slices": slices, "summary": summary})
