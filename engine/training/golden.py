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
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

from ttc_pipeline import PIPELINE_VERSION, Models, analyse_slice, read_rgb
from ttc_pipeline.models import sha256_file

from .study import REPO, study_scans

GOLDEN = REPO / "reference" / "golden"
HASHES = REPO / "engine" / "tests" / "golden" / "golden.sha256"
MASKS = ("tissue", "holes_removed", "a_dead", "b_tissue", "b_dead", "b_borderline")


def analyse(path, models: Models):
    """One slice as the app analyses it: (row of numbers, {mask name: bool array})."""
    sa = analyse_slice(read_rgb(path), Path(path).name, models)
    masks = sa.masks()
    return sa.numbers(), {k: masks[k] for k in MASKS}


def platform_tag():
    return f"{platform.system()}-{platform.machine()}"


def main():
    scans = study_scans()
    assert len(scans) == 30, f"expected the 30 study scans in data/, found {len(scans)}"
    models = Models.load()
    (GOLDEN / "masks").mkdir(parents=True, exist_ok=True)
    rows = []
    for name, path in scans.items():
        row, masks = analyse(path, models)
        heart, weight = name[:3], float(name.split("IS")[1][: -len("mg.tif")])
        rows.append({"file": name, "heart": heart, "weight_mg": weight, "image_sha256": sha256_file(path), **row})
        for k, m in masks.items():
            Image.fromarray((m * 255).astype(np.uint8)).save(GOLDEN / "masks" / f"{name[:-4]}_{k}.png", optimize=False)
    df = pd.DataFrame(rows)
    df["pipeline_version"] = PIPELINE_VERSION
    df["models_manifest_sha256"] = models.manifest_sha256
    df.to_csv(GOLDEN / "per_slice.csv", index=False, float_format="%.10g")
    meta = {
        "pipeline_version": PIPELINE_VERSION,
        "models": {
            "hole_model": models.holes.version,
            "kmeans_rf": models.forest.version,
            "a_cut": models.cuts.version,
        },
        "models_manifest_sha256": models.manifest_sha256,
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
