"""The demo heart (PLAN.md §1h, §1j): heart 206 from the study set, four TTC-stained slices, so someone
new can try every step (import, processing, the report, layers, export) on real scans before they have
any of their own. The walkthrough in the app imports it through the ordinary Import screen.

Read from data/ next to the engine, like the golden set; a build that leaves the data folder out has no
demo heart, and the app then skips the import steps of the walkthrough.
"""

from functools import cache
from pathlib import Path

from .schemas import DemoHeart, DemoScan

DATA = Path(__file__).resolve().parents[2] / "data"
HEART_ID = "206"
GROUP = "infarct"


@cache
def scans(folder: Path = DATA / GROUP / HEART_ID) -> dict[str, Path]:
    """The demo heart's scans by file name, in name order; empty when the folder is missing."""
    if not folder.is_dir():
        return {}
    return {p.name: p for p in sorted(folder.glob("*.tif"))}


def heart(folder: Path = DATA / GROUP / HEART_ID) -> DemoHeart | None:
    found = scans(folder)
    if not found:
        return None
    return DemoHeart(
        heart_id=HEART_ID,
        group=GROUP,
        scans=[DemoScan(name=name, size_bytes=path.stat().st_size) for name, path in found.items()],
    )
