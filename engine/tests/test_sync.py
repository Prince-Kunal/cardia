"""Cloud sync (PLAN.md §5), tested without accounts: two engines sync through one in-memory cloud with
the Supabase schema's rules (cardia_api/sync/memory.py), and the Supabase client's requests are checked
against a recording transport. Mock-mode engines, so these run in CI."""

import json
import os
import stat

import pytest
from apiutil import AUTH, make_client, scan, upload, wait

from cardia_api.sync import AuthError, MemoryBackend, Offline, SupabaseBackend
from cardia_api.sync.backend import urllib_request

EMAIL, PASSWORD = "lab@example.org", "correct horse"


def status(c):
    r = c.get("/api/v1/sync", headers=AUTH)
    assert r.status_code == 200, r.text
    return r.json()


def sync_now(c):
    r = c.post("/api/v1/sync/now", headers=AUTH)
    assert r.status_code == 200, r.text
    return r.json()


def sign_in(c, email=EMAIL, password=PASSWORD, create=False):
    return c.post(
        "/api/v1/sync/sign-in", headers=AUTH, json={"email": email, "password": password, "create_account": create}
    )


def hearts(c, trash=False):
    r = c.get("/api/v1/hearts", headers=AUTH, params={"trash": trash})
    assert r.status_code == 200, r.text
    return {h["label"]: h for h in r.json()}


def patch(c, key, body):
    r = c.patch(f"/api/v1/hearts/{key}", headers=AUTH, json=body)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def cloud():
    return MemoryBackend()


@pytest.fixture(scope="module")
def a(tmp_path_factory, cloud):
    with make_client(tmp_path_factory.mktemp("a"), workers=2, cloud_backend=cloud, sync_interval_s=3600) as c:
        yield c


@pytest.fixture(scope="module")
def b(tmp_path_factory, cloud):
    with make_client(tmp_path_factory.mktemp("b"), workers=2, cloud_backend=cloud, sync_interval_s=3600) as c:
        yield c


@pytest.fixture(scope="module")
def signed_in(a, b):
    """The same person on two computers; computer A had analysed hearts before sync was turned on."""
    wait(
        a, upload(a, [("401IS90mg.tif", scan(41)), ("401IS95mg.tif", scan(42)), ("402IS80mg.tif", scan(43))])["job_id"]
    )
    assert status(a)["state"] == "signed_out"
    made = sign_in(a, create=True)
    assert made.status_code == 200, made.text
    assert made.json()["workspace"]["kind"] == "personal" and made.json()["workspace"]["role"] == "owner"
    assert sign_in(b).status_code == 200
    assert status(b)["workspace"]["id"] == status(a)["workspace"]["id"]
    return a, b


def test_a_library_made_before_sync_goes_up_and_comes_down_on_another_computer(signed_in):
    a, b = signed_in
    after = sync_now(a)
    assert after["state"] == "synced" and after["pending"] == 0 and after["last_sync_at"]
    assert sync_now(b)["state"] == "synced"
    h = hearts(b)["401"]
    assert [s["file_name"] for s in h["slices"]] == ["401IS90mg.tif", "401IS95mg.tif"]
    assert h["summary"]["total_weight_mg"] == 185.0
    assert h["heart_key"] == hearts(a)["401"]["heart_key"]
    slice_id = h["slices"][0]["slice_id"]
    assert b.get(f"/api/v1/slices/{slice_id}", headers=AUTH).status_code == 200
    assert b.get(f"/api/v1/slices/{slice_id}/layers/corrected", headers=AUTH).status_code == 200
    # Both computers are listed as devices.
    devices = status(a)["devices"]
    assert len(devices) >= 1 and any(d["this_device"] for d in devices)


def test_edits_on_either_computer_meet_field_by_field(signed_in):
    a, b = signed_in
    key = hearts(a)["401"]["heart_key"]
    # Both edit while the other has not synced: different fields both survive.
    patch(a, key, {"group": "treated"})
    patch(b, key, {"notes": "from computer B", "tags": ["pilot"]})
    sync_now(a)
    sync_now(b)
    sync_now(a)
    for c in (a, b):
        h = hearts(c)["401"]
        assert h["group"] == "treated" and h["notes"] == "from computer B" and h["tags"] == ["pilot"]
    # The same field: the later change wins, wherever it was made.
    patch(a, key, {"operator": "first"})
    patch(b, key, {"operator": "second"})
    sync_now(b)
    sync_now(a)
    sync_now(b)
    assert hearts(a)["401"]["operator"] == hearts(b)["401"]["operator"] == "second"


