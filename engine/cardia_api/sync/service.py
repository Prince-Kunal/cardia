"""Cloud sync (PLAN.md §5): this computer's library and a cloud workspace, kept in step in the background.

Offline first. The library here is the source of truth and works with sync off, signed out or offline.
Every change is noted in the library's outbox in the same transaction (library.py); when signed in,
a background thread sends the outbox to the workspace, then pulls what others changed since last time:

  hearts         per field, the later change wins (the server's merge_heart does the same)
  slices         which heart a slice is in: the later change wins; a slice taken out is a tombstone
  results        immutable: written once, with their layer PNGs; never overwritten
  scans          only when the workspace opts in (upload_images); stored by SHA-256
  Learn progress per person, the newer copy wins (the app merges before sending)

The session and this computer's device id are kept in <data_dir>/sync.json, readable only by the user.
"""

import json
import logging
import mimetypes
import os
import socket
import threading
import time
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from ..library import Library
from ..store import Store
from .backend import AuthError, Backend, CloudError, Offline, Session

log = logging.getLogger(__name__)

PAGE = 500
OVERLAP = timedelta(minutes=2)  # re-read a little before the cursor: rows committed late are not missed
DEVICE_EVERY_S = 600


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _before(stamp: str, delta: timedelta) -> str:
    return (datetime.fromisoformat(stamp) - delta).isoformat()


class NotConfigured(CloudError):
    pass


