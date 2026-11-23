"""The library: hearts, their slices and what the user typed about them, in SQLite (PLAN.md §1b, §1e).

Slice results stay as files (store.py); the library only files them into hearts and keeps the
experiment details, typed weights, tags, favourites, settings and the watch folder's memory.

A finished slice joins the heart with the same label (the heart ID from its file name, or one typed
at import) among hearts not in the trash, so new slices of heart 206 join the existing heart 206.
A slice belongs to one heart at a time. Deleting a heart moves it to the trash; after 30 days it is
removed for good (its slice results stay on disk).
"""

import json
import sqlite3
import threading
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

TRASH_DAYS = 30
SCHEMA = """
CREATE TABLE IF NOT EXISTS hearts (
    heart_key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    grp TEXT,
    ischemia_min REAL,
    reperfusion_min REAL,
    experiment_date TEXT,
    operator TEXT,
    heart_weight_mg REAL,
    notes TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    favourite INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS heart_slices (
    slice_id TEXT PRIMARY KEY,
    heart_key TEXT NOT NULL REFERENCES hearts(heart_key) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    typed_weight_mg REAL,
    added_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS heart_slices_by_heart ON heart_slices(heart_key, position);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS watched_files (
    path TEXT PRIMARY KEY,
    size INTEGER NOT NULL,
    mtime_ns INTEGER NOT NULL,
    seen_at TEXT NOT NULL
);
"""
# API field name -> column
DETAILS = {
    "label": "label",
    "group": "grp",
    "ischemia_min": "ischemia_min",
    "reperfusion_min": "reperfusion_min",
    "experiment_date": "experiment_date",
    "operator": "operator",
    "heart_weight_mg": "heart_weight_mg",
    "notes": "notes",
    "tags": "tags",
    "favourite": "favourite",
}


def _now() -> str:
    return datetime.now(UTC).isoformat()


