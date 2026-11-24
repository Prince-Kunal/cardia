"""The library (milestone 2): hearts filled from finished slices, experiment details, trash, settings and
the watch folder. Mock-mode engine, so these run in CI."""

import json
import shutil
from datetime import UTC, datetime, timedelta

import pytest
from apiutil import AUTH, make_client, scan, upload, wait


@pytest.fixture(scope="module")
def data_dir(tmp_path_factory):
    return tmp_path_factory.mktemp("library")


@pytest.fixture(scope="module")
def client(data_dir):
    with make_client(data_dir, workers=2, watch_interval_s=3600) as c:  # the watch test drives scans by hand
        yield c


def hearts(client, **params):
    r = client.get("/api/v1/hearts", headers=AUTH, params=params)
    assert r.status_code == 200, r.text
    return {h["label"]: h for h in r.json()}


def patch(client, key, body):
    return client.patch(f"/api/v1/hearts/{key}", headers=AUTH, json=body)


@pytest.fixture(scope="module")
def first_import(client):
    job = upload(client, [("206IS89mg.tif", scan(1)), ("206IS95mg.tif", scan(2)), ("207IS80mg.tif", scan(3))])
    return wait(client, job["job_id"])


def test_finished_slices_are_filed_into_hearts(client, first_import):
    assert first_import["source"] == "upload"
    keys = [s["heart_key"] for s in first_import["slices"]]
    assert keys[0] == keys[1] != keys[2] and None not in keys
    assert all(s["seconds"] is not None and s["seconds"] >= 0 for s in first_import["slices"])
    h = hearts(client)["206"]
    assert h["heart_key"] == keys[0]
    assert [s["file_name"] for s in h["slices"]] == ["206IS89mg.tif", "206IS95mg.tif"]
    assert [s["weight_source"] for s in h["slices"]] == ["file_name", "file_name"]
    assert h["summary"]["weighting"] == "slice_weight" and h["summary"]["total_weight_mg"] == 184.0
    assert h["summary"]["heart_id"] == "206" and h["deleted_at"] is None and h["purge_after"] is None


def test_new_slices_join_the_existing_heart(client, first_import):
    job = wait(client, upload(client, [("206IS120mg.tif", scan(4))])["job_id"])
    h = hearts(client)["206"]
    assert job["slices"][0]["heart_key"] == h["heart_key"]
    assert [s["position"] for s in h["slices"]] == [0, 1, 2]
    again = wait(client, upload(client, [("206IS89mg.tif", scan(1))])["job_id"])  # same scan: no second copy
    assert again["slices"][0]["cached"] and len(hearts(client)["206"]["slices"]) == 3


def test_what_the_user_types_at_import_is_kept(client):
    files = [("files", ("scan A.tif", scan(5))), ("files", ("scan B.tif", scan(6)))]
    meta = [{"heart_id": "301", "weight_mg": 50.5}, {"heart_id": "301"}]
    r = client.post("/api/v1/jobs", headers=AUTH, files=files, data={"meta": json.dumps(meta)})
    assert r.status_code == 202, r.text
    wait(client, r.json()["job_id"])
    h = hearts(client)["301"]
    assert [(s["weight_mg"], s["weight_source"]) for s in h["slices"]] == [(50.5, "typed"), (None, None)]
    assert h["summary"]["flags"] == ["weights_missing"]
    bad = {"meta": json.dumps(meta[:1])}
    assert client.post("/api/v1/jobs", headers=AUTH, files=files, data=bad).status_code == 422
    assert client.post("/api/v1/jobs", headers=AUTH, files=files, data={"meta": "not json"}).status_code == 422
    neg = {"meta": json.dumps([{"weight_mg": -1}, {}])}
    assert client.post("/api/v1/jobs", headers=AUTH, files=files, data=neg).status_code == 422


def test_details_order_and_weights_can_be_edited(client, first_import):
    h = hearts(client)["206"]
    key, ids = h["heart_key"], [s["slice_id"] for s in h["slices"]]
    body = {
        "group": "treatment",
        "ischemia_min": 30,
        "reperfusion_min": 120,
        "experiment_date": "2026-10-22",
        "operator": "A. Researcher",
        "heart_weight_mg": 1500,
        "notes": "pilot",
        "tags": ["pilot", "batch-a", "pilot"],
        "favourite": True,
        "slices": [{"slice_id": ids[2]}, {"slice_id": ids[0], "weight_mg": 90}],  # ids[1] taken out
    }
    r = patch(client, key, body)
    assert r.status_code == 200, r.text
    h = r.json()
    assert (h["group"], h["experiment_date"], h["tags"], h["favourite"]) == (
        "treatment",
        "2026-10-22",
        ["batch-a", "pilot"],
        True,
    )
    assert [s["slice_id"] for s in h["slices"]] == [ids[2], ids[0]]
    assert [(s["weight_mg"], s["weight_source"]) for s in h["slices"]] == [(120.0, "file_name"), (90.0, "typed")]
    assert h["summary"]["total_weight_mg"] == 210.0
    assert patch(client, key, {"group": None}).json()["group"] is None  # a detail can be cleared
    assert patch(client, key, {"label": None}).status_code == 422  # but the label can't
    assert patch(client, key, {"slices": [{"slice_id": "0" * 24}]}).status_code == 422
    assert patch(client, key, {"colour": "red"}).status_code == 422
    assert patch(client, "0" * 32, {"notes": "x"}).status_code == 404
    patch(client, key, {"group": "treatment"})


