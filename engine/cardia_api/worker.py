"""Runs inside the engine's worker processes: one slice in; result.json and layer PNGs out.

Each worker loads the frozen models once (`init`), then analyses slices with `analyse_slice`, the same
function the golden set is made with. It reports the step it is on through a queue, writes into a
temporary folder and renames it into place, so a slice folder is either complete or absent.
"""

import math
import os
import shutil
import uuid
from datetime import UTC, datetime
from pathlib import Path

from PIL import Image

from ttc_pipeline import Models, analyse_slice, read_rgb
from ttc_pipeline.method_b import ACuts

from .catalog import RANGE_SHOWN
from .layers import write_layers
from .mock import mock_analyse
from .schemas import SliceResult

_W: dict = {}  # this process's models and settings, set by init()


def init(models_dir, mock: bool, mock_delay_s: float, events) -> None:
    _W.update(
        models=None if mock else Models.load(models_dir),
        cuts=ACuts.load(models_dir),
        mock=mock,
        delay=mock_delay_s,
        events=events,
    )


def ready() -> bool:
    """A no-op the pool runs once per worker at launch, so the first slice doesn't wait for start-up."""
    return True


def model_files(files: dict) -> list[dict]:
    return [{"file": k, "version": v["model_version"], "sha256": v["sha256"]} for k, v in sorted(files.items())]


def read_dpi(path) -> tuple[float, float] | None:
    with Image.open(path) as im:
        dpi = im.info.get("dpi")
    if not dpi or len(dpi) != 2:
        return None
    x, y = float(dpi[0]), float(dpi[1])
    return (x, y) if x > 0 and y > 0 else None


def _num(x):
    return None if x is None or math.isnan(x) else float(x)


def build_result(task: dict, sa, masks: dict, shape, dpi, layers: list[str]) -> dict:
    """The slice's SliceResult as a dict."""
    n = sa.numbers()
    mm2 = (25.4 / dpi[0]) * (25.4 / dpi[1]) if dpi else None
    weight = task["weight_mg"]

    def area(px):
        return px * mm2 if mm2 else None

    def mass(pct):
        pct = _num(pct)
        return pct / 100.0 * weight if pct is not None and weight is not None else None

    models = _W["models"]
    return {
        "slice_id": task["slice_id"],
        "file_name": task["file_name"],
        "heart_id": task["heart_id"],
        "weight_mg": weight,
        "image_sha256": task["image_sha256"],
        "width_px": int(shape[1]),
        "height_px": int(shape[0]),
        "dpi": list(dpi) if dpi else None,
        "mm2_per_px": mm2,
        "analysed_at": datetime.now(UTC).isoformat(),
        "pipeline_version": task["pipeline_version"],
        "models_manifest_sha256": models.manifest_sha256 if models else None,
        "models": model_files(models.files) if models else [],
        "mock": _W["mock"],
        "tissue": {
            "tissue_px": n["tissue_px"],
            "tissue_mm2": area(n["tissue_px"]),
            "holes_removed_px": n["holes_removed_px"],
            "holes_uncertain_px": n["holes_uncertain_px"],
            "filled_px": n["filled_px"],
        },
        "method_a": {
            "dead_pct": _num(n["a_dead_pct"]),
            "dead_px": int(masks["a_dead"].sum()),
            "dead_mg": mass(n["a_dead_pct"]),
            "unsure_pct": _num(n["a_unsure_pct"]),
            "many_unsure": bool(sa.a.many_unsure),
            "range": {"low_pct": _num(n["a_low_pct"]), "high_pct": _num(n["a_high_pct"]), "shown": RANGE_SHOWN["a"]},
        },
        "method_b": {
            "tissue_px": n["b_tissue_px"],
            "tissue_mm2": area(n["b_tissue_px"]),
            "dead_pct": _num(n["b_dead_pct"]),
            "dead_px": int(masks["b_dead"].sum()),
            "dead_mg": mass(n["b_dead_pct"]),
            "borderline_pct": _num(n["b_borderline_pct"]),
            "borderline_px": int(masks["b_borderline"].sum()),
            "range": {"low_pct": _num(n["b_low_pct"]), "high_pct": _num(n["b_high_pct"]), "shown": RANGE_SHOWN["b"]},
        },
        "qc_flags": list(sa.qc_flags),
        "layers": layers,
    }


def run(task: dict) -> dict:
    """Analyse one slice. Returns {"ok": True} or {"ok": False, "error": {"code", "message"}}."""
    sid = task["slice_id"]

    def tell(stage):
        _W["events"].put((sid, stage))

    tell("reading")
    try:
        rgb = read_rgb(task["image_path"])
        dpi = read_dpi(task["image_path"])
    except Exception as e:  # noqa: BLE001 - any decoder error means the same thing to the user
        return {"ok": False, "error": {"code": "unreadable_image", "message": f"Could not read the image: {e}"}}
    try:
        if _W["mock"]:
            sa = mock_analyse(rgb, task["file_name"], _W["cuts"], _W["delay"], tell)
        else:
            sa = analyse_slice(rgb, task["file_name"], _W["models"], tell)
        tell("layers")
        slices_dir = Path(task["slices_dir"])
        tmp = slices_dir / f".tmp-{sid}-{uuid.uuid4().hex}"
        tmp.mkdir(parents=True)
        try:
            masks = sa.masks()
            layers = write_layers(tmp, rgb, sa.front_end.norm, masks, sa.a.p)
            result = SliceResult.model_validate(build_result(task, sa, masks, rgb.shape, dpi, layers))
            (tmp / "result.json").write_text(result.model_dump_json(indent=2) + "\n")
            try:
                os.replace(tmp, slices_dir / sid)
            except OSError:  # already there (same image analysed by another job): identical, keep it
                if not (slices_dir / sid / "result.json").exists():
                    raise
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    except Exception as e:  # noqa: BLE001 - reported per slice; the job goes on
        return {"ok": False, "error": {"code": "analysis_failed", "message": f"{type(e).__name__}: {e}"}}
    return {"ok": True}
