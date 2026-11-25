"""Fix Method C's numbers from the 30 study slices, without any label or reference (2026-11-24).

Method C "stain ratio" (ttc_pipeline/method_c.py): dead = less than half the red stain of living muscle, and
leaning cream. Each number below comes from the pooled study photos by a recipe fixed while designing; no
reference or label sets any of them.

* edge_px: the slice edge reads pale whatever its state. For each slice, the median stain s at each distance
  from the outline (0-39 px) is rescaled from its edge value (0) to the slice's own plateau (median of
  25-39 px, 1); the median over slices first reaching 0.9 sets the band that takes its colour from further in.
* Reference colours: the unstained peak of s (Gaussian KDE, bandwidth factor 0.08) and its spread sd from the
  peak's lower side (half width at half maximum / 1.1774; the upper side overlaps stained tissue). Unstained =
  median OD of pixels below the peak; stained = median OD of pixels above peak + 4 sd.
* Cuts: the colour holding a fraction f of the living stain, OD = unstained + f x (stained - unstained): its
  stain s and tint theta. f = 0.5 decides dead; 0.4 and 0.6 give the range.

Each slice gives the same number of pixels (6,000, seed 0), so large slices do not dominate. The cuts are also
recomputed with each heart left out (stored for the scorecard's held-out check). The YHS lab values are read
only afterwards, to record how the frozen rule does on the 11 time-control slices.

Rejected while designing (2026-11-24; README "Method C"): a* with a hue gate (the short-lived "stain hue" method: a* shrinks in dark
pixels and the gate missed near-white cream), s alone (counts whitish-pink pale tissue, as common on normal
hearts as on infarct hearts), a lightness term (blurs the cream/red split; shadows move it), the valley of s
(shallow: moved from 0.19 to 0.30 with the hearts used), the valley of theta (a 3% dip that moved with the
pixel sample), half-unstained by area (linear-light mixing; reads specks, not the uniformly weak stain of pale
pink tissue), a classifier of control vs infarct hearts' colours (learned heart-to-heart colour differences:
95-99% dead on infarct hearts) and a neighbourhood rule for pale pixels next to cream (under 3 points).

    cd engine && uv run python -m training.calibrate_method_c
"""

import datetime
import sys

import numpy as np
from scipy.signal import argrelextrema
from scipy.stats import gaussian_kde

from ttc_pipeline import PIPELINE_VERSION, parse_name, read_rgb, run_front_end
from ttc_pipeline.method_c import (
    STAIN_RATIO_JSON,
    StainRatioModel,
    edge_distance,
    fill_edge,
    optical_density,
    stain_and_tint,
)
from ttc_pipeline.models import MODELS_DIR, HoleModel

from .manifest import update_manifest, write_json
from .study import read_out, study_scans

SIGMA = 2.0
PX_PER_SLICE = 6000
SEED = 0
KDE_BW = 0.08
EDGE_PROFILE_PX, EDGE_PLATEAU, EDGE_RISE = 40, (25, 40), 0.9
S_GRID = np.linspace(-0.2, 1.0, 2400)
UNSTAINED_PEAK_SEARCH = (0.05, 0.25)
STAINED_SD = 4
FRACTIONS = {"low": 0.4, "dead": 0.5, "high": 0.6}
MODEL_VERSION = "1.0.0"


def study_od(scans, holes):
    """{file name: (OD before the edge fill, tissue, holes removed)} through the shared front end."""
    out = {}
    for name, path in scans.items():
        rgb = read_rgb(path)
        fe = run_front_end(rgb, holes)
        out[name] = (optical_density(rgb, fe.paper, fe.tissue, SIGMA), fe.tissue, fe.holes.removed)
    return out


def edge_width(raw):
    """The px from the outline at which the pale edge has recovered 90% of the way to the slice's plateau."""
    rises = []
    for od, tissue, removed in raw.values():
        s = stain_and_tint(od)[0]
        d = edge_distance(tissue, removed)
        prof = np.array([np.median(s[tissue & (d > k) & (d <= k + 1)]) for k in range(EDGE_PROFILE_PX)])
        plateau, edge = np.nanmedian(prof[EDGE_PLATEAU[0] : EDGE_PLATEAU[1]]), prof[0]
        if plateau - edge > 0.03:
            rises.append((prof - edge) / (plateau - edge))
    rise = np.nanmedian(np.array(rises), 0)
    return int(np.argmax(rise >= EDGE_RISE)), rise, len(rises)


def tissue_od(raw, edge_px):
    """{file name: OD of every tissue pixel (n x 3)} after the edge fill."""
    return {n: fill_edge(od, t, r, edge_px)[t] for n, (od, t, r) in raw.items()}


def pooled(px, names):
    rng = np.random.default_rng(SEED)
    return np.concatenate([px[n][rng.choice(len(px[n]), PX_PER_SLICE, replace=False)] for n in names])


def colour_at(unstained, stained, f):
    """(s, theta) of tissue holding a fraction f of the living stain."""
    s, t = stain_and_tint(unstained + f * (stained - unstained))
    return float(s), float(t)


