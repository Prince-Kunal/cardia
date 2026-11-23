"""Frozen model files (PLAN.md D5, §6).

The engine loads a model file only if `models/manifest.json` lists it and its SHA-256 matches, so
the same input always gives the same number and every report can name the exact model used.
All model files are in git, next to the manifest.
"""

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

import joblib
import numpy as np
import sklearn

from .config import CFG

MODELS_DIR = Path(__file__).resolve().parents[1] / "models"
MANIFEST = "manifest.json"
HOLE_MODEL_JSON = "holes/hole_model.json"
HOLE_MODEL_JOBLIB = "holes/hole_model.joblib"


class ModelFileError(RuntimeError):
    """A model file is missing, unlisted, changed, or was made for a different engine."""


def sha256_file(path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read_manifest(models_dir=MODELS_DIR) -> dict:
    path = Path(models_dir) / MANIFEST
    if not path.exists():
        return {"files": {}}
    return json.loads(path.read_text())


def verified_path(rel, models_dir=MODELS_DIR) -> Path:
    """The path of a model file, after checking it against the manifest. Raises ModelFileError otherwise."""
    entry = read_manifest(models_dir)["files"].get(rel)
    if entry is None:
        raise ModelFileError(f"models/{rel} is not listed in models/{MANIFEST}")
    path = Path(models_dir) / rel
    if not path.exists():
        raise ModelFileError(f"models/{rel} is missing. It is in git: git checkout -- engine/models/{rel}")
    actual = sha256_file(path)
    if actual != entry["sha256"]:
        raise ModelFileError(
            f"models/{rel} has SHA-256 {actual[:12]}…, but the manifest expects {entry['sha256'][:12]}…. "
            "Refusing to load a model file that is not the frozen one."
        )
    return path


@dataclass(frozen=True)
class HoleModel:
    """The shared hole model: scores a hole candidate from 0 (crease) to 1 (hole)."""

    pipeline: object  # fitted scikit-learn Pipeline(StandardScaler, LogisticRegression)
    features: list[str]
    cut: float  # at or above: a hole, removed from the tissue
    uncertain_from: float  # from here up to the cut: uncertain, kept as tissue
    info: dict  # the contents of hole_model.json

    def score(self, cands) -> np.ndarray:
        return self.pipeline.predict_proba(cands[self.features].values)[:, 1]

    @property
    def version(self) -> str:
        return self.info["model_version"]

    @classmethod
    def load(cls, models_dir=MODELS_DIR) -> HoleModel:
        info = json.loads(verified_path(HOLE_MODEL_JSON, models_dir).read_text())
        if info["sklearn_version"] != sklearn.__version__:
            raise ModelFileError(
                f"The hole model was saved with scikit-learn {info['sklearn_version']}, "
                f"but the engine runs {sklearn.__version__}. Use the pinned environment (uv sync --locked)."
            )
        if info["candidate_settings"] != CFG["holes"]:
            raise ModelFileError("The hole model was trained with different candidate settings than CFG['holes'].")
        pipeline = joblib.load(verified_path(HOLE_MODEL_JOBLIB, models_dir))
        return cls(pipeline, list(info["features"]), float(info["cut"]), float(info["uncertain_from"]), info)
