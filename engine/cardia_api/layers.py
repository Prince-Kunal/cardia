"""Layer PNGs for the slice viewer. Colours of masks are left to the UI (theme, colour-blind settings)."""

from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from .schemas import Layer


def _save(array: np.ndarray, path: Path) -> None:
    Image.fromarray(array).save(path, format="PNG", compress_level=3)


def mask_png(mask: np.ndarray, path: Path) -> None:
    """White where the mask is true, transparent elsewhere (grey + alpha)."""
    alpha = mask.astype(np.uint8) * 255
    _save(np.dstack([np.full_like(alpha, 255), alpha]), path)


def heatmap_png(p: np.ndarray, tissue: np.ndarray, path: Path) -> None:
    """Viridis colour map of p (0 dark blue, 1 yellow), transparent outside the tissue."""
    u8 = np.clip(np.round(np.nan_to_num(p, nan=0.0) * 255), 0, 255).astype(np.uint8)
    rgb = cv2.cvtColor(cv2.applyColorMap(u8, cv2.COLORMAP_VIRIDIS), cv2.COLOR_BGR2RGB)
    _save(np.dstack([rgb, tissue.astype(np.uint8) * 255]), path)


def write_layers(
    out_dir: Path,
    rgb: np.ndarray,
    corrected: np.ndarray,
    masks: dict,
    p_a: np.ndarray,
    p_b: np.ndarray,
    missing: np.ndarray,
) -> list[str]:
    """Write every layer of one slice into `out_dir`; returns their keys in Layer order.

    `p_a`, `p_b`: Methods A's and B's probability of dead; `missing`: Method C's share of the living stain
    missing (0-1)."""
    _save(np.ascontiguousarray(rgb), out_dir / f"{Layer.original}.png")
    _save(np.ascontiguousarray(corrected), out_dir / f"{Layer.corrected}.png")
    for key, mask in masks.items():
        mask_png(mask, out_dir / f"{Layer(key)}.png")
    heatmap_png(p_a, masks["tissue"], out_dir / f"{Layer.a_probability}.png")
    heatmap_png(p_b, masks["tissue"], out_dir / f"{Layer.b_probability}.png")
    heatmap_png(missing, masks["tissue"], out_dir / f"{Layer.c_stain_missing}.png")
    return [layer.value for layer in Layer]
