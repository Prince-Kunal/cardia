"""Method B "stain ratio" (2026-11-24; replaces the earlier a* cut and the short-lived Method C "stain hue").

TTC turns living muscle brick red (formazan); dead muscle keeps the cream of unstained tissue, and tissue in
between keeps part of the red. Method B asks of each pixel: does it hold less than half the red stain of
living muscle?

Colour is read as light absorbed: optical density OD = -log10(light that comes back / the paper's), per
channel. Stain adds to OD in proportion to how much of it there is (Beer-Lambert), and a shadow adds the same
OD to all three channels, so Method B uses two numbers that a shadow cannot change:

* stain   s = OD_green - OD_red (= log10 red / green): formazan absorbs green and hardly any red;
* tint    theta = atan2(s, OD_blue - OD_red), degrees: unstained tissue absorbs blue (cream, theta near 25),
  stained tissue leans red (theta near 40).

Two reference colours come from the 30 study photos (median OD of clearly unstained pixels and of clearly
stained pixels). The colour of tissue holding a fraction f of the living stain is unstained + f x (stained -
unstained) in OD. Dead = s and theta both below the f = 0.5 colour: half the stain, and leaning cream. The
tint condition keeps out pale pixels that lean red (whitish-pink surface, fibrous or glossy tissue): about as
common on normal hearts as on infarct hearts.

Range: low end f = 0.4, high end f = 0.6 (where the line falls if "half" were 40% or 60% of the living
stain). Borderline = in the high end and not the low end.

The colour comes from the paper flat field in linear light without clipping (`flat_field_linear`), averaged
over tissue-only neighbourhoods (sigma 2 px). The outer edge of every slice reads pale whatever its state (the
tissue thins and the paper shows through): pixels within `edge_px` of the slice outline take the colour of
the nearest pixel further in.

Every number comes from the 30 study photos without any label or reference
(`training/calibrate_method_b.py`, `models/stain_ratio/stain_ratio.json`).
"""

import json
from dataclasses import dataclass

import cv2
import numpy as np
from scipy import ndimage as ndi

from .lighting import flat_field_linear
from .method_a import masked_blur
from .models import MODELS_DIR, verified_path

STAIN_RATIO_JSON = "stain_ratio/stain_ratio.json"
OD_FLOOR = 1e-3  # linear light below this (OD above 3) is treated as OD 3


def edge_distance(tissue, holes_removed):
    """Distance in px from the slice's outline (holes inside the slice are not outline)."""
    return cv2.distanceTransform((tissue | holes_removed).astype(np.uint8), cv2.DIST_L2, 5)


def optical_density(rgb, paper, tissue, sigma):
    """OD per pixel and channel (H x W x 3), each channel averaged over tissue-only neighbourhoods."""
    lin = flat_field_linear(rgb, paper)
    lin = np.stack([masked_blur(lin[..., c], tissue, sigma) for c in range(3)], -1)
    return -np.log10(np.clip(lin, OD_FLOOR, None))


def fill_edge(od, tissue, holes_removed, edge_px):
    """Pixels within `edge_px` of the slice outline take the OD of the nearest pixel further in."""
    if edge_px <= 0:
        return od
    core = tissue & (edge_distance(tissue, holes_removed) > edge_px)
    if not core.any():
        return od
    iy, ix = ndi.distance_transform_edt(~core, return_indices=True)[1]
    return od[iy, ix]


def stain_and_tint(od):
    """(s, theta in degrees) from OD (... x 3)."""
    s = od[..., 1] - od[..., 0]
    return s, np.degrees(np.arctan2(s, od[..., 2] - od[..., 0]))


def stain_maps(rgb, paper, tissue, holes_removed, sigma, edge_px):
    """(stain s, tint theta in degrees) per pixel, NaN outside the tissue, with the slice edge filled in."""
    s, t = stain_and_tint(fill_edge(optical_density(rgb, paper, tissue, sigma), tissue, holes_removed, edge_px))
    s_out = np.full(tissue.shape, np.nan, np.float32)
    t_out = np.full(tissue.shape, np.nan, np.float32)
    s_out[tissue] = s[tissue]
    t_out[tissue] = t[tissue]
    return s_out, t_out


@dataclass(frozen=True)
class StainRatioModel:
    s_cut: float  # stain of tissue with half the living stain
    tint_cut: float  # its tint (degrees)
    s_low: float  # 40% of the living stain: range, low end
    tint_low: float
    s_high: float  # 60% of the living stain: range, high end
    tint_high: float
    sigma: float  # neighbourhood for the colour (px)
    edge_px: float  # slice-edge band that takes the colour from further in (px)
    info: dict  # the contents of stain_ratio.json

    @property
    def version(self) -> str:
        return self.info["model_version"]

    def stain_missing(self, stain):
        """Share of the living stain missing, 0 (as red as living muscle) to 1 (unstained), clipped; NaN stays NaN.

        From s alone, along the line between the two reference colours (it ignores the tint)."""
        cal = self.info["calibration"]
        s_u = stain_and_tint(np.array(cal["unstained_od"]))[0]
        s_s = stain_and_tint(np.array(cal["stained_od"]))[0]
        return np.clip((s_s - stain) / (s_s - s_u), 0.0, 1.0)

    @classmethod
    def from_info(cls, info: dict) -> StainRatioModel:
        c = info["cuts"]
        return cls(
            float(c["dead"]["s"]),
            float(c["dead"]["tint"]),
            float(c["low"]["s"]),
            float(c["low"]["tint"]),
            float(c["high"]["s"]),
            float(c["high"]["tint"]),
            float(info["sigma"]),
            float(info["edge_px"]),
            info,
        )

    @classmethod
    def load(cls, models_dir=MODELS_DIR) -> StainRatioModel:
        return cls.from_info(json.loads(verified_path(STAIN_RATIO_JSON, models_dir).read_text()))


@dataclass(frozen=True)
class MethodB:
    stain: np.ndarray  # s per pixel (NaN outside the tissue)
    tint: np.ndarray  # theta per pixel, degrees (NaN outside the tissue)
    dead: np.ndarray  # s < s_cut and theta < tint_cut
    borderline: np.ndarray  # in the range's high end but not its low end
    dead_pct: float
    borderline_pct: float
    low_pct: float  # the 40% rule; uncertain holes counted as holes
    high_pct: float  # the 60% rule; uncertain holes counted as tissue


def _pct(part, whole):
    n = int(whole.sum())
    return 100.0 * float((part & whole).sum()) / n if n else float("nan")


def summarise_b(stain, tint, tissue, uncertain_holes, model: StainRatioModel) -> MethodB:
    with np.errstate(invalid="ignore"):
        dead = tissue & (stain < model.s_cut) & (tint < model.tint_cut)
        low = tissue & (stain < model.s_low) & (tint < model.tint_low)
        high = tissue & (stain < model.s_high) & (tint < model.tint_high)
    return MethodB(
        stain=stain,
        tint=tint,
        dead=dead,
        borderline=high & ~low,
        dead_pct=_pct(dead, tissue),
        borderline_pct=_pct(high & ~low, tissue),
        low_pct=_pct(low, tissue & ~uncertain_holes),
        high_pct=_pct(high, tissue),
    )


def method_b(rgb, paper, tissue, holes_removed, uncertain_holes, model: StainRatioModel) -> MethodB:
    """Method B on one photo (RGB uint8) with the shared front end's paper, tissue and hole masks."""
    s, t = stain_maps(rgb, paper, tissue, holes_removed, model.sigma, model.edge_px)
    return summarise_b(s, t, tissue, uncertain_holes, model)