class SyncService:
    def __init__(
        self, library: Library, store: Store, backend: Backend | None, data_dir: Path, app_version: str, interval_s=30.0
    ):
        self.library = library
        self.store = store
        self.backend = backend
        self.app_version = app_version
        self.interval_s = interval_s
        self.path = Path(data_dir) / "sync.json"
        self._lock = threading.RLock()
        self._cycle = threading.Lock()
        self._wake = threading.Event()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.session: Session | None = None
        self.workspace_id: str | None = None
        self.workspaces: list[dict] = []
        self.devices: list[dict] = []
        self.device_id = str(uuid.uuid4())
        self.device_name = socket.gethostname() or "This computer"
        self.state = "not_configured" if backend is None else "signed_out"
        self.error: str | None = None
        self.last_sync_at: str | None = None
        self._device_seen = 0.0
        self._load()

    # saved session ------------------------------------------------------------------------------

    def _load(self) -> None:
        try:
            saved = json.loads(self.path.read_text())
        except FileNotFoundError, ValueError:
            return
        self.device_id = saved.get("device_id", self.device_id)
        self.workspace_id = saved.get("workspace_id")
        if self.backend is not None and saved.get("session") and saved.get("backend") == self.backend.name:
            self.session = Session(**saved["session"])
            self.state = "syncing"

    def _save(self) -> None:
        data = {
            "device_id": self.device_id,
            "workspace_id": self.workspace_id,
            "backend": self.backend.name if self.backend else None,
            "session": self.session.to_json() if self.session else None,
        }
        tmp = self.path.with_suffix(".tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump(data, f)
        os.replace(tmp, self.path)

    # the background thread ----------------------------------------------------------------------

    def start(self) -> None:
        if self.backend is None or self._thread is not None:
            return
        self._thread = threading.Thread(target=self._run, name="cardia-sync", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._wake.set()
        if self._thread is not None:
            self._thread.join(timeout=10)
            self._thread = None

    def _run(self) -> None:
        while not self._stop.is_set():
            if self.session is not None:
                self.sync_once()
            wait = 15.0 if self.state == "offline" else self.interval_s
            self._wake.wait(wait)
            self._wake.clear()

    def wake(self) -> None:
        self._wake.set()

    # accounts and workspaces --------------------------------------------------------------------

    def _need_backend(self) -> Backend:
        if self.backend is None:
            raise NotConfigured(
                "Cloud sync is not set up on this computer: the engine needs CARDIA_SUPABASE_URL and "
                "CARDIA_SUPABASE_ANON_KEY."
            )
        return self.backend

    def sign_in(self, email: str, password: str, create_account: bool = False) -> dict:
        backend = self._need_backend()
        if create_account:
            session = backend.sign_up(email, password)
            if session is None:
                raise CloudError("Account made. Follow the link in the email we sent, then sign in here.")
        else:
            session = backend.sign_in(email, password)
        personal = backend.ensure_personal_workspace(session)
        workspaces = backend.list_workspaces(session)
        with self._lock:
            self.session = session
            self.workspaces = workspaces
            if self.workspace_id not in {w["id"] for w in workspaces}:
                self.workspace_id = personal["id"]
            self.state, self.error = "syncing", None
            self._save()
        self.wake()
        return self.status()

    def sign_out(self) -> dict:
        with self._lock:
            if self.session is not None and self.backend is not None:
                try:
                    self.backend.sign_out(self.session)
                except CloudError:
                    pass
            self.session = None
            self.workspaces, self.devices = [], []
            self.state = "not_configured" if self.backend is None else "signed_out"
            self.error = None
            self._save()
        return self.status()

    def choose_workspace(self, workspace_id: str) -> dict:
        with self._lock:
            if workspace_id not in {w["id"] for w in self.workspaces}:
                raise CloudError("You are not a member of that workspace.")
            self.workspace_id = workspace_id
            self._save()
        return self.sync_now()

    def create_workspace(self, name: str) -> dict:
        backend = self._need_backend()
        s = self._fresh_session()
        ws = backend.create_workspace(s, name)
        with self._lock:
            self.workspaces = backend.list_workspaces(s)
        return self.choose_workspace(ws["id"])

    def sync_now(self) -> dict:
        if self.session is None:
            self._need_backend()
            raise AuthError("Sign in to sync.")
        self.sync_once()
        return self.status()

    # one round ----------------------------------------------------------------------------------

    def _fresh_session(self) -> Session:
        with self._lock:
            s = self.session
            if s is None:
                raise AuthError("Sign in to sync.")
            if s.expires_at - time.time() < 120:
                s = self.backend.refresh(s.refresh_token)
                self.session = s
                self._save()
            return s

    def sync_once(self) -> None:
        """Send the outbox, then pull. Never raises: the outcome is in state and error."""
        with self._cycle:
            try:
                self._sync()
                self.state, self.error = "synced", None
                self.last_sync_at = _now()
            except Offline as e:
                self.state, self.error = "offline", str(e)
            except AuthError as e:
                with self._lock:
                    self.session = None
                    self.state, self.error = "signed_out", str(e)
                    self._save()
            except CloudError as e:
                self.state, self.error = "error", str(e)
            except Exception as e:  # a bug, not the network: keep the engine up and say so
                log.exception("sync failed")
                self.state, self.error = "error", f"Sync failed: {e}"

    def _sync(self) -> None:
        s = self._fresh_session()
        self.state = "syncing"
        self.workspaces = self.backend.list_workspaces(s)
        ws = next((w for w in self.workspaces if w["id"] == self.workspace_id), None)
        if ws is None:
            personal = self.backend.ensure_personal_workspace(s)
            self.workspaces = self.backend.list_workspaces(s)
            ws = next(w for w in self.workspaces if w["id"] == personal["id"])
            self.workspace_id = ws["id"]
            self._save()
        if ws["role"] in ("owner", "editor"):
            if not self.library.get_state(f"initial:{ws['id']}"):
                self.library.enqueue_everything()
                self.library.set_state(f"initial:{ws['id']}", True)
            self._push(s, ws)
        self._pull(s, ws)
        self._learn(s)
        if time.time() - self._device_seen > DEVICE_EVERY_S:
            self.backend.touch_device(s, self.device_id, self.device_name, self.app_version)
            self.devices = self.backend.list_devices(s)
            self._device_seen = time.time()

    def _push(self, s: Session, ws: dict) -> None:
        for _ in range(1000):  # bounded: each round sends up to 200 changes
            items = self.library.outbox(200)
            if not items:
                return
            memberships = []
            for item in items:
                kind, key = item["kind"], item["key"]
                if kind == "heart":
                    h = self.library.sync_heart(key)
                    if h is not None:
                        self.backend.merge_heart(s, ws["id"], key, h["fields"], h["times"], h["created_at"])
                elif kind == "result":
                    self._push_result(s, ws, key)
                elif kind == "image":
                    path = self.store.image_path(key)
                    if ws.get("upload_images") and path is not None:
                        kind_ = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
                        self.backend.upload(s, f"{ws['id']}/images/{path.name}", path.read_bytes(), kind_)
                elif kind == "membership":
                    m = self.library.membership(key)
                    memberships.append(
                        {
                            "slice_id": key,
                            "heart_key": m["heart_key"] if m else None,
                            "position": m["position"] if m else 0,
                            "typed_weight_mg": m["typed_weight_mg"] if m else None,
                            "changed_at": (m["changed_at"] or m["added_at"]) if m else item["at"],
                        }
                    )
                    continue
                self.library.sent(item)
            if memberships:
                self.backend.upsert_memberships(s, ws["id"], memberships)
                for item in items:
                    if item["kind"] == "membership":
                        self.library.sent(item)

    def _push_result(self, s: Session, ws: dict, slice_id: str) -> None:
        r = self.store.read_result(slice_id)
        if r is None:
            return
        layers = []
        for name in r.get("layers", []):
            path = self.store.layer_path(slice_id, name)
            if path.exists():
                self.backend.upload(s, f"{ws['id']}/results/{slice_id}/{name}.png", path.read_bytes(), "image/png")
                layers.append(name)
        self.backend.insert_result(
            s,
            ws["id"],
            {
                "slice_id": slice_id,
                "result": r,
                "image_sha256": r["image_sha256"],
                "pipeline_version": r["pipeline_version"],
                "layers": layers,
            },
        )
        if ws.get("upload_images"):
            self.library.enqueue("image", r["image_sha256"])

    def _pull(self, s: Session, ws: dict) -> None:
        for table in ("hearts", "slice_results", "heart_slices"):
            key = f"cursor:{ws['id']}:{table}"
            cursor = self.library.get_state(key)
            since = _before(cursor, OVERLAP) if cursor else None
            hold: str | None = None
            while True:
                rows = self.backend.pull(s, table, ws["id"], since, PAGE)
                for row in rows:
                    if not self._apply(s, ws, table, row) and (hold is None or row["updated_at"] < hold):
                        hold = row["updated_at"]
                if rows:
                    since = rows[-1]["updated_at"]
                if len(rows) < PAGE:
                    break
            if since is not None:
                # A row that had to wait (its heart had not arrived) is read again next time.
                self.library.set_state(key, min(since, _before(hold, timedelta(microseconds=1))) if hold else since)

    def _apply(self, s: Session, ws: dict, table: str, row: dict) -> bool:
        if table == "hearts":
            self.library.apply_remote_heart(row["heart_key"], row["details"], row["field_times"], row["created_at"])
            return True
        if table == "heart_slices":
            return self.library.apply_remote_membership(row, self.store.has_result)
        sid = row["slice_id"]
        if not self.store.has_result(sid):
            files = {"result.json": json.dumps(row["result"], indent=2).encode()}
            for name in row.get("layers") or []:
                files[f"{name}.png"] = self.backend.download(s, f"{ws['id']}/results/{sid}/{name}.png")
            self.store.put_slice(sid, files)
        sha = row["image_sha256"]
        if ws.get("upload_images") and self.store.image_path(sha) is None:
            suffix = Path(row["result"].get("file_name", "")).suffix.lower()
            try:
                self.store.put_image(f"{sha}{suffix}", self.backend.download(s, f"{ws['id']}/images/{sha}{suffix}"))
            except CloudError:
                pass  # not uploaded (yet): results and layers are enough to show the slice
        return True

    # Learn progress -----------------------------------------------------------------------------

    def get_learn_progress(self) -> dict | None:
        saved = self.library.get_state("learn_progress")
        return {"progress": saved["progress"], "updated_at": saved["updated_at"]} if saved else None

    def put_learn_progress(self, progress: dict) -> dict:
        self.library.set_state("learn_progress", {"progress": progress, "updated_at": _now(), "sent": False})
        self.wake()
        return self.get_learn_progress()

    def _learn(self, s: Session) -> None:
        local = self.library.get_state("learn_progress")
        if local and not local.get("sent"):
            self.backend.put_learn_progress(s, local["progress"])
            self.library.set_state("learn_progress", {**local, "sent": True})
            return
        remote = self.backend.get_learn_progress(s)
        if remote and (not local or remote["updated_at"] > local.get("cloud_at", "")):
            self.library.set_state(
                "learn_progress",
                {
                    "progress": remote["progress"],
                    "updated_at": remote["updated_at"],
                    "sent": True,
                    "cloud_at": remote["updated_at"],
                },
            )

    # status -------------------------------------------------------------------------------------

    def status(self) -> dict:
        with self._lock:
            ws = next((w for w in self.workspaces if w["id"] == self.workspace_id), None)
            return {
                "state": self.state,
                "backend": self.backend.name if self.backend else None,
                "email": self.session.email if self.session else None,
                "workspace": ws,
                "workspaces": list(self.workspaces),
                "read_only": bool(ws and ws["role"] == "viewer"),
                "pending": self.library.outbox_count(),
                "last_sync_at": self.last_sync_at,
                "error": self.error,
                "devices": [{**d, "this_device": d["id"] == self.device_id} for d in self.devices],
            }
