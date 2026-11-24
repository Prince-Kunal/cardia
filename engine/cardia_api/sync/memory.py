"""A cloud held in memory, with the same rules as the Supabase schema (cloud/supabase/migrations/):
workspaces with roles, per-field merging of heart details, immutable results, server-set update times.

Two uses: tests sync two engines through one MemoryBackend, and `python -m cardia_api --fake-cloud`
lets the sync screens be tried before the team has a Supabase project. Nothing is kept on disk.
"""

import threading
import time
import uuid
from datetime import UTC, datetime, timedelta

from .backend import AuthError, CloudError, Offline, Session


class MemoryBackend:
    name = "memory"

    def __init__(self):
        self._lock = threading.RLock()
        self.users: dict[str, dict] = {}  # email -> {id, password}
        self.tokens: dict[str, str] = {}  # access token -> user id
        self.refresh_tokens: dict[str, str] = {}
        self.workspaces: dict[str, dict] = {}
        self.members: dict[tuple[str, str], str] = {}  # (workspace, user) -> role
        self.tables: dict[str, dict[tuple, dict]] = {"hearts": {}, "heart_slices": {}, "slice_results": {}}
        self.files: dict[str, bytes] = {}
        self.learn: dict[str, dict] = {}
        self.devices: dict[str, dict] = {}
        self.online = True  # tests turn the network off
        self._clock = datetime.now(UTC)

    # helpers ------------------------------------------------------------------------------------

    def _now(self) -> str:
        # Strictly increasing, like a server clock seen through updated_at.
        self._clock = max(self._clock + timedelta(microseconds=1), datetime.now(UTC))
        return self._clock.isoformat()

    def _user(self, s: Session) -> str:
        if not self.online:
            raise Offline("The cloud could not be reached (offline).")
        uid = self.tokens.get(s.access_token)
        if uid is None:
            raise AuthError("Your cloud sign-in has expired or was refused. Sign in again.")
        return uid

    def _role(self, ws: str, uid: str) -> str | None:
        return self.members.get((ws, uid))

    def _can_write(self, ws: str, uid: str) -> None:
        if self._role(ws, uid) not in ("owner", "editor"):
            raise CloudError("The cloud said: permission denied for this workspace")

    def _session(self, uid: str, email: str) -> Session:
        access, refresh = uuid.uuid4().hex, uuid.uuid4().hex
        self.tokens[access] = uid
        self.refresh_tokens[refresh] = uid
        return Session(access, refresh, time.time() + 3600, uid, email)

    # accounts -----------------------------------------------------------------------------------

    def sign_up(self, email: str, password: str) -> Session | None:
        with self._lock:
            if email.lower() in self.users:
                raise CloudError("The cloud said: User already registered")
            self.users[email.lower()] = {"id": str(uuid.uuid4()), "password": password}
            return self._session(self.users[email.lower()]["id"], email)

    def sign_in(self, email: str, password: str) -> Session:
        with self._lock:
            u = self.users.get(email.lower())
            if u is None or u["password"] != password:
                raise AuthError("That email and password don't match a Cardia account.")
            return self._session(u["id"], email)

    def refresh(self, refresh_token: str) -> Session:
        with self._lock:
            uid = self.refresh_tokens.pop(refresh_token, None)
            if uid is None:
                raise AuthError("Your cloud sign-in has expired. Sign in again.")
            email = next(e for e, u in self.users.items() if u["id"] == uid)
            return self._session(uid, email)

    def sign_out(self, s: Session) -> None:
        with self._lock:
            self.tokens.pop(s.access_token, None)
            self.refresh_tokens.pop(s.refresh_token, None)

    # workspaces ---------------------------------------------------------------------------------

    def _create(self, uid: str, name: str, kind: str) -> dict:
        ws = {"id": str(uuid.uuid4()), "name": name, "kind": kind, "upload_images": False, "created_by": uid}
        self.workspaces[ws["id"]] = ws
        self.members[(ws["id"], uid)] = "owner"
        return dict(ws)

    def ensure_personal_workspace(self, s: Session) -> dict:
        with self._lock:
            uid = self._user(s)
            for ws in self.workspaces.values():
                if ws["kind"] == "personal" and ws["created_by"] == uid:
                    return dict(ws)
            return self._create(uid, "Personal", "personal")

    def list_workspaces(self, s: Session) -> list[dict]:
        with self._lock:
            uid = self._user(s)
            return [{**self.workspaces[ws], "role": role} for (ws, u), role in self.members.items() if u == uid]

    def create_workspace(self, s: Session, name: str) -> dict:
        with self._lock:
            return self._create(self._user(s), name, "lab")

    def add_member(self, owner: Session, ws: str, email: str, role: str) -> None:
        """For tests: an owner adds someone by email (Supabase: rpc add_member)."""
        with self._lock:
            if self._role(ws, self._user(owner)) != "owner":
                raise CloudError("The cloud said: only an owner can add people")
            self.members[(ws, self.users[email.lower()]["id"])] = role

    # the library --------------------------------------------------------------------------------

    def merge_heart(self, s, ws, key, fields, times, created) -> None:
        with self._lock:
            uid = self._user(s)
            self._can_write(ws, uid)
            rows = self.tables["hearts"]
            cur = rows.get((ws, key))
            if cur is None:
                rows[(ws, key)] = {
                    "workspace_id": ws,
                    "heart_key": key,
                    "details": dict(fields),
                    "field_times": dict(times),
                    "created_at": created,
                    "updated_at": self._now(),
                }
                return
            changed = False
            for f, v in fields.items():
                if times.get(f, "") > cur["field_times"].get(f, ""):
                    cur["details"][f] = v
                    cur["field_times"][f] = times[f]
                    changed = True
            if changed:
                cur["updated_at"] = self._now()

    def upsert_memberships(self, s, ws, rows) -> None:
        with self._lock:
            uid = self._user(s)
            self._can_write(ws, uid)
            for r in rows:
                self.tables["heart_slices"][(ws, r["slice_id"])] = {**r, "workspace_id": ws, "updated_at": self._now()}

    def insert_result(self, s, ws, row) -> None:
        with self._lock:
            uid = self._user(s)
            self._can_write(ws, uid)
            self.tables["slice_results"].setdefault(
                (ws, row["slice_id"]), {**row, "workspace_id": ws, "updated_at": self._now()}
            )

    def upload(self, s, path, data, content_type) -> None:
        with self._lock:
            uid = self._user(s)
            self._can_write(path.split("/", 1)[0], uid)
            self.files[path] = bytes(data)

    def download(self, s, path) -> bytes:
        with self._lock:
            uid = self._user(s)
            if self._role(path.split("/", 1)[0], uid) is None:
                raise CloudError("The cloud said: permission denied for this workspace")
            if path not in self.files:
                raise CloudError("The cloud said: Object not found")
            return self.files[path]

    def pull(self, s, table, ws, since, limit) -> list[dict]:
        with self._lock:
            uid = self._user(s)
            if self._role(ws, uid) is None:
                raise CloudError("The cloud said: permission denied for this workspace")
            rows = [
                {**r, "details": dict(r["details"]), "field_times": dict(r["field_times"])}
                if table == "hearts"
                else dict(r)
                for (w, _), r in self.tables[table].items()
                if w == ws and (since is None or r["updated_at"] > since)
            ]
            return sorted(rows, key=lambda r: r["updated_at"])[:limit]

    def get_learn_progress(self, s) -> dict | None:
        with self._lock:
            return self.learn.get(self._user(s))

    def put_learn_progress(self, s, progress) -> None:
        with self._lock:
            uid = self._user(s)
            self.learn[uid] = {"user_id": uid, "progress": progress, "updated_at": self._now()}

    def touch_device(self, s, device_id, name, app_version) -> None:
        with self._lock:
            uid = self._user(s)
            self.devices[device_id] = {
                "id": device_id,
                "user_id": uid,
                "name": name,
                "app_version": app_version,
                "last_seen_at": self._now(),
            }

    def list_devices(self, s) -> list[dict]:
        with self._lock:
            uid = self._user(s)
            mine = [
                {k: v for k, v in d.items() if k != "user_id"} for d in self.devices.values() if d["user_id"] == uid
            ]
            return sorted(mine, key=lambda d: d["last_seen_at"], reverse=True)
