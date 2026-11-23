"""Export (milestone 3): the CSV tables, the Methods paragraph and the ZIP bundle of a heart.
Mock-mode engine for the API, so these run in CI; the Methods text is also checked on real-looking results."""

import csv
import hashlib
import io
import json
import zipfile

import pytest
from apiutil import AUTH, make_client, scan, upload, wait

from cardia_api.catalog import RANGE_SHOWN
from cardia_api.export import methods_paragraphs, safe_name
from cardia_api.export.tables import HEART_COLUMNS, SLICE_COLUMNS
from ttc_pipeline.method_b import ACuts


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    with make_client(tmp_path_factory.mktemp("export"), workers=2, watch_interval_s=3600) as c:
        yield c


@pytest.fixture(scope="module")
def heart(client):
    # The PNG has no heart ID in its name, so it becomes a heart of its own ("301 slice c").
    files = [("301IS89.5mg.tif", scan(11)), ("301IS102mg.tif", scan(12)), ("301 slice c.png", scan(13, fmt="PNG"))]
    job = wait(client, upload(client, files)["job_id"])
    key = job["slices"][0]["heart_key"]
    h = client.get(f"/api/v1/hearts/{key}", headers=AUTH).json()
    assert [s["file_name"] for s in h["slices"]] == ["301IS89.5mg.tif", "301IS102mg.tif"]
    return h


def rows(text: str) -> list[dict]:
    return list(csv.DictReader(io.StringIO(text)))


def test_slices_csv(client, heart):
    r = client.get(f"/api/v1/hearts/{heart['heart_key']}/slices.csv", headers=AUTH)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/csv")
    assert 'filename="cardia-heart-301-slices.csv"' in r.headers["content-disposition"]
    table = rows(r.text)
    assert list(table[0]) == SLICE_COLUMNS
    assert [t["position"] for t in table] == ["1", "2"]
    assert [t["weight_mg"] for t in table] == ["89.5", "102"]
    assert table[0]["demo_data"] == "true"
    for t in table:
        # A decimal point, never a comma, and the dead mass agrees with % × weight.
        assert "," not in t["b_dead_pct"] and float(t["b_dead_pct"]) >= 0
        assert float(t["b_dead_mg"]) == pytest.approx(float(t["b_dead_pct"]) / 100 * float(t["weight_mg"]), abs=1e-3)
    # Only the ranges reports show are exported (PLAN.md §2g).
    assert ("a_low_pct" in table[0]) == RANGE_SHOWN["a"]
    assert ("b_low_pct" in table[0]) == RANGE_SHOWN["b"]


def test_hearts_csv(client, heart):
    r = client.get("/api/v1/hearts.csv", headers=AUTH, params={"q": "301"})
    assert r.status_code == 200, r.text
    table = rows(r.text)
    assert list(table[0]) == HEART_COLUMNS
    by_heart = {t["heart"]: t for t in table}
    assert set(by_heart) == {"301", "301 slice c"}
    assert (by_heart["301"]["slices"], by_heart["301"]["weighting"]) == ("2", "slice_weight")
    assert float(by_heart["301"]["total_slice_weight_mg"]) == pytest.approx(191.5)
    # The PNG has no weight, so its heart is weighted by tissue area and flagged.
    assert (by_heart["301 slice c"]["weighting"], by_heart["301 slice c"]["flags"]) == (
        "tissue_area",
        "weights_missing",
    )
    assert client.get("/api/v1/hearts.csv", headers=AUTH, params={"q": "nothing"}).text.count("\n") == 1


def test_methods_for_demo_results_say_so(client, heart):
    r = client.get(f"/api/v1/hearts/{heart['heart_key']}/methods", headers=AUTH)
    assert r.status_code == 200, r.text
    paragraphs = r.json()
    assert [p["method"] for p in paragraphs] == ["a", "b"]  # headline (default A) first
    assert all(p["mock"] and "demo mode" in p["text"] for p in paragraphs)


def test_methods_text_names_versions_and_cut_offs(heart):
    """On results that look real: the paragraph carries the pipeline version, model hashes and cut-offs."""
    cuts = ACuts(11.75, 18.6, {"model_version": "1.0.0"})
    models = [
        {"file": "kmeans_rf/kmeans_rf.joblib", "version": "1.0.0", "sha256": "1b4acf612822" + "0" * 52},
        {"file": "holes/hole_model.joblib", "version": "1.0.0", "sha256": "6a6e6b37fc09" + "0" * 52},
        {"file": "a_cut/a_cut.json", "version": "1.0.0", "sha256": "249ae33cc3eb" + "0" * 52},
    ]
    results = [{"mock": False, "models": models}] * 3
    summary = {"pipeline_version": "0.3.0", "weighting": "tissue_area"}
    a, b = methods_paragraphs(results, summary, "206", cuts, headline="b")[::-1]
    assert (a["method"], b["method"]) == ("a", "b")
    assert "pipeline 0.3.0" in a["text"] and "3 short-axis slices" in a["text"]
    assert "1b4acf612822" in a["text"] and "6a6e6b37fc09" in a["text"]
    assert "weighted by tissue area" in a["text"]
    assert "11.75" in b["text"] and "18.6" in b["text"] and "249ae33cc3eb" in b["text"]
    assert ("reported range" in b["text"]) == RANGE_SHOWN["b"]
    assert ("reported range" in a["text"]) == RANGE_SHOWN["a"]
    assert not any(word in (a["text"] + b["text"]).lower() for word in ("claude", "ai-generated"))


def test_zip_bundle(client, heart):
    r = client.get(f"/api/v1/hearts/{heart['heart_key']}/export.zip", headers=AUTH)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/zip"
    assert 'filename="cardia-heart-301.zip"' in r.headers["content-disposition"]
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        names = z.namelist()
        root = "cardia-heart-301/"
        assert all(n.startswith(root) for n in names)
        for f in [
            "README.txt",
            "manifest.json",
            "heart.json",
            "slices.csv",
            "heart.csv",
            "methods.txt",
            "settings.json",
        ]:
            assert root + f in names
        manifest = json.loads(z.read(root + "manifest.json"))
        assert manifest["demo_data"] is True and manifest["heart"] == "301"
        assert [s["file_name"] for s in manifest["slices"]] == ["301IS89.5mg.tif", "301IS102mg.tif"]
        # Every file is listed with its SHA-256, and the hashes are right.
        listed = manifest["files_sha256"]
        assert set(listed) == {n[len(root) :] for n in names} - {"manifest.json"}
        for name, sha in listed.items():
            assert hashlib.sha256(z.read(root + name)).hexdigest() == sha
        first = manifest["slices"][0]
        original = next(f for f in first["files"] if "/original." in f)
        assert hashlib.sha256(z.read(root + original)).hexdigest() == first["image_sha256"]
        assert any(f.endswith("/layers/b_dead.png") for f in first["files"])
        assert "DEMO DATA" in z.read(root + "README.txt").decode()


def test_unknown_heart(client):
    for path in ["slices.csv", "methods", "export.zip"]:
        assert client.get(f"/api/v1/hearts/{'0' * 32}/{path}", headers=AUTH).status_code == 404


def test_safe_names():
    assert safe_name("206 / treated: #2") == "206-treated-2"
    assert safe_name("../..") == "heart"
    assert safe_name("é") == "heart"
