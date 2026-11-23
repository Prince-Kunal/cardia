"""Backup and restore of the whole library as one file (PLAN.md §1e). Works without an account.

    cardia-backup-<date>.zip
      manifest.json             format, versions, counts, and the SHA-256 and size of every file below
      library.sqlite3           a consistent snapshot of the library (hearts, details, settings)
      images/<sha256>.<ext>     every imported scan, as stored
      slices/<slice_id>/…       every slice's result.json and image layers

Restoring adds to the library and never overwrites: images and slice folders are copied only when
missing (both are named by their content or their inputs, so a copy that exists is the same), and a
heart is added only if its key is new, with only the slices not already filed in another heart.
Settings and the watch folder are left as they are. A backup whose files do not match its manifest
is refused whole, before anything is copied.
"""

import hashlib
import json
import os
import re
import shutil
import sqlite3
import tempfile
import uuid
import zipfile
import zlib
from datetime import UTC, datetime
from pathlib import Path

from .library import Library
from .store import CHUNK, Store

FORMAT = "cardia-backup"
VERSION = 1
LIBRARY = "library.sqlite3"
IMAGE = re.compile(r"^images/[0-9a-f]{64}\.[a-z0-9]{1,5}$")
SLICE_FILE = re.compile(r"^slices/([0-9a-f]{24})/([A-Za-z0-9_-]{1,64}\.(?:json|png))$")
# Far beyond any real library, but a stop for a hostile or broken file that claims endless sizes.
MAX_TOTAL_BYTES = 64 * 2**30


class BadBackup(Exception):
    """Not a Cardia backup, or one that was damaged: nothing was restored."""


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(CHUNK):
            h.update(chunk)
    return h.hexdigest()


def write_backup(path: Path, library: Library, store: Store, versions: dict) -> dict:
    """Write the backup to `path`. Returns its manifest."""
    files: list[dict] = []
    with tempfile.TemporaryDirectory(prefix="cardia-backup-") as tmp:
        snapshot = Path(tmp) / LIBRARY
        library.snapshot(snapshot)
        entries: list[tuple[str, Path]] = [(LIBRARY, snapshot)]
        entries += [(f"images/{p.name}", p) for p in sorted(store.images.iterdir()) if IMAGE.match(f"images/{p.name}")]
        slices = 0
        for d in sorted(store.slices.iterdir()):
            inside = [(f"slices/{d.name}/{f.name}", f) for f in sorted(d.iterdir()) if f.is_file()]
            inside = [(name, f) for name, f in inside if SLICE_FILE.match(name)]
            if inside:
                slices += 1
                entries += inside
        with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
            for name, src in entries:
                # PNG and JPEG are compressed already; deflating them again only costs time.
                stored = src.suffix.lower() in {".png", ".jpg", ".jpeg"}
                zf.write(src, name, compress_type=zipfile.ZIP_STORED if stored else zipfile.ZIP_DEFLATED)
                files.append({"path": name, "sha256": _sha256(src), "bytes": src.stat().st_size})
            manifest = {
                "format": FORMAT,
                "version": VERSION,
                "created_at": datetime.now(UTC).isoformat(),
                **versions,
                "counts": {
                    "hearts": library.count_hearts(),
                    "slices": slices,
                    "images": sum(1 for f in files if f["path"].startswith("images/")),
                },
                "files": files,
            }
            zf.writestr("manifest.json", json.dumps(manifest, indent=2))
    return manifest


def _read_manifest(zf: zipfile.ZipFile) -> dict:
    try:
        manifest = json.loads(zf.read("manifest.json"))
    except KeyError, ValueError:
        raise BadBackup("This is not a Cardia backup: it has no manifest.") from None
    if manifest.get("format") != FORMAT:
        raise BadBackup("This is not a Cardia backup.")
    if manifest.get("version") != VERSION:
        raise BadBackup(
            f"This backup was made by a newer Cardia (format {manifest.get('version')}). Update the app first."
        )
    return manifest


