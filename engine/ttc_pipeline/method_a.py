"""Method A "K-Means + RF" (reference notebook Parts G and L; PLAN.md §2e).

Every tissue pixel gets 22 numbers (colour, neighbourhood colour at 4 sizes, texture, edge strength,
distance from the slice edge); the frozen random forest turns them into a probability of dead, p.
Dead = p >= 0.5. K-Means is used only in training, never here.

One change from the notebook: the forest predicts with one thread. With several threads it adds the
trees' votes in whatever order the threads finish, which can change the last bit of p from run to run.
"""

import json
from dataclasses import dataclass

import cv2
import joblib
import numpy as np
import sklearn

from .color import to_lab
from .models import MODELS_DIR, ModelFileError, verified_path

FEATURE_NAMES = (
    ["L", "a", "b", "S", "V", "r_chrom", "g_chrom"]
    + [f"{c}_s{s}" for s in (1, 2, 4, 8) for c in ("L", "a", "b")]
    + ["L_std3", "grad1.5", "rim_dist"]
)
COLOUR_COLS = [FEATURE_NAMES.index(c) for c in ("L_s1", "a_s1", "b_s1")]  # the colour space K-Means used
RF_JSON = "kmeans_rf/kmeans_rf.json"
RF_JOBLIB = "kmeans_rf/kmeans_rf.joblib"
UNSURE = (0.35, 0.65)  # p strictly between these is unsure
UNSURE_FLAG_PCT = 15.0  # more unsure tissue than this flags the slice


def masked_blur(x, m, s):
    """Average over tissue-only neighbourhoods, so the paper never bleeds into the slice edge."""
    m = m.astype(np.float32)
    return cv2.GaussianBlur(x * m, (0, 0), s) / np.maximum(cv2.GaussianBlur(m, (0, 0), s), 1e-3)


def pixel_features(norm_img, tissue):
    """22 numbers per tissue pixel (rows in tissue-pixel order), as notebook Step 28."""
    lab = to_lab(norm_img)
    hsv = cv2.cvtColor(norm_img, cv2.COLOR_RGB2HSV).astype(np.float32)
    rgb = norm_img.astype(np.float32)
    ssum = rgb.sum(-1) + 1
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    maps = [L, a, b, hsv[..., 1] / 255, hsv[..., 2] / 255, rgb[..., 0] / ssum, rgb[..., 1] / ssum]
    for sg in (1, 2, 4, 8):
        maps += [masked_blur(L, tissue, sg), masked_blur(a, tissue, sg), masked_blur(b, tissue, sg)]
    mu, mu2 = masked_blur(L, tissue, 3), masked_blur(L * L, tissue, 3)
    maps.append(np.sqrt(np.clip(mu2 - mu * mu, 0, None)))
    Lb = cv2.GaussianBlur(L, (0, 0), 1.5)
    maps.append(np.hypot(cv2.Sobel(Lb, cv2.CV_32F, 1, 0), cv2.Sobel(Lb, cv2.CV_32F, 0, 1)))
    maps.append(cv2.distanceTransform(tissue.astype(np.uint8), cv2.DIST_L2, 5) / np.sqrt(tissue.sum()))
    return np.stack(maps, -1)[tissue].astype(np.float32)


def apply_cut(p, cut):
    """Rescale probabilities so that 'p >= cut' becomes 'p >= 0.5' (identity at cut 0.5)."""
    p = np.asarray(p, np.float32)
    return np.where(p < cut, 0.5 * p / cut, 0.5 + 0.5 * (p - cut) / (1 - cut)).astype(np.float32)


@dataclass(frozen=True)
class ForestModel:
    """A frozen random forest on the 22 pixel features (Method A's, or Method B's)."""

    rf: object  # fitted RandomForestClassifier
    cut: float
    info: dict  # the contents of its .json (kmeans_rf.json or dbscan_rf.json)

    @property
    def version(self) -> str:
        return self.info["model_version"]

    def dead_probability(self, features):
        col = list(self.rf.classes_).index(1)  # class 1 = dead
        return apply_cut(self.rf.predict_proba(features)[:, col], self.cut)

    @classmethod
    def load(cls, models_dir=MODELS_DIR, json_rel=RF_JSON, joblib_rel=RF_JOBLIB, name="Method A") -> ForestModel:
        """A frozen forest on the 22 pixel features: Method A's by default, Method B's with its file names."""
        info = json.loads(verified_path(json_rel, models_dir).read_text())
        if info["sklearn_version"] != sklearn.__version__:
            raise ModelFileError(
                f"The {name} forest was saved with scikit-learn {info['sklearn_version']}, "
                f"but the engine runs {sklearn.__version__}. Use the pinned environment (uv sync --locked)."
            )
        if info["features"] != FEATURE_NAMES:
            raise ModelFileError(f"The {name} forest expects different pixel features than the engine computes.")
        rf = joblib.load(verified_path(joblib_rel, models_dir))
        rf.n_jobs = 1  # add the trees' votes in a fixed order, so p is bit-identical on every run
        return cls(rf, float(info["cut"]), info)


@dataclass(frozen=True)
class ForestResult:
    """One forest method's slice result (Method A, and Method B, which reads the same way)."""

    p: np.ndarray  # probability of dead per pixel (NaN outside the tissue)
    dead: np.ndarray  # p >= 0.5, inside the tissue
    dead_pct: float
    unsure_pct: float  # 0.35 < p < 0.65
    low_pct: float  # p >= 0.65, uncertain holes counted as holes
    high_pct: float  # p >= 0.35, uncertain holes counted as tissue
    many_unsure: bool  # more than 15% of the tissue is unsure


def _pct(part, whole):
    n = int(whole.sum())
    return 100.0 * float((part & whole).sum()) / n if n else float("nan")


MethodA = ForestResult


def summarise_a(p_tissue, tissue, uncertain_holes, dead_threshold=0.5) -> ForestResult:
    """A forest method's slice numbers from the dead probability of each tissue pixel (in tissue-pixel order)."""
    p = np.full(tissue.shape, np.nan, np.float32)
    p[tissue] = p_tissue
    dead = tissue & (p >= dead_threshold)
    unsure = tissue & (p > UNSURE[0]) & (p < UNSURE[1])
    unsure_pct = _pct(unsure, tissue)
    return ForestResult(
        p=p,
        dead=dead,
        dead_pct=_pct(dead, tissue),
        unsure_pct=unsure_pct,
        low_pct=_pct(tissue & (p >= UNSURE[1]), tissue & ~uncertain_holes),
        high_pct=_pct(tissue & (p >= UNSURE[0]), tissue),
        many_unsure=unsure_pct > UNSURE_FLAG_PCT,
    )


def method_a(norm_img, tissue, uncertain_holes, model: ForestModel, dead_threshold=0.5) -> ForestResult:
    """Method A on one lighting-corrected photo. `tissue` has removed holes taken out; uncertain holes are in it."""
    return summarise_a(
        model.dead_probability(pixel_features(norm_img, tissue)), tissue, uncertain_holes, dead_threshold
    )
