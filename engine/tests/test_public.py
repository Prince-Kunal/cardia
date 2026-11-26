"""Public mode (deploy/README.md): no token, a UI served from the engine itself, no backup or restore."""

import pytest
from apiutil import make_client


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    web = tmp_path_factory.mktemp("web")
    (web / "index.html").write_text("<title>Cardia</title>")
    with make_client(tmp_path_factory.mktemp("engine"), public=True, web_dir=web) as c:
        yield c


def test_no_token_needed(client):
    r = client.get("/api/v1/engine")
    assert r.status_code == 200
    assert r.json()["mock"] is True


def test_the_web_app_is_served_at_the_root(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "Cardia" in r.text
    assert client.get("/api/v1/health").json()["status"] == "ok"  # and never hides the API


def test_same_origin_pages_may_call_it_and_other_origins_may_not(client):
    assert client.get("/api/v1/engine", headers={"Origin": "http://testserver"}).status_code == 200
    r = client.get("/api/v1/engine", headers={"Origin": "https://evil.example"})
    assert r.status_code == 403


def test_backup_and_restore_are_off(client):
    assert client.get("/api/v1/library/backup.zip").status_code == 403
    r = client.post("/api/v1/library/restore", files={"backup": ("b.zip", b"x")})
    assert r.status_code == 403
