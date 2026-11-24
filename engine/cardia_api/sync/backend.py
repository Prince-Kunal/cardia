"""The cloud the engine syncs with (PLAN.md §5): what it must offer, and Supabase's version of it.

The engine talks to Supabase's REST endpoints (Auth, PostgREST, Storage) with the standard library,
so sync adds no dependency. Every request goes through one function, `request`, which tests replace.
The schema these calls expect is cloud/supabase/migrations/.
"""

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from typing import Protocol


class CloudError(Exception):
    """The cloud refused or failed a request; the message is for the user."""


class AuthError(CloudError):
    """Signed out, or the sign-in was refused."""


class Offline(CloudError):
    """The cloud could not be reached."""


@dataclass
class Session:
    access_token: str
    refresh_token: str
    expires_at: float  # seconds since the epoch
    user_id: str
    email: str

    def to_json(self) -> dict:
        return asdict(self)


class Backend(Protocol):
    name: str

    def sign_in(self, email: str, password: str) -> Session: ...
    def sign_up(self, email: str, password: str) -> Session | None: ...
    def refresh(self, refresh_token: str) -> Session: ...
    def sign_out(self, s: Session) -> None: ...
    def ensure_personal_workspace(self, s: Session) -> dict: ...
    def list_workspaces(self, s: Session) -> list[dict]: ...
    def create_workspace(self, s: Session, name: str) -> dict: ...
    def merge_heart(self, s: Session, ws: str, key: str, fields: dict, times: dict, created: str) -> None: ...
    def upsert_memberships(self, s: Session, ws: str, rows: list[dict]) -> None: ...
    def insert_result(self, s: Session, ws: str, row: dict) -> None: ...
    def upload(self, s: Session, path: str, data: bytes, content_type: str) -> None: ...
    def download(self, s: Session, path: str) -> bytes: ...
    def pull(self, s: Session, table: str, ws: str, since: str | None, limit: int) -> list[dict]: ...
    def get_learn_progress(self, s: Session) -> dict | None: ...
    def put_learn_progress(self, s: Session, progress: dict) -> None: ...
    def touch_device(self, s: Session, device_id: str, name: str, app_version: str) -> None: ...
    def list_devices(self, s: Session) -> list[dict]: ...


PULLABLE = {"hearts", "heart_slices", "slice_results"}


def urllib_request(method: str, url: str, headers: dict, body: bytes | None, timeout: float = 30) -> tuple[int, bytes]:
    """One HTTP request with the standard library. Network failures raise Offline."""
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, res.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
        raise Offline(f"The cloud could not be reached ({getattr(e, 'reason', e)}).") from None


