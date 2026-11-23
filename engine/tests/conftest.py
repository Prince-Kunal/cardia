"""Shared test fixtures.

Parity tests need the GVSU study scans (`data/`), the notebook's saved results
(`reference/results_local/`) and, for holes, the hand-marked outlines (`engine/annotations/holes/`),
all in git. Method B's parity test also needs the research repo at `reference/research-repo`
(CONTRIBUTING.md). Tests skip with a message when files are missing.
"""

import json
from pathlib import Path

import pytest

from training.golden import GOLDEN, platform_tag
from training.holes import LABELS_PATH, build_candidates, load_labels, notebook_tissues
from training.notebook_holes import notebook_candidates
from training.study import REPO, StudySlice, front_end, study_scans

REFERENCE_MASKS = REPO / "reference" / "results_local" / "masks"


@pytest.fixture(scope="session")
def on_reference_platform() -> bool:
    """True on the platform the models and the golden set were made on (reference/golden/meta.json).

    There, training and analysis must be bit-identical; on other platforms PLAN.md §7's tolerances apply,
    because the linear algebra libraries differ in the last bits.
    """
    meta = GOLDEN / "meta.json"
    return meta.exists() and json.loads(meta.read_text())["platform"] == platform_tag()


@pytest.fixture(scope="session")
def scans() -> dict[str, Path]:
    found = study_scans()
    if len(found) != 30:
        pytest.skip(f"needs the 30 GVSU study scans in data/ (found {len(found)}); run scripts/check_data.py")
    return found


@pytest.fixture(scope="session")
def reference_masks() -> Path:
    if not REFERENCE_MASKS.is_dir():
        pytest.skip("needs the notebook's saved masks in reference/results_local/masks")
    return REFERENCE_MASKS


@pytest.fixture(scope="session")
def hole_labels() -> Path:
    if not LABELS_PATH.exists():
        pytest.skip(f"needs the hand-marked hole outlines in {LABELS_PATH.relative_to(REPO)}")
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
