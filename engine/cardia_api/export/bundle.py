"""The ZIP bundle of a heart (PLAN.md §1e): everything needed to check or reuse the analysis elsewhere.

    cardia-heart-<label>/
      README.txt            what is in the bundle
      manifest.json         versions, model files and hashes, each slice, and the SHA-256 of every file here
      heart.json            the heart: details, slices in order, heart numbers
      slices.csv            one row per slice   (tables.py)
      heart.csv             one row for the heart
      methods.txt           the Methods paragraph for each method, headline first
      settings.json         the app settings at export time
      slices/<NN>-<name>/
        original.<ext>      the scan exactly as imported
        result.json         SliceResult
        layers/<layer>.png  every image layer

Written to a file as it goes, so a heart with many large scans never has to fit in memory.
"""

import hashlib
import json
import re
import zipfile
from datetime import UTC, datetime
from pathlib import Path

from .tables import hearts_csv, slices_csv

README = """Cardia export: heart {label}

This folder holds one heart analysed by Cardia, a research tool for measuring infarcts in
TTC-stained guinea pig heart slices. It does not diagnose anyone.

  heart.json     the heart's details, its slices in order (apex to base) and its numbers
  slices.csv     one row per slice; heart.csv: one row for the heart
                 (decimal point ".", empty cell = no value; only the ranges shown in reports are included)
  methods.txt    a Methods paragraph for each method, with the pipeline version and model hashes
  manifest.json  versions, model files with SHA-256, and the SHA-256 of every file in this folder
  settings.json  the app settings when this was exported
  slices/        per slice: the original scan, result.json and every image layer as PNG
                 (masks are white where true and transparent elsewhere)

Pipeline {pipeline}. Exported {exported}.{demo}
"""


def safe_name(text: str, fallback: str = "heart") -> str:
    """A file or folder name from user text: letters, digits, dot, dash and underscore only."""
    name = re.sub(r"[^A-Za-z0-9._-]+", "-", text).strip("-.")
    return name[:60] or fallback


def _stem(file_name: str) -> str:
    return safe_name(file_name.rsplit(".", 1)[0], "slice")


class _Zip:
    """A ZIP being written, remembering each file's SHA-256 for the manifest."""

    def __init__(self, path: Path, root: str):
        self.zf = zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6)
        self.root = root
        self.hashes: dict[str, str] = {}

    def text(self, name: str, text: str) -> None:
        data = text.encode()
        self.hashes[name] = hashlib.sha256(data).hexdigest()
        self.zf.writestr(f"{self.root}/{name}", data)

    def json(self, name: str, value) -> None:
        self.text(name, json.dumps(value, indent=2, ensure_ascii=False, default=str) + "\n")

    def file(self, name: str, src: Path) -> None:
        h = hashlib.sha256()
        with open(src, "rb") as f:
            while chunk := f.read(1 << 20):
                h.update(chunk)
        self.hashes[name] = h.hexdigest()
        # PNGs and TIFFs are already compressed (or barely compress); store them as they are.
        compress = zipfile.ZIP_STORED if src.suffix.lower() in (".png", ".jpg", ".jpeg") else zipfile.ZIP_DEFLATED
        self.zf.write(src, f"{self.root}/{name}", compress_type=compress)

    def close(self) -> None:
        self.zf.close()


def write_bundle(
    path: Path,
    heart: dict,
    results: dict[str, dict],
    images: dict[str, Path | None],
    layers: dict[str, list[tuple[str, Path]]],
    methods: list[dict],
    settings: dict,
    engine: dict,
    now: datetime | None = None,
) -> str:
    """Write the bundle to `path`; returns the folder name inside it.

    `heart`: Heart record; `results`: SliceResult by slice_id; `images`: stored original by image SHA-256;
    `layers`: (layer key, PNG path) pairs by slice_id; `methods`: methods_paragraphs(); `engine`: EngineInfo fields.
    """
    now = now or datetime.now(UTC)
    root = f"cardia-heart-{safe_name(heart['label'])}"
    z = _Zip(path, root)
    try:
        summary = heart.get("summary") or {}
        demo = any(r.get("mock") for r in results.values())
        z.text(
            "README.txt",
            README.format(
                label=heart["label"],
                pipeline=summary.get("pipeline_version") or engine.get("pipeline_version"),
                exported=now.isoformat(timespec="seconds"),
                demo="\n\nDEMO DATA: analysed in the engine's --mock mode; every number is made up." if demo else "",
            ),
        )
        z.json("heart.json", heart)
        z.text("slices.csv", slices_csv(heart, results))
        z.text("heart.csv", hearts_csv([heart]))
        z.text(
            "methods.txt",
            "\n\n".join(f"{m['name']}\n\n{m['text']}" for m in methods) + "\n",
        )
        z.json("settings.json", settings)

        slices_manifest = []
        for i, s in enumerate(heart["slices"]):
            r = results[s["slice_id"]]
            folder = f"slices/{i + 1:02d}-{_stem(r['file_name'])}"
            files = []
            original = images.get(r["image_sha256"])
            if original is not None:
                name = f"{folder}/original{original.suffix.lower()}"
                z.file(name, original)
                files.append(name)
            z.json(f"{folder}/result.json", r)
            files.append(f"{folder}/result.json")
            for key, layer in layers.get(s["slice_id"], []):
                name = f"{folder}/layers/{key}.png"
                z.file(name, layer)
                files.append(name)
            slices_manifest.append(
                {
                    "position": i + 1,
                    "slice_id": r["slice_id"],
                    "file_name": r["file_name"],
                    "image_sha256": r["image_sha256"],
                    "weight_mg": s["weight_mg"],
                    "weight_source": s["weight_source"],
                    "files": files,
                }
            )

        manifest = {
            "exported_at": now.isoformat(timespec="seconds"),
            "app": "Cardia",
            "api_version": engine.get("api_version"),
            "pipeline_version": summary.get("pipeline_version") or engine.get("pipeline_version"),
            "models_manifest_sha256": summary.get("models_manifest_sha256"),
            "models": next(iter(results.values()), {}).get("models", []),
            "demo_data": demo,
            "heart_key": heart["heart_key"],
            "heart": heart["label"],
            "slices": slices_manifest,
            # Every file above, so the bundle can be checked after it was copied around.
            "files_sha256": dict(sorted(z.hashes.items())),
        }
        z.json("manifest.json", manifest)
    finally:
        z.close()
    return root