class SupabaseBackend:
    name = "supabase"

    def __init__(self, url: str, anon_key: str, request=urllib_request):
        self.url = url.rstrip("/")
        self.key = anon_key
        self.request = request

    # plumbing -----------------------------------------------------------------------------------

    def _call(self, method: str, path: str, s: Session | None = None, body=None, headers=None, raw=False):
        h = {"apikey": self.key, "Authorization": f"Bearer {s.access_token if s else self.key}"}
        data = None
        if body is not None and not raw:
            h["Content-Type"] = "application/json"
            data = json.dumps(body).encode()
        elif raw:
            data = body
        h |= headers or {}
        status, out = self.request(method, f"{self.url}{path}", h, data)
        if status in (401, 403) and path.startswith(("/auth/", "/rest/", "/storage/")) and s is not None:
            raise AuthError("Your cloud sign-in has expired or was refused. Sign in again.")
        if status >= 400:
            raise CloudError(self._message(status, out))
        if not out:
            return None
        try:
            return json.loads(out)
        except ValueError:
            return out

    @staticmethod
    def _message(status: int, out: bytes) -> str:
        try:
            body = json.loads(out)
        except ValueError:
            body = {}
        text = body.get("msg") or body.get("message") or body.get("error_description") or body.get("error")
        return f"The cloud said: {text}" if text else f"The cloud refused the request ({status})."

    @staticmethod
    def _session(body: dict) -> Session:
        return Session(
            access_token=body["access_token"],
            refresh_token=body["refresh_token"],
            expires_at=time.time() + float(body.get("expires_in", 3600)),
            user_id=body["user"]["id"],
            email=body["user"].get("email", ""),
        )

    def _rpc(self, s: Session, fn: str, args: dict):
        return self._call("POST", f"/rest/v1/rpc/{fn}", s, args)

    # accounts -----------------------------------------------------------------------------------

    def sign_in(self, email: str, password: str) -> Session:
        status, out = self.request(
            "POST",
            f"{self.url}/auth/v1/token?grant_type=password",
            {"apikey": self.key, "Content-Type": "application/json"},
            json.dumps({"email": email, "password": password}).encode(),
        )
        if status == 400:
            raise AuthError("That email and password don't match a Cardia account.")
        if status >= 400:
            raise CloudError(self._message(status, out))
        return self._session(json.loads(out))

    def sign_up(self, email: str, password: str) -> Session | None:
        body = self._call("POST", "/auth/v1/signup", None, {"email": email, "password": password})
        # With email confirmation on (the default), there is no session until the link is followed.
        return self._session(body) if body and body.get("access_token") else None

    def refresh(self, refresh_token: str) -> Session:
        status, out = self.request(
            "POST",
            f"{self.url}/auth/v1/token?grant_type=refresh_token",
            {"apikey": self.key, "Content-Type": "application/json"},
            json.dumps({"refresh_token": refresh_token}).encode(),
        )
        if status >= 400:
            raise AuthError("Your cloud sign-in has expired. Sign in again.")
        return self._session(json.loads(out))

    def sign_out(self, s: Session) -> None:
        try:
            self._call("POST", "/auth/v1/logout", s)
        except CloudError:
            pass  # signing out locally is what matters

    # workspaces ---------------------------------------------------------------------------------

    def ensure_personal_workspace(self, s: Session) -> dict:
        return self._rpc(s, "ensure_personal_workspace", {})

    def list_workspaces(self, s: Session) -> list[dict]:
        rows = self._call(
            "GET",
            "/rest/v1/workspace_members?select=role,workspaces(id,name,kind,upload_images)"
            f"&user_id=eq.{urllib.parse.quote(s.user_id)}",
            s,
        )
        return [{**r["workspaces"], "role": r["role"]} for r in rows or [] if r.get("workspaces")]

    def create_workspace(self, s: Session, name: str) -> dict:
        return self._rpc(s, "create_workspace", {"ws_name": name, "ws_kind": "lab"})

    # the library --------------------------------------------------------------------------------

    def merge_heart(self, s, ws, key, fields, times, created) -> None:
        self._rpc(s, "merge_heart", {"ws": ws, "key": key, "fields": fields, "times": times, "created": created})

    def upsert_memberships(self, s, ws, rows) -> None:
        self._call(
            "POST",
            "/rest/v1/heart_slices?on_conflict=workspace_id,slice_id",
            s,
            [{**r, "workspace_id": ws} for r in rows],
            {"Prefer": "resolution=merge-duplicates,return=minimal"},
        )

    def insert_result(self, s, ws, row) -> None:
        self._call(
            "POST",
            "/rest/v1/slice_results?on_conflict=workspace_id,slice_id",
            s,
            [{**row, "workspace_id": ws}],
            {"Prefer": "resolution=ignore-duplicates,return=minimal"},
        )

    def upload(self, s, path, data, content_type) -> None:
        self._call(
            "POST",
            f"/storage/v1/object/cardia/{urllib.parse.quote(path)}",
            s,
            data,
            {"Content-Type": content_type, "x-upsert": "true"},
            raw=True,
        )

    def download(self, s, path) -> bytes:
        status, out = self.request(
            "GET",
            f"{self.url}/storage/v1/object/authenticated/cardia/{urllib.parse.quote(path)}",
            {"apikey": self.key, "Authorization": f"Bearer {s.access_token}"},
            None,
        )
        if status in (401, 403):
            raise AuthError("Your cloud sign-in has expired or was refused. Sign in again.")
        if status >= 400:
            raise CloudError(self._message(status, out))
        return out

    def pull(self, s, table, ws, since, limit) -> list[dict]:
        if table not in PULLABLE:
            raise ValueError(table)
        q = f"/rest/v1/{table}?workspace_id=eq.{urllib.parse.quote(ws)}&order=updated_at.asc&limit={int(limit)}"
        if since:
            q += f"&updated_at=gt.{urllib.parse.quote(since)}"
        return self._call("GET", q, s) or []

    def get_learn_progress(self, s) -> dict | None:
        rows = self._call("GET", f"/rest/v1/learn_progress?user_id=eq.{urllib.parse.quote(s.user_id)}", s) or []
        return rows[0] if rows else None

    def put_learn_progress(self, s, progress) -> None:
        self._call(
            "POST",
            "/rest/v1/learn_progress?on_conflict=user_id",
            s,
            [{"user_id": s.user_id, "progress": progress}],
            {"Prefer": "resolution=merge-duplicates,return=minimal"},
        )

    def touch_device(self, s, device_id, name, app_version) -> None:
        self._call(
            "POST",
            "/rest/v1/devices?on_conflict=id",
            s,
            [
                {
                    "id": device_id,
                    "user_id": s.user_id,
                    "name": name,
                    "app_version": app_version,
                    "last_seen_at": "now()",
                }
            ],
            {"Prefer": "resolution=merge-duplicates,return=minimal"},
        )

    def list_devices(self, s) -> list[dict]:
        return (
            self._call("GET", "/rest/v1/devices?select=id,name,app_version,last_seen_at&order=last_seen_at.desc", s)
            or []
        )
