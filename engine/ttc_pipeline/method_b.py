"""Method B "DBSCAN + RF" (GVSU_Infarct_Pipeline_dbscan_search.ipynb, "Tuned DBSCAN + RF"; 2026-11-25).

Reads a slice exactly as Method A does: the same 22 numbers per tissue pixel go into a frozen random forest,
which gives a probability of dead, p. Dead = p >= 0.5; unsure = 0.35 < p < 0.65.

Only the forest's teacher differs. Method A's forest learned from K-Means groups of pixel colours; Method B's
learned from DBSCAN groups (dense crowds of similar colours), with DBSCAN's settings picked on the study hearts
(`training/method_b.py`, `training/export_method_b.py`). DBSCAN is used only in training, never here.
"""

from .method_a import ForestModel, ForestResult, pixel_features, summarise_a
from .models import MODELS_DIR

DBSCAN_RF_JSON = "dbscan_rf/dbscan_rf.json"
DBSCAN_RF_JOBLIB = "dbscan_rf/dbscan_rf.joblib"

MethodB = ForestResult


def load_dbscan_forest(models_dir=MODELS_DIR) -> ForestModel:
    return ForestModel.load(models_dir, DBSCAN_RF_JSON, DBSCAN_RF_JOBLIB, "Method B")


def method_b(norm_img, tissue, uncertain_holes, model: ForestModel, features=None) -> ForestResult:
    """Method B on one lighting-corrected photo; `features` (from Method A) saves computing them twice."""
    if features is None:
        features = pixel_features(norm_img, tissue)
    return summarise_a(model.dead_probability(features), tissue, uncertain_holes)