def test_trash_and_slices_taken_out_travel_as_tombstones(signed_in):
    a, b = signed_in
    h = hearts(a)["401"]
    patch(a, h["heart_key"], {"slices": [{"slice_id": h["slices"][1]["slice_id"]}]})
    key402 = hearts(a)["402"]["heart_key"]
    assert a.delete(f"/api/v1/hearts/{key402}", headers=AUTH).status_code == 200
    sync_now(a)
    sync_now(b)
    assert [s["file_name"] for s in hearts(b)["401"]["slices"]] == ["401IS95mg.tif"]
    assert "402" not in hearts(b) and "402" in hearts(b, trash=True)


def test_changes_wait_while_offline_and_go_when_back(signed_in, cloud):
    a, b = signed_in
    key = hearts(a)["401"]["heart_key"]
    cloud.online = False
    try:
        patch(a, key, {"notes": "written offline"})
        s = sync_now(a)
        assert s["state"] == "offline" and s["pending"] >= 1 and s["error"]
    finally:
        cloud.online = True
    assert sync_now(a)["pending"] == 0
    sync_now(b)
    assert hearts(b)["401"]["notes"] == "written offline"


def test_learn_progress_follows_the_person(signed_in):
    a, b = signed_in
    progress = {"version": 1, "lessons": {"1": {"done": True}}}
    r = a.put("/api/v1/learn-progress", headers=AUTH, json={"progress": progress})
    assert r.status_code == 200 and r.json()["progress"] == progress
    sync_now(a)
    sync_now(b)
    assert b.get("/api/v1/learn-progress", headers=AUTH).json()["progress"] == progress


def test_a_viewer_pulls_but_never_sends(signed_in, cloud, tmp_path):
    a, _ = signed_in
    lab = a.post("/api/v1/sync/workspaces", headers=AUTH, json={"name": "Lab"}).json()["workspace"]
    assert lab["kind"] == "lab" and lab["role"] == "owner"
    sync_now(a)  # the library goes up to the lab workspace too
    with make_client(tmp_path, cloud_backend=cloud, sync_interval_s=3600) as v:
        assert sign_in(v, "viewer@example.org", "viewer pass", create=True).status_code == 200
        owner = cloud.sign_in(EMAIL, PASSWORD)
        cloud.add_member(owner, lab["id"], "viewer@example.org", "viewer")
        sync_now(v)
        assert v.put("/api/v1/sync/workspace", headers=AUTH, json={"workspace_id": lab["id"]}).status_code == 200
        s = status(v)
        assert s["read_only"] and s["workspace"]["role"] == "viewer"
        assert "401" in hearts(v)
        patch(v, hearts(v)["401"]["heart_key"], {"notes": "a viewer's note"})
        sync_now(v)
        assert status(v)["pending"] >= 1  # kept here, never sent
    sync_now(a)
    assert hearts(a)["401"]["notes"] != "a viewer's note"


def test_a_wrong_password_is_refused_and_the_session_file_is_private(signed_in):
    a, _ = signed_in
    bad = sign_in(a, password="wrong password")
    assert bad.status_code == 400 and "don't match" in bad.json()["detail"]
    # The session file is readable by the user alone and never holds the password.
    path = a.app.state.settings.data_dir / "sync.json"
    assert stat.S_IMODE(os.stat(path).st_mode) == 0o600
    assert PASSWORD not in path.read_text()


def test_signing_out_stops_sync_and_keeps_the_library(tmp_path, cloud):
    with make_client(tmp_path, cloud_backend=cloud, sync_interval_s=3600) as c:
        assert sign_in(c).status_code == 200
        sync_now(c)
        before = set(hearts(c))
        r = c.post("/api/v1/sync/sign-out", headers=AUTH)
        assert r.status_code == 200 and r.json()["state"] == "signed_out" and r.json()["email"] is None
        assert set(hearts(c)) == before and before
        assert c.post("/api/v1/sync/now", headers=AUTH).status_code == 400