class Library:
    def __init__(self, path: Path):
        self.path = Path(path)
        self._lock = threading.RLock()
        self._db: sqlite3.Connection | None = None

    def open(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.path, check_same_thread=False, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript(SCHEMA)
        self._db = db
        self.purge_trash()

    def close(self) -> None:
        if self._db is not None:
            self._db.close()
            self._db = None

    def _tx(self):
        """`with self._tx() as db:` runs a transaction, one writer at a time."""
        lib = self

        class _Tx:
            def __enter__(self):
                lib._lock.acquire()
                lib._db.execute("BEGIN IMMEDIATE")
                return lib._db

            def __exit__(self, exc_type, *_):
                try:
                    lib._db.execute("ROLLBACK" if exc_type else "COMMIT")
                finally:
                    lib._lock.release()

        return _Tx()

    # hearts ------------------------------------------------------------------------------------

    def add_slice(self, slice_id: str, label: str, typed_weight_mg: float | None = None) -> str:
        """File a finished slice into the heart with this label (made if needed); returns the heart key."""
        with self._tx() as db:
            row = db.execute("SELECT heart_key FROM heart_slices WHERE slice_id = ?", (slice_id,)).fetchone()
            if row is not None:
                if typed_weight_mg is not None:
                    db.execute(
                        "UPDATE heart_slices SET typed_weight_mg = ? WHERE slice_id = ?", (typed_weight_mg, slice_id)
                    )
                return row["heart_key"]
            heart = db.execute(
                "SELECT heart_key FROM hearts WHERE label = ? AND deleted_at IS NULL ORDER BY created_at LIMIT 1",
                (label,),
            ).fetchone()
            now = _now()
            if heart is None:
                key = uuid.uuid4().hex
                db.execute(
                    "INSERT INTO hearts (heart_key, label, created_at, updated_at) VALUES (?, ?, ?, ?)",
                    (key, label, now, now),
                )
            else:
                key = heart["heart_key"]
            (pos,) = db.execute(
                "SELECT COALESCE(MAX(position) + 1, 0) FROM heart_slices WHERE heart_key = ?", (key,)
            ).fetchone()
            db.execute(
                "INSERT INTO heart_slices (slice_id, heart_key, position, typed_weight_mg, added_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (slice_id, key, pos, typed_weight_mg, now),
            )
            db.execute("UPDATE hearts SET updated_at = ? WHERE heart_key = ?", (now, key))
            return key

    def _heart(self, db, row) -> dict:
        slices = db.execute(
            "SELECT slice_id, position, typed_weight_mg FROM heart_slices WHERE heart_key = ? ORDER BY position",
            (row["heart_key"],),
        ).fetchall()
        heart = {api: row[col] for api, col in DETAILS.items()}
        heart["tags"] = json.loads(heart["tags"])
        heart["favourite"] = bool(heart["favourite"])
        heart |= {
            "heart_key": row["heart_key"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "deleted_at": row["deleted_at"],
            "slices": [dict(s) for s in slices],
        }
        return heart

    def get_heart(self, heart_key: str) -> dict | None:
        with self._lock:
            row = self._db.execute("SELECT * FROM hearts WHERE heart_key = ?", (heart_key,)).fetchone()
            return None if row is None else self._heart(self._db, row)

    def list_hearts(self, q=None, group=None, tag=None, favourite=None, trash=False) -> list[dict]:
        """Hearts, most recently changed first. `q` matches label, group, operator, notes and tags."""
        sql = ["SELECT * FROM hearts WHERE deleted_at IS " + ("NOT NULL" if trash else "NULL")]
        args: list = []
        if q:
            like = f"%{q.lower()}%"
            sql.append(
                "AND (lower(label) LIKE ? OR lower(COALESCE(grp, '')) LIKE ? OR lower(COALESCE(operator, '')) LIKE ? "
                "OR lower(COALESCE(notes, '')) LIKE ? OR lower(tags) LIKE ?)"
            )
            args += [like] * 5
        if group is not None:
            sql.append("AND grp = ?")
            args.append(group)
        if favourite is not None:
            sql.append("AND favourite = ?")
            args.append(int(favourite))
        sql.append("ORDER BY updated_at DESC")
        with self._lock:
            hearts = [self._heart(self._db, r) for r in self._db.execute(" ".join(sql), args).fetchall()]
        return [h for h in hearts if tag is None or tag in h["tags"]]

    def update_heart(self, heart_key: str, details: dict, slices: list[dict] | None = None) -> dict | None:
        """Change details (API field names) and, if given, the slice order and typed weights.

        `slices`: the heart's new slice list in order, each {slice_id, weight_mg}; slices left out are
        detached from the heart (their results stay on disk). Raises ValueError for a slice not in it.
        """
        with self._tx() as db:
            if db.execute("SELECT 1 FROM hearts WHERE heart_key = ?", (heart_key,)).fetchone() is None:
                return None
            sets, args = [], []
            for field, value in details.items():
                sets.append(f"{DETAILS[field]} = ?")
                if field == "tags":
                    value = json.dumps(sorted(set(value)))
                elif field == "favourite":
                    value = int(value)
                elif field == "experiment_date" and value is not None:
                    value = value.isoformat()
                args.append(value)
            if slices is not None:
                current = {
                    r["slice_id"]
                    for r in db.execute("SELECT slice_id FROM heart_slices WHERE heart_key = ?", (heart_key,))
                }
                wanted = [s["slice_id"] for s in slices]
                if not set(wanted) <= current or len(set(wanted)) != len(wanted):
                    raise ValueError("List each of the heart's own slices at most once.")
                for sid in current - set(wanted):
                    db.execute("DELETE FROM heart_slices WHERE slice_id = ?", (sid,))
                for pos, s in enumerate(slices):
                    db.execute(
                        "UPDATE heart_slices SET position = ?, typed_weight_mg = ? WHERE slice_id = ?",
                        (pos, s.get("weight_mg"), s["slice_id"]),
                    )
            sets.append("updated_at = ?")
            args += [_now(), heart_key]
            db.execute(
                f"UPDATE hearts SET {', '.join(sets)} WHERE heart_key = ?", args
            )  # columns from DETAILS only; values bound
        return self.get_heart(heart_key)

    def trash_heart(self, heart_key: str, restore=False) -> dict | None:
        with self._tx() as db:
            when = None if restore else _now()
            cur = db.execute(
                "UPDATE hearts SET deleted_at = ?, updated_at = ? WHERE heart_key = ?", (when, _now(), heart_key)
            )
            if cur.rowcount == 0:
                return None
        return self.get_heart(heart_key)

    def purge_trash(self, now: datetime | None = None) -> int:
        """Remove hearts that have been in the trash for more than 30 days."""
        cutoff = ((now or datetime.now(UTC)) - timedelta(days=TRASH_DAYS)).isoformat()
        with self._tx() as db:
            return db.execute("DELETE FROM hearts WHERE deleted_at IS NOT NULL AND deleted_at < ?", (cutoff,)).rowcount

    # backup and restore ------------------------------------------------------------------------

    def count_hearts(self) -> int:
        with self._lock:
            (n,) = self._db.execute("SELECT COUNT(*) FROM hearts").fetchone()
        return n

    def snapshot(self, path: Path) -> None:
        """Copy the library, consistent as of now, into a new SQLite file (for a backup)."""
        with self._lock:
            dst = sqlite3.connect(path)
            try:
                self._db.backup(dst)
            finally:
                dst.close()

    def merge_from(self, path: Path, has_result=lambda slice_id: True) -> dict:
        """Add another library's hearts (a restored backup). Never overwrites: a heart is added only if
        its key is new, with its slices that are not filed in a heart here already and whose results
        exist. Settings and the watch folder's memory are left alone."""
        src = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        src.row_factory = sqlite3.Row
        added = skipped = slices_added = 0
        try:
            try:
                hearts = src.execute("SELECT * FROM hearts").fetchall()
                members = src.execute("SELECT * FROM heart_slices ORDER BY heart_key, position").fetchall()
            except sqlite3.DatabaseError as e:
                raise ValueError(f"The backup's library could not be read: {e}") from None
            by_heart: dict[str, list] = {}
            for m in members:
                by_heart.setdefault(m["heart_key"], []).append(m)
            columns = ["heart_key", "label", *[c for c in DETAILS.values() if c != "label"]]
            columns += ["created_at", "updated_at", "deleted_at"]
            with self._tx() as db:
                for h in hearts:
                    if db.execute("SELECT 1 FROM hearts WHERE heart_key = ?", (h["heart_key"],)).fetchone():
                        skipped += 1
                        continue
                    new = [
                        m
                        for m in by_heart.get(h["heart_key"], [])
                        if has_result(m["slice_id"])
                        and not db.execute("SELECT 1 FROM heart_slices WHERE slice_id = ?", (m["slice_id"],)).fetchone()
                    ]
                    if by_heart.get(h["heart_key"]) and not new:
                        skipped += 1  # every slice of it is already in another heart here
                        continue
                    db.execute(
                        f"INSERT INTO hearts ({', '.join(columns)}) VALUES ({', '.join('?' * len(columns))})",
                        [h[c] for c in columns],
                    )  # columns are this schema's own names; values bound
                    for m in new:
                        db.execute(
                            "INSERT INTO heart_slices (slice_id, heart_key, position, typed_weight_mg, added_at) "
                            "VALUES (?, ?, ?, ?, ?)",
                            (m["slice_id"], m["heart_key"], m["position"], m["typed_weight_mg"], m["added_at"]),
                        )
                    added += 1
                    slices_added += len(new)
        finally:
            src.close()
        return {"hearts_added": added, "hearts_skipped": skipped, "slices_added": slices_added}

    # settings and the watch folder's memory ----------------------------------------------------

    def get_settings(self) -> dict:
        with self._lock:
            return {r["key"]: json.loads(r["value"]) for r in self._db.execute("SELECT key, value FROM settings")}

    def set_settings(self, values: dict) -> None:
        with self._tx() as db:
            for k, v in values.items():
                db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, json.dumps(v)))

    def watched(self) -> dict[str, tuple[int, int]]:
        with self._lock:
            rows = self._db.execute("SELECT path, size, mtime_ns FROM watched_files").fetchall()
        return {r["path"]: (r["size"], r["mtime_ns"]) for r in rows}

    def mark_watched(self, files: dict[str, tuple[int, int]], reset=False) -> None:
        with self._tx() as db:
            if reset:
                db.execute("DELETE FROM watched_files")
            now = _now()
            db.executemany(
                "INSERT OR REPLACE INTO watched_files (path, size, mtime_ns, seen_at) VALUES (?, ?, ?, ?)",
                [(p, size, mtime, now) for p, (size, mtime) in files.items()],
            )