def _check(zf: zipfile.ZipFile, manifest: dict) -> dict[str, dict]:
    """Every listed file is allowed, present, of the stated size, and nothing else is in the ZIP."""
    listed: dict[str, dict] = {}
    for f in manifest.get("files", []):
        name = f.get("path", "")
        if not (name == LIBRARY or IMAGE.match(name) or SLICE_FILE.match(name)):
            raise BadBackup(f"The backup lists a file Cardia does not restore: {name!r}.")
        listed[name] = f
    if LIBRARY not in listed:
        raise BadBackup("The backup has no library in it.")
    in_zip = {i.filename: i for i in zf.infolist() if not i.is_dir()}
    extra = set(in_zip) - set(listed) - {"manifest.json"}
    if extra:
        raise BadBackup(f"The backup holds files its manifest does not list ({len(extra)}).")
    total = 0
    for name, f in listed.items():
        info = in_zip.get(name)
        if info is None:
            raise BadBackup(f"The backup is missing {name}.")
        if info.file_size != f.get("bytes"):
            raise BadBackup(f"{name} is not the size the manifest says.")
        total += info.file_size
    if total > MAX_TOTAL_BYTES:
        raise BadBackup("The backup is larger than Cardia restores.")
    return listed


def _extract(zf: zipfile.ZipFile, name: str, expected: dict, dest: Path) -> None:
    """Copy one file out, checking its size and SHA-256 as it streams."""
    h, n = hashlib.sha256(), 0
    try:
        with zf.open(name) as src, open(dest, "wb") as out:
            while chunk := src.read(CHUNK):
                n += len(chunk)
                if n > expected["bytes"]:
                    raise BadBackup(f"{name} is larger than the manifest says.")
                h.update(chunk)
                out.write(chunk)
    except zipfile.BadZipFile, zlib.error, EOFError, NotImplementedError:
        raise BadBackup(f"{name} is damaged: it cannot be read from the backup.") from None
    if n != expected["bytes"] or h.hexdigest() != expected["sha256"]:
        raise BadBackup(f"{name} is damaged: its SHA-256 does not match the manifest.")


def _check_library(path: Path) -> None:
    """The backup's library opens, passes SQLite's own check and has the tables a restore reads."""
    try:
        db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            (ok,) = db.execute("PRAGMA quick_check").fetchone()
            db.execute("SELECT heart_key, label, created_at FROM hearts LIMIT 1").fetchall()
            db.execute("SELECT slice_id, heart_key, position FROM heart_slices LIMIT 1").fetchall()
        finally:
            db.close()
    except sqlite3.DatabaseError:
        ok = None
    if ok != "ok":
        raise BadBackup("The library inside the backup is damaged.")


def restore_backup(path: Path, library: Library, store: Store) -> dict:
    """Add a backup's hearts, slices and images to this library. Returns what was added and skipped."""
    try:
        zf = zipfile.ZipFile(path)
    except zipfile.BadZipFile, OSError:
        raise BadBackup("This file is not a ZIP, so it is not a Cardia backup.") from None
    with zf, tempfile.TemporaryDirectory(prefix="cardia-restore-", dir=store.root) as tmp:
        manifest = _read_manifest(zf)
        listed = _check(zf, manifest)
        staged = Path(tmp)
        # First check and unpack everything into a staging folder: a damaged backup changes nothing.
        for name, f in listed.items():
            dest = staged / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            _extract(zf, name, f, dest)
        _check_library(staged / LIBRARY)
        images = slices = 0
        for src in sorted((staged / "images").glob("*")) if (staged / "images").exists() else []:
            final = store.images / src.name
            if not final.exists():
                os.replace(src, final)
                images += 1
        for d in sorted((staged / "slices").iterdir()) if (staged / "slices").exists() else []:
            final = store.slices / d.name
            if final.exists():
                continue
            # Move the folder in whole, so a slice is never half there.
            tmp_dir = store.slices / f".restore-{d.name}-{uuid.uuid4().hex}"
            shutil.move(str(d), tmp_dir)
            os.replace(tmp_dir, final)
            slices += 1
        try:
            merged = library.merge_from(staged / LIBRARY, has_result=store.has_result)
        except ValueError as e:
            raise BadBackup(str(e)) from None
    return {
        "hearts_added": merged["hearts_added"],
        "hearts_skipped": merged["hearts_skipped"],
        "slices_added": merged["slices_added"],
        "slice_results_copied": slices,
        "images_copied": images,
        "backup_created_at": manifest.get("created_at"),
    }
