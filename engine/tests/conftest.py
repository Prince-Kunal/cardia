"""Shared test fixtures.

Parity tests need the GVSU study scans (`data/`) and the notebook's saved results
(`reference/results_local/`). Neither is in git (the repo is public), so those tests skip with
a message when the files are missing. CONTRIBUTING.md says how to get them.
"""

import os
from pathlib import Path

import pytest

from ttc_pipeline.read import STUDY_NAME

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "data"
REFERENCE_MASKS = REPO / "reference" / "results_local" / "masks"


def _study_scans() -> dict[str, Path]:
    found = {}
    for d, _, files in os.walk(DATA, followlinks=True):  # data/ may hold symlinks, any layout
        for f in files:
            if STUDY_NAME.search(f) and "new_slices" not in Path(d).parts:
                found[f] = Path(d) / f
    return dict(sorted(found.items()))


@pytest.fixture(scope="session")
def study_scans() -> dict[str, Path]:
    scans = _study_scans()
    if len(scans) != 30:
        pytest.skip(f"needs the 30 GVSU study scans in data/ (found {len(scans)}); run scripts/check_data.py")
    return scans


@pytest.fixture(scope="session")
def reference_masks() -> Path:
    if not REFERENCE_MASKS.is_dir():
        pytest.skip("needs the notebook's saved masks in reference/results_local/masks (ask Prince)")
    return REFERENCE_MASKS
