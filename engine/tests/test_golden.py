"""The engine reproduces the golden set (PLAN.md §7, tests/golden/README.md).

On the platform that generated it: identical numbers and masks. On another platform: every slice within
0.1 pp, IoU >= 0.99 on every mask, identical QC flags. Skips without reference/golden/.
"""

import json

import numpy as np
import pandas as pd
import pytest
from PIL import Image

from training.golden import GOLDEN, HASHES, MASKS, analyse, platform_tag
from ttc_pipeline import PIPELINE_VERSION, ModelFileError, Models
from ttc_pipeline.models import MANIFEST, MODELS_DIR, sha256_file

PCT_COLUMNS = [
    "a_dead_pct",
    "a_low_pct",
    "a_high_pct",
    "a_unsure_pct",
    "b_dead_pct",
    "b_low_pct",
    "b_high_pct",
    "b_borderline_pct",
]
PX_COLUMNS = ["tissue_px", "holes_removed_px", "holes_uncertain_px", "filled_px", "b_tissue_px"]


@pytest.fixture(scope="module")
def golden():
    if not (GOLDEN / "per_slice.csv").exists():
        pytest.skip("needs the golden set in reference/golden/ (or: uv run python -m training.golden)")
    return pd.read_csv(GOLDEN / "per_slice.csv", keep_default_na=False).set_index("file"), json.loads(
        (GOLDEN / "meta.json").read_text()
    )


def test_the_golden_files_are_the_listed_ones(golden):
    for line in HASHES.read_text().splitlines():
        sha, rel = line.split(None, 1)
        assert sha256_file(GOLDEN / rel) == sha, f"reference/golden/{rel} differs from tests/golden/golden.sha256"


def test_the_golden_set_matches_this_engine_version(golden):
    _, meta = golden
    assert meta["pipeline_version"] == PIPELINE_VERSION, "pipeline version changed: regenerate the golden set"
    assert meta["models_manifest_sha256"] == sha256_file(MODELS_DIR / MANIFEST), "model files changed: regenerate it"


def test_the_engine_reproduces_the_golden_set(golden, scans):
    table, meta = golden
    try:
        models = Models.load()
    except ModelFileError as e:
        pytest.skip(f"no frozen models on this machine: {e}")
    exact = meta["platform"] == platform_tag()
    for name, path in scans.items():
        row, masks = analyse(path, models)
        want = table.loc[name]
        assert row["qc_flags"] == want.qc_flags, name
        for col in PCT_COLUMNS:
            if exact:
                assert f"{row[col]:.10g}" == f"{want[col]:.10g}", (name, col)
            else:
                assert abs(row[col] - want[col]) <= 0.1, (name, col)
        if exact:
            for col in PX_COLUMNS:
                assert row[col] == want[col], (name, col)
        for k in MASKS:
            ref = np.asarray(Image.open(GOLDEN / "masks" / f"{name[:-4]}_{k}.png")) > 0
            if exact:
                assert np.array_equal(masks[k], ref), (name, k)
            elif ref.any() or masks[k].any():
                assert (masks[k] & ref).sum() / (masks[k] | ref).sum() >= 0.99, (name, k)
