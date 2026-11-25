"""CSV exports (PLAN.md §1e): one row per slice of a heart, and one row per heart of the library.

Numbers always use "." as the decimal mark and no thousands separator, whatever the computer's language
(PLAN.md §4), so the files open the same in Excel, Prism, R and Python. Missing values are empty cells.
A method's range is exported only where reports show it (PLAN.md §2g: for now Method B's only).
"""

import csv
import io

from ..catalog import RANGE_SHOWN

DIGITS = 4


def _num(x):
    if x is None:
        return ""
    if isinstance(x, bool):
        return "true" if x else "false"
    if isinstance(x, int):
        return str(x)
    return f"{round(float(x), DIGITS):.{DIGITS}f}".rstrip("0").rstrip(".")


def _cell(x):
    if x is None:
        return ""
    if isinstance(x, (int, float)):
        return _num(x)
    if isinstance(x, (list, tuple)):
        return ";".join(str(v) for v in x)
    return str(x)


def _write(columns: list[str], rows: list[dict]) -> str:
    out = io.StringIO()
    w = csv.writer(out, lineterminator="\n")
    w.writerow(columns)
    for row in rows:
        w.writerow([_cell(row.get(c)) for c in columns])
    return out.getvalue()


def _range_columns(method: str) -> list[str]:
    return [f"{method}_low_pct", f"{method}_high_pct"] if RANGE_SHOWN[method] else []


SLICE_COLUMNS = (
    [
        "heart",
        "position",
        "file_name",
        "weight_mg",
        "weight_source",
        "tissue_px",
        "tissue_mm2",
        "holes_removed_px",
        "holes_uncertain_px",
        "filled_px",
        "a_dead_pct",
        "a_dead_mg",
        "a_unsure_pct",
    ]
    + _range_columns("a")
    + ["b_dead_pct", "b_dead_mg", "b_unsure_pct"]
    + _range_columns("b")
    + ["c_dead_pct", "c_dead_mg", "c_borderline_pct"]
    + _range_columns("c")
    + [
        "qc_flags",
        "dpi",
        "pipeline_version",
        "models_manifest_sha256",
        "image_sha256",
        "slice_id",
        "analysed_at",
        "demo_data",
    ]
)


def _dead_mg(pct, weight):
    return None if pct is None or weight is None else pct / 100 * weight


def slice_rows(heart: dict, results: dict[str, dict]) -> list[dict]:
    """`heart`: a Heart record (dict); `results`: SliceResult dicts by slice_id."""
    rows = []
    for i, s in enumerate(heart["slices"]):
        r = results[s["slice_id"]]
        a, b, c, t = r["method_a"], r["method_b"] or {}, r.get("method_c") or {}, r["tissue"]
        weight = s["weight_mg"]
        dpi = r.get("dpi")
        rows.append(
            {
                "heart": heart["label"],
                "position": i + 1,
                "file_name": r["file_name"],
                "weight_mg": weight,
                "weight_source": s["weight_source"],
                "tissue_px": t["tissue_px"],
                "tissue_mm2": t["tissue_mm2"],
                "holes_removed_px": t["holes_removed_px"],
                "holes_uncertain_px": t["holes_uncertain_px"],
                "filled_px": t["filled_px"],
                "a_dead_pct": a["dead_pct"],
                "a_dead_mg": _dead_mg(a["dead_pct"], weight),
                "a_unsure_pct": a["unsure_pct"],
                "a_low_pct": a["range"]["low_pct"],
                "a_high_pct": a["range"]["high_pct"],
                "b_dead_pct": b.get("dead_pct"),
                "b_dead_mg": _dead_mg(b.get("dead_pct"), weight),
                "b_unsure_pct": b.get("unsure_pct"),
                "b_low_pct": (b.get("range") or {}).get("low_pct"),
                "b_high_pct": (b.get("range") or {}).get("high_pct"),
                "c_dead_pct": c.get("dead_pct"),
                "c_dead_mg": _dead_mg(c.get("dead_pct"), weight),
                "c_borderline_pct": c.get("borderline_pct"),
                "c_low_pct": (c.get("range") or {}).get("low_pct"),
                "c_high_pct": (c.get("range") or {}).get("high_pct"),
                "qc_flags": r["qc_flags"],
                "dpi": "x".join(_num(v) for v in dpi) if dpi else None,
                "pipeline_version": r["pipeline_version"],
                "models_manifest_sha256": r["models_manifest_sha256"],
                "image_sha256": r["image_sha256"],
                "slice_id": r["slice_id"],
                "analysed_at": r["analysed_at"],
                "demo_data": r["mock"],
            }
        )
    return rows


def slices_csv(heart: dict, results: dict[str, dict]) -> str:
    return _write(SLICE_COLUMNS, slice_rows(heart, results))


HEART_COLUMNS = (
    [
        "heart",
        "group",
        "experiment_date",
        "operator",
        "ischemia_min",
        "reperfusion_min",
        "heart_weight_mg",
        "tags",
        "slices",
        "total_slice_weight_mg",
        "weighting",
        "flags",
        "a_dead_pct",
        "a_dead_mg",
        "a_unsure_pct",
    ]
    + _range_columns("a")
    + ["b_dead_pct", "b_dead_mg", "b_unsure_pct"]
    + _range_columns("b")
    + ["c_dead_pct", "c_dead_mg", "c_borderline_pct"]
    + _range_columns("c")
    + ["pipeline_version", "models_manifest_sha256", "demo_data", "notes", "heart_key"]
)


def heart_row(heart: dict) -> dict:
    s = heart.get("summary") or {}
    a, b, c = s.get("method_a") or {}, s.get("method_b") or {}, s.get("method_c") or {}
    return {
        "heart": heart["label"],
        "group": heart["group"],
        "experiment_date": heart["experiment_date"],
        "operator": heart["operator"],
        "ischemia_min": heart["ischemia_min"],
        "reperfusion_min": heart["reperfusion_min"],
        "heart_weight_mg": heart["heart_weight_mg"],
        "tags": heart["tags"],
        "slices": len(heart["slices"]),
        "total_slice_weight_mg": s.get("total_weight_mg"),
        "weighting": s.get("weighting"),
        # Without a summary the slices can't be combined (different pipeline versions).
        "flags": s.get("flags") if s else ["mixed_versions"] if heart["slices"] else [],
        "a_dead_pct": a.get("dead_pct"),
        "a_dead_mg": a.get("dead_mg"),
        "a_unsure_pct": a.get("unsure_pct"),
        "a_low_pct": (a.get("range") or {}).get("low_pct"),
        "a_high_pct": (a.get("range") or {}).get("high_pct"),
        "b_dead_pct": b.get("dead_pct"),
        "b_dead_mg": b.get("dead_mg"),
        "b_unsure_pct": b.get("unsure_pct"),
        "b_low_pct": (b.get("range") or {}).get("low_pct"),
        "b_high_pct": (b.get("range") or {}).get("high_pct"),
        "c_dead_pct": c.get("dead_pct"),
        "c_dead_mg": c.get("dead_mg"),
        "c_borderline_pct": c.get("borderline_pct"),
        "c_low_pct": (c.get("range") or {}).get("low_pct"),
        "c_high_pct": (c.get("range") or {}).get("high_pct"),
        "pipeline_version": s.get("pipeline_version"),
        "models_manifest_sha256": s.get("models_manifest_sha256"),
        "demo_data": s.get("mock") if s else None,
        "notes": heart["notes"],
        "heart_key": heart["heart_key"],
    }


def hearts_csv(hearts: list[dict]) -> str:
    return _write(HEART_COLUMNS, [heart_row(h) for h in hearts])
