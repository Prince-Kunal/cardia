"""How one run of the engine server is set up (PLAN.md §6: local only, a token per launch)."""

import os
import secrets
import sys
from dataclasses import dataclass, field
from pathlib import Path

from ttc_pipeline.models import MODELS_DIR

HOST = "127.0.0.1"  # never another interface: scans must not leave the computer
DEFAULT_PORT = 8765
DEFAULT_ORIGINS = ("http://localhost:5173", "http://127.0.0.1:5173")  # the Vite dev server (web/)
ACCEPTED_SUFFIXES = (".tif", ".tiff", ".png", ".jpg", ".jpeg")  # D1: TIFF; the others are flagged unvalidated


def default_data_dir() -> Path:
    """The app data folder: results and copies of the analysed images live here, never in the repo."""
    if env := os.environ.get("CARDIA_DATA_DIR"):
        return Path(env)
    home = Path.home()
    if sys.platform == "darwin":
        return home / "Library" / "Application Support" / "Cardia"
    if sys.platform == "win32":
        return Path(os.environ.get("APPDATA", home / "AppData" / "Roaming")) / "Cardia"
    return Path(os.environ.get("XDG_DATA_HOME", home / ".local" / "share")) / "cardia"


def default_workers() -> int:
    """Worker processes for slices: one core is left for the server and the UI; each worker needs ~450 MB."""
    return max(1, min(4, (os.cpu_count() or 2) - 1))


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    token: str = field(default_factory=lambda: secrets.token_urlsafe(32))
    allowed_origins: tuple[str, ...] = DEFAULT_ORIGINS
    allowed_hosts: tuple[str, ...] = (HOST, "localhost")
    workers: int = field(default_factory=default_workers)
    mock: bool = False  # fake analysis for building the UI: no models, no lab data (cardia_api/mock.py)
    mock_delay_s: float = 0.4  # per stage, so the UI sees progress
    max_upload_bytes: int = 200 * 2**20
    models_dir: Path = MODELS_DIR
    watch_interval_s: float = 3.0  # how often the watch folder is looked at
    # Cloud sync (PLAN.md §5): off unless the Supabase project's URL and anon key are given
    # (CARDIA_SUPABASE_URL, CARDIA_SUPABASE_ANON_KEY), or --fake-cloud syncs with one held in memory.
    cloud_url: str | None = None
    cloud_anon_key: str | None = None
    fake_cloud: bool = False
    cloud_backend: object | None = None  # tests: a backend shared by several engines
    sync_interval_s: float = 30.0
