"""The API's worker processes give the golden set's numbers and masks (PLAN.md §7).

Same rules as test_golden.py: identical on the platform that made the golden set, within 0.1 pp and
IoU >= 0.99 elsewhere. Skips without the study scans, the golden set or the model files.
"""

import io
import json
import time

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from cardia_api.app import create_app
from cardia_api.settings import Settings
from training.golden import GOLDEN, MASKS, platform_tag
from ttc_pipeline import ModelFileError

TOKEN = "golden-" + "x" * 32
AUTH = {"Authorization": f"Bearer {TOKEN}"}
COLUMNS = {  # golden column -> (result section, key)
    "a_dead_pct": ("method_a", "dead_pct"),
    "a_unsure_pct": ("method_a", "unsure_pct"),
    "b_dead_pct": ("method_b", "dead_pct"),
    "b_borderline_pct": ("method_b", "borderline_pct"),
}


def test_the_api_reproduces_the_golden_set(scans, tmp_path):
    if not (GOLDEN / "per_slice.csv").exists():
        pytest.skip("needs the golden set in reference/golden/ (team Drive)")
    table = pd.read_csv(GOLDEN / "per_slice.csv", keep_default_na=False).set_index("file")
    exact = json.loads((GOLDEN / "meta.json").read_text())["platform"] == platform_tag()
    settings = Settings(data_dir=tmp_path, token=TOKEN, allowed_hosts=("testserver",))
    try:
        app = create_app(settings)
    except ModelFileError as e:
        pytest.skip(f"no frozen models on this machine: {e}")
    with TestClient(app) as client:
        files = [("files", (name, path.read_bytes())) for name, path in scans.items()]
        job = client.post("/api/v1/jobs", headers=AUTH, files=files).json()
        while job["finished_at"] is None:
            time.sleep(0.2)
            job = client.get(f"/api/v1/jobs/{job['job_id']}", headers=AUTH).json()
        assert job["counts"]["done"] == 30, job
        for entry in job["slices"]:
            name, sid = entry["file_name"], entry["slice_id"]
            want = table.loc[name]
            got = client.get(f"/api/v1/slices/{sid}", headers=AUTH).json()
            assert ";".join(got["qc_flags"]) == want.qc_flags, name
            for col, (section, key) in COLUMNS.items():
                value = got[section][key]
                if exact:
                    assert f"{value:.10g}" == f"{want[col]:.10g}", (name, col)
                else:
                    assert abs(value - want[col]) <= 0.1, (name, col)
            assert got["tissue"]["tissue_px"] == want.tissue_px or not exact, name
            assert got["method_b"]["tissue_px"] == want.b_tissue_px or not exact, name
            for k in MASKS:
                png = client.get(f"/api/v1/slices/{sid}/layers/{k}", headers=AUTH).content
                mask = np.asarray(Image.open(io.BytesIO(png)))[..., 1] > 0
                ref = np.asarray(Image.open(GOLDEN / "masks" / f"{name[:-4]}_{k}.png")) > 0
                if exact:
                    assert np.array_equal(mask, ref), (name, k)
                elif ref.any() or mask.any():
                    assert (mask & ref).sum() / (mask | ref).sum() >= 0.99, (name, k)
