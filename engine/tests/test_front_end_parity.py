"""The ported front end against the reference notebook's own output on the 30 study slices.

The notebook saved each slice's final tissue mask (`results_local/masks/<stem>_tissue.png`) after
removing the holes its held-out hole model found (Step 22). Hole removal is not ported yet, so:

* on the 22 slices where no hole was removed, our mask must equal the notebook's pixel for pixel;
* on the 8 where holes were removed, the notebook's mask must lie entirely inside ours.

With the notebook's held-out hole decisions applied, all 30 match exactly (test_holes_parity.py).
"""

import numpy as np
from PIL import Image

from ttc_pipeline import normalise_lighting, read_rgb, tissue_mask
from ttc_pipeline.color import to_lab

# Slices where the notebook's held-out hole model removed something (found 2026-11-20).
HOLES_REMOVED = {
    "108IS132mg.tif",
    "108IS138mg.tif",
    "109IS151mg.tif",
    "206IS127mg.tif",
    "206IS153mg.tif",
    "207IS110mg.tif",
    "208IS110mg.tif",
    "210IS138mg.tif",
}


def test_tissue_masks_match_the_notebook(study, reference_masks):
    exact, inside, problems = 0, 0, []
    for name, sl in study.items():
        tm = sl.tm
        ref_path = reference_masks / f"{name.rsplit('.', 1)[0]}_tissue.png"
        if not ref_path.exists():
            problems.append(f"{name}: reference mask missing")
            continue
        ref = np.asarray(Image.open(ref_path)) > 0
        extra_in_ref = int((ref & ~tm.tissue).sum())
        extra_in_ours = int((tm.tissue & ~ref).sum())
        if name in HOLES_REMOVED:
            if extra_in_ref or not extra_in_ours:
                problems.append(f"{name}: {extra_in_ref} px only in the notebook's mask, {extra_in_ours} only in ours")
            else:
                inside += 1
        elif extra_in_ref or extra_in_ours:
            problems.append(f"{name}: differs by {extra_in_ref} + {extra_in_ours} px")
        else:
            exact += 1
    assert not problems, "\n".join(problems)
    assert (exact, inside) == (22, 8)


def test_paper_is_evened_out_as_in_the_notebook(study):
    """Notebook Step 13: after correction, paper L* is 95.0-95.4 on all 30 photos."""
    paper_L = [float(np.median(to_lab(s.norm)[..., 0][s.paper])) for s in study.values()]
    assert 95.0 <= round(min(paper_L), 1) and round(max(paper_L), 1) <= 95.4, (min(paper_L), max(paper_L))


def test_same_scan_twice_is_bit_identical(scans, study):
    name, path = next(iter(scans.items()))
    norm, paper = normalise_lighting(read_rgb(path))
    first = study[name]
    assert np.array_equal(norm, first.norm) and np.array_equal(paper, first.paper)
    assert np.array_equal(tissue_mask(norm, paper).tissue, first.tm.tissue)