def test_search_and_filters(client, first_import):
    assert set(hearts(client, q="PILOT")) == {"206"}
    assert set(hearts(client, group="treatment")) == {"206"}
    assert set(hearts(client, tag="batch-a")) == {"206"}
    assert set(hearts(client, favourite=True)) == {"206"}
    assert "207" in hearts(client, favourite=False)


def test_trash_restore_and_purge(client, first_import):
    key = hearts(client)["207"]["heart_key"]
    r = client.delete(f"/api/v1/hearts/{key}", headers=AUTH)
    assert r.status_code == 200 and r.json()["deleted_at"] is not None
    deleted = datetime.fromisoformat(r.json()["deleted_at"])
    assert datetime.fromisoformat(r.json()["purge_after"]) - deleted == timedelta(days=30)
    assert "207" not in hearts(client) and "207" in hearts(client, trash=True)
    assert client.post(f"/api/v1/hearts/{key}/restore", headers=AUTH).json()["deleted_at"] is None
    assert "207" in hearts(client)
    client.delete(f"/api/v1/hearts/{key}", headers=AUTH)
    library = client.app.state.library
    assert library.purge_trash(datetime.now(UTC) + timedelta(days=29)) == 0
    assert library.purge_trash(datetime.now(UTC) + timedelta(days=31)) == 1
    assert client.get(f"/api/v1/hearts/{key}", headers=AUTH).status_code == 404


def test_settings(client):
    s = client.get("/api/v1/settings", headers=AUTH).json()
    assert s == {
        "headline_method": "b",
        "theme": "system",
        "language": "en",
        "report_language": "en",
        "reduced_motion": False,
        "watch_folder": None,
        "watch_enabled": False,
    }
    new = s | {"headline_method": "a", "theme": "dark", "language": "hi"}
    assert client.put("/api/v1/settings", headers=AUTH, json=new).json() == new
    assert client.get("/api/v1/settings", headers=AUTH).json() == new
    for bad in ({"headline_method": "c"}, {"watch_folder": "relative/path"}, {"language": "Hindi"}, {"x": 1}):
        assert client.put("/api/v1/settings", headers=AUTH, json=new | bad).status_code == 422
    client.put("/api/v1/settings", headers=AUTH, json=s)


def test_a_saved_headline_of_retired_method_c_falls_back(client, data_dir):
    """Pipeline 0.4.0 let users choose Method C as the headline; it has been retired (2026-11-24)."""
    from cardia_api.library import Library

    lib = Library(data_dir / "library.sqlite3")
    lib.open()
    before = lib.get_settings()
    lib.set_settings(before | {"headline_method": "c"})
    try:
        assert client.get("/api/v1/settings", headers=AUTH).json()["headline_method"] == "b"
        assert client.get("/api/v1/engine", headers=AUTH).status_code == 200
    finally:
        lib.set_settings(before)
        lib.close()


def test_the_watch_folder_imports_new_scans_only(client, tmp_path):
    watcher = client.app.state.watcher
    folder = tmp_path / "scanner"
    (folder / "sub").mkdir(parents=True)
    (folder / "old.tif").write_bytes(scan(30))
    settings = client.get("/api/v1/settings", headers=AUTH).json()
    client.put("/api/v1/settings", headers=AUTH, json=settings | {"watch_folder": str(folder), "watch_enabled": True})
    assert watcher.scan_once() is None  # the first look only records what is already there
    (folder / "sub" / "401IS70mg.tif").write_bytes(scan(31))
    (folder / ".hidden.tif").write_bytes(scan(32))
    (folder / "notes.txt").write_text("not a scan")
    assert watcher.scan_once() is None  # seen once: maybe still being written
    job_id = watcher.scan_once()
    assert job_id is not None
    job = wait(client, job_id)
    assert job["source"] == "watch_folder" and [s["file_name"] for s in job["slices"]] == ["401IS70mg.tif"]
    assert "401" in hearts(client) and "old" not in hearts(client)
    assert watcher.scan_once() is None  # imported once
    status = client.get("/api/v1/watch", headers=AUTH).json()
    assert status["state"] == "watching" and status["files_imported"] == 1 and status["last_job_id"] == job_id
    shutil.rmtree(folder)
    watcher.scan_once()
    assert client.get("/api/v1/watch", headers=AUTH).json()["state"] == "folder_missing"
    client.put("/api/v1/settings", headers=AUTH, json=settings)
    watcher.scan_once()
    assert client.get("/api/v1/watch", headers=AUTH).json()["state"] == "off"


def test_the_library_survives_a_restart(client, first_import, data_dir, tmp_path):
    before = hearts(client)
    copy = tmp_path / "copy"
    client.app.state.library.close()  # flush, then reopen the copy with a new engine
    shutil.copytree(data_dir, copy)
    client.app.state.library.open()
    with make_client(copy, workers=1, watch_interval_s=3600) as other:
        after = hearts(other)
    assert {k: v["heart_key"] for k, v in after.items()} == {k: v["heart_key"] for k, v in before.items()}
    assert after["206"]["summary"] == before["206"]["summary"]
