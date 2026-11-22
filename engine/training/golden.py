"""Generate the golden set (PLAN.md §7, engine/tests/golden/README.md).

The 30 study slices through the engine exactly as the app runs them: shared front end and hole model,
Method A with the frozen forest, Method B with its own front end and the shipped cuts. Writes
reference/golden/ (derived from GVSU scans: team Drive, never git) and the list of its files' SHA-256
in engine/tests/golden/golden.sha256 (in git), so a copy can be checked.

    cd engine && uv run python -m training.golden
"""

import json
import platform
import sys

import numpy as np
import pandas as pd
from PIL import Image

from ttc_pipeline import PIPELINE_VERSION, ACuts, ForestModel, HoleModel, method_a, method_b, read_rgb, run_front_end
from ttc_pipeline.models import MANIFEST, MODELS_DIR, sha256_file

from .study import REPO, study_scans

GOLDEN = REPO / "reference" / "golden"
HASHES = REPO / "engine" / "tests" / "golden" / "golden.sha256"
MASKS = ("tissue", "holes_removed", "a_dead", "b_tissue", "b_dead", "b_borderline")


def qc_flags(path, a, holes):
    """Slice-level QC flags that need no other slice (PLAN.md §2g)."""
    flags = []
    if not str(path).lower().endswith((".tif", ".tiff")):
        flags.append("unvalidated_input")
    if a.many_unsure:
        flags.append("many_unsure")
    if holes.removed.any():
        flags.append("holes_removed")
    if holes.uncertain.any():
        flags.append("uncertain_holes")
    return ";".join(flags)


def analyse(path, hole_model, forest, cuts):
    """One slice as the app analyses it: (row of numbers, {mask name: bool array})."""
    rgb = read_rgb(path)
    fe = run_front_end(rgb, hole_model)
    a = method_a(fe.norm, fe.tissue, fe.holes.uncertain, forest)
    b = method_b(rgb, fe.holes, cuts)
    row = {
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
        "qc_flags": qc_flags(path, a, fe.holes),
    }
    masks = {
        "tissue": fe.tissue,
        "holes_removed": fe.holes.removed,
        "a_dead": a.dead,
        "b_tissue": b.tissue,
        "b_dead": b.dead,
        "b_borderline": b.borderline,
    }
    return row, masks


def platform_tag():
    return f"{platform.system()}-{platform.machine()}"


def main():
    scans = study_scans()
    assert len(scans) == 30, f"expected the 30 study scans in data/, found {len(scans)}"
    hole_model, forest, cuts = HoleModel.load(), ForestModel.load(), ACuts.load()
    (GOLDEN / "masks").mkdir(parents=True, exist_ok=True)
    rows = []
    for name, path in scans.items():
        row, masks = analyse(path, hole_model, forest, cuts)
        heart, weight = name[:3], float(name.split("IS")[1][: -len("mg.tif")])
        rows.append({"file": name, "heart": heart, "weight_mg": weight, "image_sha256": sha256_file(path), **row})
        for k, m in masks.items():
            Image.fromarray((m * 255).astype(np.uint8)).save(GOLDEN / "masks" / f"{name[:-4]}_{k}.png", optimize=False)
    df = pd.DataFrame(rows)
    df["pipeline_version"] = PIPELINE_VERSION
    df["models_manifest_sha256"] = sha256_file(MODELS_DIR / MANIFEST)
    df.to_csv(GOLDEN / "per_slice.csv", index=False, float_format="%.10g")
    meta = {
        "pipeline_version": PIPELINE_VERSION,
        "models": {"hole_model": hole_model.version, "kmeans_rf": forest.version, "a_cut": cuts.version},
        "models_manifest_sha256": sha256_file(MODELS_DIR / MANIFEST),
        "platform": platform_tag(),
        "python": sys.version.split()[0],
        "numpy": np.__version__,
    }
    (GOLDEN / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    files = sorted(p for p in GOLDEN.rglob("*") if p.is_file())
    HASHES.write_text("".join(f"{sha256_file(p)}  {p.relative_to(GOLDEN)}\n" for p in files))
    print(f"Wrote {len(df)} slices, {len(files)} files to {GOLDEN} on {meta['platform']}; hashes in {HASHES.name}")


if __name__ == "__main__":
    main()
