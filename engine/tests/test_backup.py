"""Backup and restore of the whole library (PLAN.md §1e), and the study set used as a report's context
(§1d). Mock-mode engines, so these run in CI."""

import csv
import io
import json
import zipfile
from pathlib import Path

import pytest
from apiutil import AUTH, make_client, scan, upload, wait

from cardia_api.study_set import GOLDEN, load


def hearts(client):
    r = client.get("/api/v1/hearts", headers=AUTH)
    assert r.status_code == 200, r.text
    return {h["label"]: h for h in r.json()}


def backup(client) -> bytes:
    r = client.get("/api/v1/library/backup.zip", headers=AUTH)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/zip"
    assert "cardia-backup-" in r.headers["content-disposition"]
    return r.content


def restore(client, data: bytes, name="backup.zip"):
    return client.post("/api/v1/library/restore", headers=AUTH, files={"backup": (name, data, "application/zip")})


@pytest.fixture(scope="module")
def source(tmp_path_factory):
    with make_client(tmp_path_factory.mktemp("source"), workers=2) as c:
        wait(
            c,
            upload(c, [("301IS90mg.tif", scan(11)), ("301IS95mg.tif", scan(12)), ("302IS80mg.tif", scan(13))])[
                "job_id"
            ],
        )
        key = hearts(c)["301"]["heart_key"]
        r = c.patch(
            f"/api/v1/hearts/{key}", headers=AUTH, json={"group": "treated", "tags": ["pilot"], "notes": "kept"}
        )
        assert r.status_code == 200, r.text
        yield c


@pytest.fixture(scope="module")
def archive(source) -> bytes:
    return backup(source)


def test_a_backup_holds_the_library_every_scan_and_result_with_a_manifest(archive):
    zf = zipfile.ZipFile(io.BytesIO(archive))
    manifest = json.loads(zf.read("manifest.json"))
    assert manifest["format"] == "cardia-backup" and manifest["version"] == 1
    assert manifest["counts"] == {"hearts": 2, "slices": 3, "images": 3}
    assert manifest["mock"] is True and manifest["api_version"]
    names = set(zf.namelist())
    assert "library.sqlite3" in names
    assert sum(n.startswith("images/") for n in names) == 3
    assert sum(n.endswith("/result.json") for n in names) == 3
    assert {f["path"] for f in manifest["files"]} | {"manifest.json"} == names
    assert not any("engine.json" in n for n in names)  # never the engine's token


def test_restoring_into_an_empty_library_brings_everything_back(archive, tmp_path):
    with make_client(tmp_path) as c:
        r = restore(c, archive)
        assert r.status_code == 200, r.text
        report = r.json()
        assert report["hearts_added"] == 2 and report["hearts_skipped"] == 0
        assert report["slices_added"] == 3 and report["slice_results_copied"] == 3 and report["images_copied"] == 3
        h = hearts(c)["301"]
        assert h["group"] == "treated" and h["tags"] == ["pilot"] and h["notes"] == "kept"
        assert [s["file_name"] for s in h["slices"]] == ["301IS90mg.tif", "301IS95mg.tif"]
        assert h["summary"]["total_weight_mg"] == 185.0
        # Every layer and scan is servable again.
        slice_id = h["slices"][0]["slice_id"]
        assert c.get(f"/api/v1/slices/{slice_id}/layers/corrected", headers=AUTH).status_code == 200


def test_restoring_never_overwrites(source, archive):
    key = hearts(source)["301"]["heart_key"]
    assert source.patch(f"/api/v1/hearts/{key}", headers=AUTH, json={"notes": "changed since"}).status_code == 200
    report = restore(source, archive).json()
    assert report["hearts_added"] == 0 and report["hearts_skipped"] == 2
    assert report["slices_added"] == 0 and report["images_copied"] == 0 and report["slice_results_copied"] == 0
    assert hearts(source)["301"]["notes"] == "changed since"


def test_a_damaged_or_foreign_file_is_refused_and_changes_nothing(archive, tmp_path):
    with make_client(tmp_path) as c:
        assert restore(c, b"not a zip").status_code == 400
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("readme.txt", "hello")
        assert "not a Cardia backup" in restore(c, buf.getvalue()).json()["detail"]
        # Flip bytes in one scan: the SHA-256 no longer matches the manifest.
        src = zipfile.ZipFile(io.BytesIO(archive))
        damaged = io.BytesIO()
        with zipfile.ZipFile(damaged, "w") as zf:
            for info in src.infolist():
                data = src.read(info.filename)
                if info.filename.startswith("images/"):
                    data = data[:100] + bytes([data[100] ^ 0xFF]) + data[101:]
                zf.writestr(info.filename, data)
        r = restore(c, damaged.getvalue())
        assert r.status_code == 400 and "damaged" in r.json()["detail"]
        # A path outside the backup's folders is refused, so nothing can be written elsewhere.
        evil = io.BytesIO()
        manifest = json.loads(src.read("manifest.json"))
        manifest["files"].append({"path": "../escape.txt", "sha256": "0" * 64, "bytes": 1})
        with zipfile.ZipFile(evil, "w") as zf:
            for info in src.infolist():
                if info.filename != "manifest.json":
                    zf.writestr(info.filename, src.read(info.filename))
            zf.writestr("manifest.json", json.dumps(manifest))
            zf.writestr("../escape.txt", "x")
        assert restore(c, evil.getvalue()).status_code == 400
        assert not (Path(tmp_path).parent / "escape.txt").exists()
        assert hearts(c) == {}
        assert list(Path(tmp_path, "images").iterdir()) == []


def test_the_study_set_matches_the_golden_set():
    study = load()
    assert study is not None
    meta = json.loads((GOLDEN / "meta.json").read_text())
    assert study.pipeline_version == meta["pipeline_version"]
    assert study.models_manifest_sha256 == meta["models_manifest_sha256"]
    with open(GOLDEN / "per_slice.csv", newline="") as f:
        rows = list(csv.DictReader(f))
    assert len(study.hearts) == len({r["heart"] for r in rows})
    assert sum(h.slices for h in study.hearts) == len(rows)
    # Each heart's % is its slices' %s weighted by slice weight.
    first = study.hearts[0]
    mine = [r for r in rows if r["heart"] == first.heart_id]
    expected = sum(float(r["a_dead_pct"]) * float(r["weight_mg"]) for r in mine) / sum(
        float(r["weight_mg"]) for r in mine
    )
    assert first.method_a_dead_pct == pytest.approx(expected)
    assert all(0 <= h.method_b_dead_pct <= 100 and 0 <= h.method_c_dead_pct <= 100 for h in study.hearts)


def test_the_study_set_is_served(source):
    r = source.get("/api/v1/study-set", headers=AUTH)
    assert r.status_code == 200, r.text
    assert len(r.json()["hearts"]) == len(load().hearts)
