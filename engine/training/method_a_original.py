"""Reading the notebook's frozen Method A model (`final_model_K_Means_RF.joblib`) safely.

The file is a pickle saved from the notebook. Unpickling can run code, and this one refers to a class
defined in the notebook itself (`__main__.KMeansLabeller`). So it is opened only if its SHA-256 is the
known one, and through an unpickler that allows only classes (and a few array-rebuilding functions)
from numpy, scikit-learn, scipy and joblib, with a stand-in for the notebook's class.
"""

import hashlib
import pickle
from contextlib import contextmanager
from pathlib import Path
from typing import ClassVar

import joblib
from joblib import numpy_pickle

from .study import REPO

SOURCE = REPO / "reference" / "results_local" / "final_model_K_Means_RF.joblib"
SOURCE_SHA256 = "0b29fbe79217803b68a51e8eef2af8dcaa7a8f8be502fbc89d1aca9eaa1300a1"  # Melove's file, 2026-11-19

ALLOWED_ROOTS = {"numpy", "sklearn", "scipy", "joblib"}
ALLOWED_FUNCTIONS = {
    ("numpy._core.multiarray", "_reconstruct"),
    ("numpy._core.multiarray", "scalar"),
    ("numpy.core.multiarray", "_reconstruct"),
    ("numpy.core.multiarray", "scalar"),
    ("copyreg", "_reconstructor"),
}
ALLOWED_BUILTINS = {"object", "dict", "list", "tuple", "set", "frozenset", "int", "float", "str", "bool", "bytes"}


class NotebookKMeansLabeller:
    """Stand-in for the notebook's `KMeansLabeller` (Step 34): holds its fitted state (`km`, `live`, `dead`)."""


class UnsafeModelFile(RuntimeError):
    pass


class _GuardedUnpickler(numpy_pickle.NumpyUnpickler):
    requested: ClassVar[set[str]] = set()  # every global the file asked for, for auditing

    def find_class(self, module, name):
        self.requested.add(f"{module}.{name}")
        if (module, name) == ("__main__", "KMeansLabeller"):
            return NotebookKMeansLabeller
        if module == "builtins" and name in ALLOWED_BUILTINS:
            return super().find_class(module, name)
        if (module, name) in ALLOWED_FUNCTIONS:
            return super().find_class(module, name)
        if module.split(".")[0] in ALLOWED_ROOTS:
            obj = super().find_class(module, name)
            if isinstance(obj, type):
                return obj
        raise UnsafeModelFile(f"the model file asks for {module}.{name}, which is not on the allow-list")


@contextmanager
def _guarded():
    original = numpy_pickle.NumpyUnpickler
    numpy_pickle.NumpyUnpickler = _GuardedUnpickler
    try:
        yield
    finally:
        numpy_pickle.NumpyUnpickler = original


def load_notebook_model(path=SOURCE, sha256=SOURCE_SHA256):
    """The notebook's model dict {method, labeller, rf, cut, feat, post, pca, cfg, features}."""
    raw = Path(path).read_bytes()
    actual = hashlib.sha256(raw).hexdigest()
    if actual != sha256:
        raise UnsafeModelFile(f"{path} has SHA-256 {actual[:12]}…, expected {sha256[:12]}…")
    _GuardedUnpickler.requested = set()
    with _guarded():
        try:
            return joblib.load(path)
        except pickle.UnpicklingError as e:
            raise UnsafeModelFile(str(e)) from e