def test_sync_is_off_until_the_engine_has_a_cloud(tmp_path):
    with make_client(tmp_path) as c:
        s = status(c)
        assert s["state"] == "not_configured" and s["backend"] is None
        r = sign_in(c)
        assert r.status_code == 409 and "CARDIA_SUPABASE_URL" in r.json()["detail"]
        # Learn progress is still kept locally.
        assert c.put("/api/v1/learn-progress", headers=AUTH, json={"progress": {"x": 1}}).status_code == 200
        assert c.get("/api/v1/learn-progress", headers=AUTH).json()["progress"] == {"x": 1}


# The Supabase client, against a recording transport ---------------------------------------------


class Recorder:
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []

    def __call__(self, method, url, headers, body):
        self.calls.append(
            {"method": method, "url": url, "headers": headers, "body": json.loads(body) if body else None}
        )
        return self.replies.pop(0)


SESSION_REPLY = (
    200,
    json.dumps(
        {"access_token": "acc", "refresh_token": "ref", "expires_in": 3600, "user": {"id": "u1", "email": EMAIL}}
    ).encode(),
)


def test_the_supabase_client_speaks_auth_postgrest_and_storage():
    rec = Recorder([SESSION_REPLY, (200, b""), (201, b""), (200, b'[{"slice_id": "a"}]'), (200, b"{}")])
    cloud = SupabaseBackend("https://proj.supabase.co/", "anon-key", request=rec)
    s = cloud.sign_in(EMAIL, PASSWORD)
    assert s.user_id == "u1" and s.access_token == "acc"
    first = rec.calls[0]
    assert first["method"] == "POST" and first["url"] == "https://proj.supabase.co/auth/v1/token?grant_type=password"
    assert first["headers"]["apikey"] == "anon-key" and first["body"] == {"email": EMAIL, "password": PASSWORD}

    cloud.merge_heart(
        s, "ws1", "k1", {"notes": "n"}, {"notes": "2026-11-24T00:00:00+00:00"}, "2026-11-23T00:00:00+00:00"
    )
    rpc = rec.calls[1]
    assert rpc["url"].endswith("/rest/v1/rpc/merge_heart") and rpc["headers"]["Authorization"] == "Bearer acc"
    assert rpc["body"]["ws"] == "ws1" and rpc["body"]["fields"] == {"notes": "n"}

    cloud.upsert_memberships(
        s, "ws1", [{"slice_id": "a" * 24, "heart_key": None, "position": 0, "typed_weight_mg": None, "changed_at": "t"}]
    )
    up = rec.calls[2]
    assert "on_conflict=workspace_id,slice_id" in up["url"] and up["headers"]["Prefer"].startswith(
        "resolution=merge-duplicates"
    )
    assert up["body"][0]["workspace_id"] == "ws1"

    rows = cloud.pull(s, "heart_slices", "ws1", "2026-11-24T00:00:00+00:00", 500)
    assert rows == [{"slice_id": "a"}]
    q = rec.calls[3]["url"]
    assert (
        "workspace_id=eq.ws1" in q
        and "order=updated_at.asc" in q
        and "updated_at=gt.2026-11-24" in q
        and "limit=500" in q
    )
    with pytest.raises(ValueError):
        cloud.pull(s, "workspace_members", "ws1", None, 10)


def test_the_supabase_client_reports_refusals_and_a_missing_network():
    cloud = SupabaseBackend(
        "https://proj.supabase.co", "anon-key", request=Recorder([(400, b'{"error_description": "Invalid login"}')])
    )
    with pytest.raises(AuthError):
        cloud.sign_in(EMAIL, "nope")
    s = SupabaseBackend._session(json.loads(SESSION_REPLY[1]))
    cloud = SupabaseBackend(
        "https://proj.supabase.co", "anon-key", request=Recorder([(401, b'{"message": "JWT expired"}')])
    )
    with pytest.raises(AuthError):
        cloud.list_workspaces(s)
    # A port nothing listens on: the standard-library transport turns the failure into Offline.
    with pytest.raises(Offline):
        urllib_request("GET", "http://127.0.0.1:9/rest/v1/hearts", {}, None, timeout=2)
