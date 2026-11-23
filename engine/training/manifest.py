"""Writing model files and their entries in models/manifest.json."""

import json

from ttc_pipeline.models import MANIFEST, MODELS_DIR, read_manifest, sha256_file

DESCRIPTION = (
    "Every model file the engine loads, with its SHA-256. The engine refuses a file that is missing or differs."
)


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2) + "\n")


def update_manifest(entries, models_dir=MODELS_DIR):
    """`entries`: {path relative to models/: {"model_version": ...}}; the SHA-256 is filled in."""
    files = read_manifest(models_dir)["files"]
    for rel, meta in entries.items():
        files[rel] = {"sha256": sha256_file(models_dir / rel), **meta}
    write_json(models_dir / MANIFEST, {"description": DESCRIPTION, "files": dict(sorted(files.items()))})
