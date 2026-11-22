"""Method B's cut-off recipe (research repo `evaluate_final.py`), for any front end.

* Conservative cut: the a* cut (grid 4-22, step 0.25) whose slice infarct % is closest to the
  YHS lab values on the time-control slices (mean absolute error). Reported leave one heart out:
  each time-control heart is measured with the cut chosen on the others.
* Liberal cut: the label-free valley of a 2-component GMM on a* pooled from all 30 slices
  (5,000 pixels per slice, seed 42), rounded to 2 decimals as the repo shipped it.
"""

import fnmatch
import os
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from .method_b_original import RednessModel, repo_order
from .study import DATA

GRID = np.arange(4.0, 22.01, 0.25)
TIME_CONTROL = ("108", "109", "119", "129")
PASS_MAE_PP = 2.9  # PLAN.md §2f: the original 2.4 pp + 0.5


def read_out(pattern, data=DATA):
    """{file name: column 4 (infarct %)} from the lab's .out tables under data/ (symlinks followed)."""
    rows = {}
    paths = [Path(d) / f for d, _, files in os.walk(data, followlinks=True) for f in files]
    for p in sorted(q for q in paths if fnmatch.fnmatch(q.name, pattern)):
        for line in p.read_text(errors="ignore").splitlines():
            x = line.strip().split("\t")
            if x[0].lower().endswith(".tif") and len(x) >= 5:
                rows[x[0]] = float(x[4])
    return rows


def pct(a, cut):
    return 100.0 * float(np.mean(a < cut))


@dataclass
class Calibration:
    conservative: float  # chosen on all time-control slices with YHS
    liberal: float  # GMM valley, rounded to 2 decimals
    liberal_exact: float
    loho_cuts: dict  # held-out time-control heart -> cut chosen on the others
    loho_pct: dict = field(repr=False)  # time-control slice -> infarct % with its held-out cut
    mae_vs_yhs: float = 0.0  # time-control slices, held out

    @property
    def passes(self):
        return self.mae_vs_yhs <= PASS_MAE_PP


def calibrate(a_images, tissues, yhs):
    """`a_images`, `tissues`: {file name: smoothed a* image / tissue mask} for all 30 slices; `yhs`: {file name: %}."""
    a_vals = {n: a_images[n][tissues[n]] for n in a_images}
    cal = [n for n in repo_order(a_vals) if n in yhs]

    def mae(names, cut):
        return float(np.mean([abs(pct(a_vals[n], cut) - yhs[n]) for n in names]))

    def best(names):
        return float(GRID[int(np.argmin([mae(names, c) for c in GRID]))])

    hearts = sorted({n[:3] for n in cal})
    loho = {h: best([n for n in cal if n[:3] != h]) for h in hearts}
    loho_pct = {n: pct(a_vals[n], loho[n[:3]]) for n in cal}
    order = repo_order(a_images)
    gmm = RednessModel().fit([a_images[n] for n in order], [tissues[n] for n in order])
    return Calibration(
        conservative=best(cal),
        liberal=round(gmm.a_cut, 2),
        liberal_exact=gmm.a_cut,
        loho_cuts=loho,
        loho_pct=loho_pct,
        mae_vs_yhs=float(np.mean([abs(loho_pct[n] - yhs[n]) for n in cal])),
    )
