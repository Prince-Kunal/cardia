"""Shared test fixtures.

Parity tests need the GVSU study scans (`data/`), the notebook's saved results
(`reference/results_local/`) and, for holes, the hand-marked outlines
(`engine/annotations/holes/`). None of these is in git (the repo is public), so those tests
skip with a message when the files are missing. CONTRIBUTING.md says how to get them.
"""

from pathlib import Path

import pytest

from training.holes import LABELS_PATH, build_candidates, load_labels, notebook_tissues
from training.notebook_holes import notebook_candidates
from training.study import REPO, StudySlice, front_end, study_scans

REFERENCE_MASKS = REPO / "reference" / "results_local" / "masks"


@pytest.fixture(scope="session")
def scans() -> dict[str, Path]:
    found = study_scans()
    if len(found) != 30:
        pytest.skip(f"needs the 30 GVSU study scans in data/ (found {len(found)}); run scripts/check_data.py")
    return found


@pytest.fixture(scope="session")
def reference_masks() -> Path:
    if not REFERENCE_MASKS.is_dir():
        pytest.skip("needs the notebook's saved masks in reference/results_local/masks (ask Prince)")
    return REFERENCE_MASKS


@pytest.fixture(scope="session")
def hole_labels() -> Path:
    if not LABELS_PATH.exists():
        pytest.skip(f"needs the hand-marked hole outlines in {LABELS_PATH.relative_to(REPO)} (ask Prince)")
    return LABELS_PATH


@pytest.fixture(scope="session")
def study(scans) -> dict[str, StudySlice]:
    """The 30 study slices through lighting correction and the tissue mask, in study order."""
    return {name: front_end(path) for name, path in scans.items()}


@pytest.fixture(scope="session")
def labels(hole_labels):
    return load_labels(hole_labels)[0]


@pytest.fixture(scope="session")
def notebook_cs(study, labels):
    """Hole candidates of the notebook's recipe on all 30 slices (slow, so built once)."""
    return build_candidates(list(study.values()), labels, candidates_fn=notebook_candidates)


@pytest.fixture(scope="session")
def notebook_tissue(study, labels, notebook_cs):
    """{file name: tissue mask} exactly as the notebook saved them (its held-out hole decisions)."""
    return notebook_tissues(list(study.values()), labels, notebook_cs)
