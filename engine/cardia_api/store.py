"""The engine's data folder: copies of analysed images and each slice's result and layers.

    <data_dir>/images/<sha256>.<ext>          every imported image, stored once by content
    <data_dir>/slices/<slice_id>/result.json  SliceResult
    <data_dir>/slices/<slice_id>/<layer>.png
    <data_dir>/engine.json                    while running: URL, token and PID, readable only by this user

Slice folders never change once written: a slice_id names one image, file name, pipeline and model set.
Results written by an older pipeline are read through `upgrade`, which hides what has been retired.
The library (SQLite, milestone 2) will index this folder.
"""

import hashlib
import json
import os
import uuid
from pathlib import Path

from .schemas import Layer

CHUNK = 1 << 20


# Pipeline 0.5.x stored the stain ratio as Method B; since 0.6.0 it is Method C. Its layer files keep their
# old names on disk.
LEGACY_C_LAYERS = {"c_dead": "b_dead", "c_borderline": "b_borderline", "c_stain_missing": "b_stain_missing"}


def _stored_shape(result: dict) -> str:
    """Which contract a stored result was written with, from its shape (demo results all say "mock", so the
    pipeline version can't tell): "a_star_cut" (before 0.5.0: Method B was the retired a* cut, with its own
    tissue_px), "stain_ratio_as_b" (0.5.x) or "current"."""
    b = result.get("method_b")
    if isinstance(b, dict) and "tissue_px" in b:
        return "a_star_cut"
    if isinstance(b, dict) and "borderline_pct" in b:
        return "stain_ratio_as_b"
    return "current"


def upgrade(result: dict) -> dict:
    """A stored result as the current contract shows it. The files stay on disk untouched; re-importing the scan
    analyses it with the current pipeline.

    * Before 0.5.0, "method_b" was the retired a* cut and 0.4.0's "method_c" the retired stain hue. Neither is
      shown: both become null and their layers are dropped.
    * In 0.5.x, "method_b" was the stain ratio. It is shown as Method C (its layers too); Method B (DBSCAN + RF)
      is null until the scan is re-imported."""
    r = dict(result)
    shape = _stored_shape(r)
    layers = list(r.get("layers", []))
    if shape == "a_star_cut":
        r["method_b"], r["method_c"] = None, None
        layers = [k for k in layers if not k.startswith(("b_", "c_"))]
    elif shape == "stain_ratio_as_b":
        r["method_b"], r["method_c"] = None, r["method_b"]
        back = {old: new for new, old in LEGACY_C_LAYERS.items()}
        layers = [back.get(k, k) for k in layers if not k.startswith(("b_", "c_")) or k in back]
    r.setdefault("method_b", None)
    r.setdefault("method_c", None)
    known = {layer.value for layer in Layer}
    r["layers"] = [k for k in layers if k in known]
    return r


class FileTooLarge(Exception):
    pass


class Store:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.images = self.root / "images"
        self.slices = self.root / "slices"

    def open(self) -> None:
        self.images.mkdir(parents=True, exist_ok=True)
        self.slices.mkdir(parents=True, exist_ok=True)

    def save_upload(self, src, suffix: str, limit: int) -> tuple[str, Path]:
        """Copy a file object into images/, hashing it on the way. Returns (sha256, stored path)."""
        tmp = self.images / f".upload-{uuid.uuid4().hex}"
        h, n = hashlib.sha256(), 0
        try:
            with open(tmp, "wb") as out:
                while chunk := src.read(CHUNK):
                    n += len(chunk)
                    if n > limit:
                        raise FileTooLarge
                    h.update(chunk)
                    out.write(chunk)
            sha = h.hexdigest()
            final = self.images / f"{sha}{suffix}"
            if final.exists():
                tmp.unlink()
            else:
                os.replace(tmp, final)
            return sha, final
        finally:
            tmp.unlink(missing_ok=True)

    def slice_dir(self, slice_id: str) -> Path:
        return self.slices / slice_id

    def has_result(self, slice_id: str) -> bool:
        return (self.slice_dir(slice_id) / "result.json").exists()

    def read_result(self, slice_id: str) -> dict | None:
        path = self.slice_dir(slice_id) / "result.json"
        return upgrade(json.loads(path.read_text())) if path.exists() else None

    def list_results(self) -> list[dict]:
        found = [
            upgrade(json.loads(p.read_text()))
            for p in self.slices.glob("*/result.json")
            if not p.parent.name.startswith(".")
        ]
        return sorted(found, key=lambda r: r["analysed_at"], reverse=True)

    def image_path(self, sha256: str) -> Path | None:
        """The stored copy of an imported image, whatever its extension; None if it is gone."""
        return next(iter(sorted(self.images.glob(f"{sha256}.*"))), None)

    def layer_path(self, slice_id: str, layer: str) -> Path:
        """The PNG of a layer as the current contract names it (0.5.x results keep Method C's old file names)."""
        path = self.slice_dir(slice_id) / f"{layer}.png"
        if layer in LEGACY_C_LAYERS and not path.exists():
            raw = self.slice_dir(slice_id) / "result.json"
            if raw.exists() and _stored_shape(json.loads(raw.read_text())) == "stain_ratio_as_b":
                return self.slice_dir(slice_id) / f"{LEGACY_C_LAYERS[layer]}.png"
        return path

    def put_slice(self, slice_id: str, files: dict[str, bytes]) -> bool:
        """Write a slice folder that came from elsewhere (cloud sync): result.json and its layers, all
        at once, so a slice is never half there. False if the slice is here already."""
        final = self.slice_dir(slice_id)
        if final.exists():
            return False
        tmp = self.slices / f".sync-{slice_id}-{uuid.uuid4().hex}"
        tmp.mkdir()
        try:
            for name, data in files.items():
                (tmp / name).write_bytes(data)
            os.replace(tmp, final)
        except BaseException:
            for p in tmp.glob("*"):
                p.unlink()
            tmp.rmdir()
            raise
        return True

    def put_image(self, name: str, data: bytes) -> bool:
        """Store an image that came from elsewhere under its content name (<sha256>.<ext>), if missing."""
        final = self.images / name
        if final.exists():
            return False
        tmp = self.images / f".sync-{uuid.uuid4().hex}"
        tmp.write_bytes(data)
        os.replace(tmp, final)
        return True
