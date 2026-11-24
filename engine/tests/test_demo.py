"""The demo heart for the walkthrough (PLAN.md §1h): heart 206's real scans, served unchanged."""

import hashlib

import pytest
from apiutil import AUTH, make_client, upload, wait

from cardia_api import demo


@pytest.fixture
def client(tmp_path):
    with make_client(tmp_path) as c:
        yield c


def test_the_demo_heart_is_listed(client):
    if not demo.scans():
        pytest.skip("needs the GVSU study scans in data/")
    r = client.get("/api/v1/demo", headers=AUTH)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["heart_id"] == "206" and body["group"] == "infarct"
    assert [s["name"] for s in body["scans"]] == ["206IS112mg.tif", "206IS127mg.tif", "206IS153mg.tif", "206IS89mg.tif"]
    assert all(s["size_bytes"] > 100_000 for s in body["scans"])


def test_a_demo_scan_is_served_byte_for_byte_and_imports(client):
    if not demo.scans():
        pytest.skip("needs the GVSU study scans in data/")
    r = client.get("/api/v1/demo/206IS89mg.tif", headers=AUTH)
    assert r.status_code == 200 and r.headers["content-type"] == "image/tiff"
    assert (
        hashlib.sha256(r.content).hexdigest() == hashlib.sha256(demo.scans()["206IS89mg.tif"].read_bytes()).hexdigest()
    )
    job = wait(client, upload(client, [("206IS89mg.tif", r.content)])["job_id"])
    assert [s["state"] for s in job["slices"]] == ["done"]


def test_only_the_demo_scans_are_served(client):
    for name in ["206IS90mg.tif", "..%2F..%2Fpyproject.toml", "206InfSize.out", "x.tif"]:
        assert client.get(f"/api/v1/demo/{name}", headers=AUTH).status_code in (404, 422), name
    assert client.get("/api/v1/demo/206IS89mg.tif").status_code == 401


def test_no_demo_heart_without_the_data_folder(tmp_path):
    assert demo.heart(tmp_path / "missing") is None
    assert demo.scans(tmp_path / "missing") == {}