def rule(px, names):
    """Reference colours and cuts from the given slices."""
    od = pooled(px, names)
    s = stain_and_tint(od)[0]
    d = gaussian_kde(s, bw_method=KDE_BW)(S_GRID)
    ip = max(
        (i for i in argrelextrema(d, np.greater)[0] if UNSTAINED_PEAK_SEARCH[0] < S_GRID[i] < UNSTAINED_PEAK_SEARCH[1]),
        key=lambda i: d[i],
    )
    j = ip
    while j > 0 and d[j] > d[ip] / 2:
        j -= 1
    peak = float(S_GRID[ip])
    sd = float(S_GRID[ip] - S_GRID[j]) / np.sqrt(2 * np.log(2))
    unstained = np.median(od[s < peak], 0)
    stained = np.median(od[s > peak + STAINED_SD * sd], 0)
    cuts = {}
    for k, f in FRACTIONS.items():
        cs, ct = colour_at(unstained, stained, f)
        cuts[k] = {"fraction_of_living_stain": f, "s": round(cs, 4), "tint": round(ct, 2)}
    return {
        "unstained_peak_s": round(peak, 4),
        "unstained_peak_sd": round(sd, 4),
        "unstained_od": [round(float(v), 4) for v in unstained],
        "stained_od": [round(float(v), 4) for v in stained],
        "cuts": cuts,
    }


def main():
    scans = study_scans()
    assert len(scans) == 30, f"expected the 30 study scans in data/, found {len(scans)}"
    holes = HoleModel.load()
    raw = study_od(scans, holes)
    edge_px, rise, n_rise = edge_width(raw)
    px = tissue_od(raw, edge_px)
    names = list(px)
    r = rule(px, names)
    hearts = sorted({parse_name(n)[0] for n in names})
    loho = {h: rule(px, [n for n in names if parse_name(n)[0] != h])["cuts"] for h in hearts}
    info = {
        "model": "stain_ratio",
        "model_version": MODEL_VERSION,
        "trained": datetime.date.today().isoformat(),
        "pipeline_version": PIPELINE_VERSION,
        "hole_model_version": holes.version,
        "measure": (
            "optical density OD = -log10(linear light / paper) from the paper flat field in linear light without "
            "clipping, each channel averaged over tissue-only neighbourhoods; stain s = OD_G - OD_R; tint theta = "
            "atan2(s, OD_B - OD_R) in degrees; pixels within edge_px of the slice outline take the OD of the "
            "nearest pixel further in"
        ),
        "sigma": SIGMA,
        "edge_px": edge_px,
        "cuts": r["cuts"],
        "rule": "dead = s < cuts.dead.s and theta < cuts.dead.tint; range low / high = the same with cuts.low / "
        "cuts.high; borderline = high and not low",
        "calibration": {
            "unstained_peak_s": r["unstained_peak_s"],
            "unstained_peak_sd": r["unstained_peak_sd"],
            "unstained_od": r["unstained_od"],
            "stained_od": r["stained_od"],
            "leave_one_heart_out": loho,
            "edge_rise_by_px": [round(float(v), 3) for v in rise],
            "edge_slices_with_a_pale_edge": n_rise,
        },
        "recipe": {
            "edge_px": f"first distance from the outline where the median over slices of each slice's rescaled s "
            f"profile (edge 0, plateau {EDGE_PLATEAU[0]}-{EDGE_PLATEAU[1] - 1} px = 1) reaches {EDGE_RISE}",
            "reference_colours": f"unstained = median OD of pixels with s below the unstained peak of s (Gaussian "
            f"KDE, bandwidth factor {KDE_BW}, highest maximum between {UNSTAINED_PEAK_SEARCH[0]} and "
            f"{UNSTAINED_PEAK_SEARCH[1]}); stained = median OD of pixels with s above the peak + {STAINED_SD} sd, "
            f"sd = the peak's lower half width at half maximum / 1.1774; {PX_PER_SLICE} tissue px per slice, seed "
            f"{SEED}, all 30 study slices",
            "cuts": "s and theta of OD = unstained + f x (stained - unstained), f = "
            + ", ".join(f"{v} ({k})" for k, v in FRACTIONS.items()),
            "labels_or_references_used": False,
        },
        "python": sys.version.split()[0],
    }
    model = StainRatioModel.from_info(info)
    yhs = read_out("*InfSizeYHS.out")
    err = []
    for n, v in yhs.items():
        s, t = stain_and_tint(px[n])
        err.append(abs(100 * float(((s < model.s_cut) & (t < model.tint_cut)).mean()) - v))
    info["evidence"] = {"time_control_slices_mae_vs_yhs_pp": round(float(np.mean(err)), 2), "slices": len(err)}
    write_json(MODELS_DIR / STAIN_RATIO_JSON, info)
    update_manifest({STAIN_RATIO_JSON: {"model_version": MODEL_VERSION}})
    print(f"edge {edge_px} px; cuts {r['cuts']}")
    for h, c in loho.items():
        print(f"  without {h}: dead s {c['dead']['s']}, tint {c['dead']['tint']}")
    print(f"YHS mean absolute error on the {len(err)} time-control slices: {np.mean(err):.2f} pp")


if __name__ == "__main__":
    main()
