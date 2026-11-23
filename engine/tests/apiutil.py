"""Helpers shared by the API tests: a mock-mode engine, synthetic scans, upload and wait."""

import io
import time

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image

from cardia_api.app import create_app
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
