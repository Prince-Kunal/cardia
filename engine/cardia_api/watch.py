"""The watch folder (PLAN.md §1a): scans saved into a chosen folder are imported automatically.

The engine looks at the folder (and its subfolders) every few seconds. A file is imported once its size
and modification time are the same on two looks in a row, so a scan still being written is left alone.
Files already in the folder when it is chosen are not imported (drop them on the window instead). The
new files of one look go into one job with source "watch_folder". A file changed later is imported again.
"""

import logging
import os
import threading
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

from .library import Library
from .settings import ACCEPTED_SUFFIXES

log = logging.getLogger("cardia.watch")
BASELINE_KEY = "_watch_baseline"  # the folder whose existing files were recorded as seen


def list_scans(root: Path) -> dict[str, tuple[int, int]]:
    """{absolute path: (size, mtime_ns)} of every accepted file under root, hidden files and folders skipped."""
    found = {}
    for folder, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for name in files:
            if name.startswith(".") or not name.lower().endswith(ACCEPTED_SUFFIXES):
                continue
            path = os.path.join(folder, name)
            try:
                st = os.stat(path)
            except OSError:
                continue
            found[path] = (st.st_size, st.st_mtime_ns)
    return found


class Watcher:
    def __init__(self, library: Library, import_paths: Callable[[list[Path]], str], interval_s: float):
        self.library = library
        self.import_paths = import_paths  # starts a job for these files; returns its ID
        self.interval_s = interval_s
        self._pending: dict[str, tuple[int, int]] = {}  # new files seen once, waiting to be seen unchanged
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._state, self._folder, self._last_scan, self._imported, self._last_job = "off", None, None, 0, None

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, name="cardia-watch", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=10)

    def _run(self) -> None:
        while not self._stop.wait(self.interval_s):
            try:
                self.scan_once()
            except Exception:
                log.exception("watch folder scan failed")

    def status(self) -> dict:
        return {
            "state": self._state,
            "folder": self._folder,
            "last_scan_at": self._last_scan,
            "files_imported": self._imported,
            "last_job_id": self._last_job,
        }

    def scan_once(self) -> str | None:
        """Look at the folder once; returns the ID of the job started, if any."""
        with self._lock:
            settings = self.library.get_settings()
            folder, enabled = settings.get("watch_folder"), settings.get("watch_enabled", False)
            self._folder = folder
            if not (enabled and folder):
                self._state, self._pending = "off", {}
                return None
            root = Path(folder)
            if not root.is_dir():
                self._state = "folder_missing"
                return None
            self._state, self._last_scan = "watching", datetime.now(UTC)
            files = list_scans(root)
            if settings.get(BASELINE_KEY) != folder:  # a new folder: what is already there is not new
                self.library.mark_watched(files, reset=True)
                self.library.set_settings({BASELINE_KEY: folder})
                self._pending = {}
                return None
            seen = self.library.watched()
            ready, pending = [], {}
            for path, sig in files.items():
                if seen.get(path) == sig:
                    continue
                if self._pending.get(path) == sig:
                    ready.append(path)
                else:
                    pending[path] = sig
            self._pending = pending
            if not ready:
                return None
            ready.sort()
            job_id = self.import_paths([Path(p) for p in ready])
            self.library.mark_watched({p: files[p] for p in ready})
            self._imported += len(ready)
            self._last_job = job_id
            return job_id
