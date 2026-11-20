"""Colour helpers (reference notebook Part D, Step 10)."""

import cv2
import numpy as np
from skimage import measure


def srgb_to_lin(x):
    x = x.astype(np.float32) / 255.0
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(y):
    y = np.clip(y, 0, 1)
    return np.where(y <= 0.0031308, 12.92 * y, 1.055 * np.power(y, 1 / 2.4) - 0.055)


def to_lab(rgb_u8):
    """L* 0-100 (dark..light), a* (green..red), b* (blue..yellow); 0 = neutral grey."""
    return cv2.cvtColor(rgb_u8.astype(np.float32) / 255.0, cv2.COLOR_RGB2LAB)


def largest_components(mask, keep_frac=0.15):
    """Keep the biggest connected blob (and any blob at least 15% of its size)."""
    lab = measure.label(mask, connectivity=2)
    if lab.max() == 0:
        return mask & False
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    return np.isin(lab, np.flatnonzero(sizes >= keep_frac * sizes.max()))
