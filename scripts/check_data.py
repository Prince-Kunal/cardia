"""Check that data/ holds the exact study files every teammate uses.

Files are matched by name anywhere under data/ (the folder layout may differ between
machines), and each one must have the SHA-256 listed in scripts/study-data.sha256.

    python3 scripts/check_data.py            # check
    python3 scripts/check_data.py --write    # rewrite the manifest (only when the study set changes)
"""
from __future__ import annotations

import hashlib
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
MANIFEST = ROOT / "scripts" / "study-data.sha256"
WANTED = re.compile(r"^\d{3}IS[\d.]+mg\.tif$|^\d{3}InfSize(YHS)?\.out$", re.I)


def study_files() -> dict[str, Path]:
    found: dict[str, Path] = {}
    paths = [Path(d) / f for d, _, fs in os.walk(DATA, followlinks=True) for f in fs]   # data/ may hold symlinks
    for p in sorted(paths):
        if WANTED.match(p.name):
            if p.name in found:
                sys.exit(f"Duplicate file name under data/: {found[p.name]} and {p}")
            found[p.name] = p
    return found


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main() -> int:
    files = study_files()
    if "--write" in sys.argv:
        lines = [f"{sha256(p)}  {name}" for name, p in sorted(files.items())]
        MANIFEST.write_text("\n".join(lines) + "\n")
        print(f"Wrote {len(lines)} entries to {MANIFEST.relative_to(ROOT)}")
        return 0
    expected = dict(reversed(line.split(None, 1)) for line in MANIFEST.read_text().splitlines() if line.strip())
    missing = sorted(set(expected) - set(files))
    wrong = sorted(n for n in expected if n in files and sha256(files[n]) != expected[n])
    for n in missing:
        print(f"MISSING  {n}")
    for n in wrong:
        print(f"CHANGED  {n}  ({files[n]})")
    ok = len(expected) - len(missing) - len(wrong)
    print(f"{ok}/{len(expected)} study files present and identical")
    return 0 if not missing and not wrong else 1


if __name__ == "__main__":
    sys.exit(main())
