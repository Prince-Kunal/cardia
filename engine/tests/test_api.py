"""The local engine API (PLAN.md §6, §10): contract, local-only access, jobs, results, layers, heart numbers.

These run the engine in mock mode (fake analysis, no model files or lab data), so they run in CI.
test_api_golden.py runs the real analysis through the API against the golden set.
"""

import io
import os
import stat
import time

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from cardia_api.__main__ import write_engine_file
from cardia_api.app import create_app
from cardia_api.openapi import OPENAPI, contract
from cardia_api.schemas import Layer
from cardia_api.settings import Settings

TOKEN = "test-token-" + "x" * 32
AUTH = {"Authorization": f"Bearer {TOKEN}"}
UI = "http://localhost:5173"


def scan(seed=0, fmt="TIFF", dpi=(1200, 1200)) -> bytes:
    """A synthetic slice: a red ring with a pale (dead-looking) side on white paper."""
    h, w = 220, 200
    img = np.full((h, w, 3), 245, np.uint8)
    yy, xx = np.mgrid[:h, :w]
    disc = (yy - 110) ** 2 + (xx - 100) ** 2 < 80**2
    img[disc] = (170, 40, 50)
    img[disc & (xx > 120)] = (225, 200, 170)
    img[(yy - 110) ** 2 + (xx - 100) ** 2 < 15**2] = 245  # a hole in the middle
    img[0, 0] = (seed, seed, seed)  # different bytes, so a different image
    buf = io.BytesIO()
    Image.fromarray(img).save(buf, format=fmt, dpi=dpi)
    return buf.getvalue()


def make_client(tmp_path, **kw) -> TestClient:
    settings = Settings(
        data_dir=tmp_path,
        token=TOKEN,
        allowed_origins=(UI,),
        allowed_hosts=("127.0.0.1", "localhost", "testserver"),
        workers=kw.pop("workers", 1),
        mock=True,
        mock_delay_s=kw.pop("mock_delay_s", 0.0),
        **kw,
    )
    return TestClient(create_app(settings))


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    with make_client(tmp_path_factory.mktemp("engine"), max_upload_bytes=2**20) as c:
        yield c


def upload(client, files):
    r = client.post("/api/v1/jobs", headers=AUTH, files=[("files", (name, data)) for name, data in files])
    assert r.status_code == 202, r.text
    return r.json()


def wait(client, job_id, timeout=90.0):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        job = client.get(f"/api/v1/jobs/{job_id}", headers=AUTH).json()
        if job["finished_at"] is not None:
            return job
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} did not finish: {job}")


@pytest.fixture(scope="module")
def heart_206(client):
    """Two slices of heart 206 and an unnamed PNG, analysed once for the tests below."""
    job = upload(client, [("206IS89mg.tif", scan(1)), ("206IS95.5mg.tif", scan(2)), ("odd name.png", scan(3, "PNG"))])
    return wait(client, job["job_id"])


def test_the_published_contract_is_up_to_date():
    assert OPENAPI.read_text() == contract(), "run: uv run python -m cardia_api.openapi"


