"""Reading a slice photo and its file name (reference notebook Steps 5 and 75)."""

import re
from pathlib import Path

import numpy as np
from PIL import Image

STUDY_NAME = re.compile(r"(\d{3})IS([\d.]+)mg\.tif$", re.IGNORECASE)  # the 30 study scans, e.g. 109IS104mg.tif
_NAME_INFO = re.compile(r"(\d{3})IS([\d.]+)mg", re.IGNORECASE)


def read_rgb(path):
    """The photo as an RGB uint8 array, read exactly as the notebook does."""
    return np.asarray(Image.open(path).convert("RGB"))


def parse_name(name):
    """(heart ID, slice weight in mg) from a name like `109IS104mg.tif`; (file stem, None) if it doesn't match."""
    m = _NAME_INFO.search(name)
    return (m.group(1), float(m.group(2))) if m else (Path(name).stem, None)