def test_health_needs_no_token(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json() == {
        "status": "ok",
        "api_version": r.json()["api_version"],
        "pipeline_version": "mock",
        "mock": True,
    }


def test_every_other_route_needs_the_token(client):
    assert client.get("/api/v1/engine").status_code == 401
    assert client.get("/api/v1/engine", headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.get("/api/v1/slices").status_code == 401
    assert client.post("/api/v1/jobs", files=[("files", ("a.tif", scan()))]).status_code == 401
    info = client.get("/api/v1/engine", headers=AUTH).json()
    assert [m["key"] for m in info["methods"]] == ["a", "b"]
    assert {m["key"]: m["range_shown"] for m in info["methods"]} == {"a": False, "b": True}
    assert [layer["key"] for layer in info["layers"]] == [layer.value for layer in Layer]


def test_other_web_pages_and_host_names_are_refused(client):
    evil = {**AUTH, "Origin": "https://evil.example"}
    assert client.get("/api/v1/engine", headers=evil).status_code == 403
    assert client.post("/api/v1/jobs", headers=evil, files=[("files", ("a.tif", scan()))]).status_code == 403
    assert client.get("/api/v1/health", headers={"Host": "evil.example"}).status_code == 400  # DNS rebinding
    r = client.get("/api/v1/engine", headers={**AUTH, "Origin": UI})
    assert r.status_code == 200 and r.headers["access-control-allow-origin"] == UI
    pre = client.options(
        "/api/v1/jobs",
        headers={
            "Origin": UI,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert pre.status_code == 200 and "authorization" in pre.headers["access-control-allow-headers"].lower()


def test_a_job_analyses_every_slice(client, heart_206):
    job = heart_206
    assert job["state"] == "done" and job["progress"] == 1.0
    assert job["counts"] == {"total": 3, "queued": 0, "running": 0, "done": 3, "failed": 0, "cancelled": 0}
    a, b, c = job["slices"]
    assert (a["heart_id"], a["weight_mg"], b["weight_mg"]) == ("206", 89.0, 95.5)
    assert (c["heart_id"], c["weight_mg"]) == ("odd name", None)
    s = client.get(f"/api/v1/slices/{a['slice_id']}", headers=AUTH).json()
    assert s["mock"] and s["pipeline_version"] == "mock" and s["dpi"] == [1200.0, 1200.0]
    assert s["mm2_per_px"] == pytest.approx((25.4 / 1200) ** 2)
    assert s["tissue"]["tissue_mm2"] == pytest.approx(s["tissue"]["tissue_px"] * s["mm2_per_px"])
    assert 10 < s["method_a"]["dead_pct"] < 60 and 10 < s["method_b"]["dead_pct"] < 60
    assert s["method_a"]["dead_mg"] == pytest.approx(s["method_a"]["dead_pct"] / 100 * 89.0)
    assert s["method_a"]["range"]["shown"] is False and s["method_b"]["range"]["shown"] is True
    assert s["qc_flags"] == [] and s["layers"] == [layer.value for layer in Layer]
    assert client.get(f"/api/v1/slices/{c['slice_id']}", headers=AUTH).json()["qc_flags"] == ["unvalidated_input"]
    listed = {r["slice_id"] for r in client.get("/api/v1/slices", headers=AUTH).json()}
    assert {a["slice_id"], b["slice_id"], c["slice_id"]} <= listed


def test_layers_are_pngs_the_ui_can_overlay(client, heart_206):
    sid = heart_206["slices"][0]["slice_id"]
    expected_mode = {"photo": "RGB", "mask": "LA", "heatmap": "RGBA"}
    for layer in client.get("/api/v1/engine", headers=AUTH).json()["layers"]:
        r = client.get(f"/api/v1/slices/{sid}/layers/{layer['key']}", headers=AUTH)
        assert r.status_code == 200 and r.headers["content-type"] == "image/png"
        assert "immutable" in r.headers["cache-control"]
        im = Image.open(io.BytesIO(r.content))
        assert im.size == (200, 220) and im.mode == expected_mode[layer["kind"]], layer["key"]
    dead = np.asarray(Image.open(io.BytesIO(client.get(f"/api/v1/slices/{sid}/layers/a_dead", headers=AUTH).content)))
    s = client.get(f"/api/v1/slices/{sid}", headers=AUTH).json()
    assert (dead[..., 1] > 0).sum() == s["method_a"]["dead_px"]


def test_problem_files_fail_alone(client):
    job = upload(
        client,
        [
            ("notes.txt", b"hello"),
            ("207IS80mg.tif", scan(10)),
            ("copy.tif", scan(10)),
            ("broken.tif", b"not an image"),
            ("huge.tif", b"0" * (2**20 + 1)),
        ],
    )
    job = wait(client, job["job_id"])
    codes = [s["error"] and s["error"]["code"] for s in job["slices"]]
    assert codes == ["unsupported_file", None, "duplicate", "unreadable_image", "file_too_large"]
    assert job["state"] == "done" and job["counts"]["done"] == 1 and job["counts"]["failed"] == 4


def test_the_same_scan_is_not_analysed_twice(client, heart_206):
    again = wait(client, upload(client, [("206IS89mg.tif", scan(1))])["job_id"])
    assert again["slices"][0]["cached"] is True
    assert again["slices"][0]["slice_id"] == heart_206["slices"][0]["slice_id"]
    renamed = wait(client, upload(client, [("206IS90mg.tif", scan(1))])["job_id"])  # new weight: a new result
    assert renamed["slices"][0]["cached"] is False
    assert renamed["slices"][0]["slice_id"] != heart_206["slices"][0]["slice_id"]


def test_cancel_stops_the_slices_not_yet_started(tmp_path):
    with make_client(tmp_path, workers=1, mock_delay_s=0.3) as c:
        job = upload(c, [(f"208IS{i}0mg.tif", scan(20 + i)) for i in range(1, 5)])
        r = c.post(f"/api/v1/jobs/{job['job_id']}/cancel", headers=AUTH)
        assert r.status_code == 200 and r.json()["state"] == "cancelled"
        job = wait(c, job["job_id"])
        assert job["state"] == "cancelled"
        assert job["counts"]["cancelled"] >= 3 and job["counts"]["failed"] == 0
        assert job["counts"]["done"] + job["counts"]["cancelled"] == 4


def test_heart_numbers_come_from_the_slices(client, heart_206):
    a, b, c = (s["slice_id"] for s in heart_206["slices"])
    sa, sb = (client.get(f"/api/v1/slices/{x}", headers=AUTH).json() for x in (a, b))
    r = client.post("/api/v1/hearts/summary", headers=AUTH, json={"slices": [{"slice_id": a}, {"slice_id": b}]})
    h = r.json()
    assert r.status_code == 200 and h["heart_id"] == "206" and h["weighting"] == "slice_weight" and h["flags"] == []
    want = (sa["method_b"]["dead_pct"] * 89 + sb["method_b"]["dead_pct"] * 95.5) / (89 + 95.5)
    assert h["method_b"]["dead_pct"] == pytest.approx(want)
    assert h["total_weight_mg"] == 184.5 and h["method_b"]["range"]["shown"] is True

    typed = {"slices": [{"slice_id": a, "weight_mg": 100}, {"slice_id": b}]}
    assert client.post("/api/v1/hearts/summary", headers=AUTH, json=typed).json()["total_weight_mg"] == 195.5

    mixed = client.post("/api/v1/hearts/summary", headers=AUTH, json={"slices": [{"slice_id": a}, {"slice_id": c}]})
    assert mixed.json()["weighting"] == "tissue_area"
    assert mixed.json()["flags"] == ["weights_missing", "mixed_heart_ids"]
    assert mixed.json()["method_a"]["dead_mg"] is None

    def post(body):
        return client.post("/api/v1/hearts/summary", headers=AUTH, json=body).status_code

    assert post({"slices": [{"slice_id": a}, {"slice_id": a}]}) == 422
    assert post({"slices": [{"slice_id": "0" * 24}]}) == 404
    assert post({"slices": []}) == 422
    assert post({"slices": [{"slice_id": a, "weight_mg": -1}]}) == 422


def test_unknown_or_malformed_ids(client):
    assert client.get(f"/api/v1/jobs/{'0' * 32}", headers=AUTH).status_code == 404
    assert client.post(f"/api/v1/jobs/{'0' * 32}/cancel", headers=AUTH).status_code == 404
    assert client.get(f"/api/v1/slices/{'0' * 24}", headers=AUTH).status_code == 404
    assert client.get(f"/api/v1/slices/{'0' * 24}/layers/tissue", headers=AUTH).status_code == 404
    assert client.get("/api/v1/slices/..%2F..%2Fetc", headers=AUTH).status_code in (404, 422)
    assert client.get(f"/api/v1/slices/{'0' * 24}/layers/secret", headers=AUTH).status_code == 422


@pytest.mark.skipif(os.name == "nt", reason="POSIX file modes")
def test_the_engine_file_is_readable_only_by_its_owner(tmp_path):
    path = tmp_path / "engine.json"
    write_engine_file(path, "http://127.0.0.1:8765", "secret")
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
