"""Hole-model training and held-out scoring (reference notebook Steps 21-22).

Every candidate is labelled hole / not hole by overlap with the hand-marked outlines. Each
heart's candidates are then scored by a model trained on the other hearts (leave one heart
out), so no hole is judged by a model that saw it.
"""

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
from skimage import measure
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from ttc_pipeline.config import CFG
from ttc_pipeline.holes import decide_holes, hole_candidates

from .notebook_holes import FEATURES_3, FEATURES_4, notebook_candidates

ENGINE = Path(__file__).resolve().parents[1]
LABELS_PATH = ENGINE / "annotations" / "holes" / "hand_marked_holes.json"

MATCH_OVERLAP = 0.3  # a candidate is a hand-marked hole if they overlap by >= 30% of the smaller one
# Phase 0 pass rule for the hole file (PLAN.md §8), fixed before running
MAX_FALSE, MAX_LOST_PCT = 3, 1.0
# The research repo's pixel-level rule, reported as a second view: a hole is found if >= 50% of it is
# removed; a removed blob of >= 200 px is false if < 20% of it lies on a hand-marked hole.
FOUND_FRAC, FALSE_OVERLAP, MIN_BLOB_PX = 0.5, 0.2, 200


def load_labels(path=LABELS_PATH):
    """{file name: [polygon, ...]}, and the SHA-256 of the labels file."""
    raw = Path(path).read_bytes()
    return json.loads(raw)["holes"], hashlib.sha256(raw).hexdigest()


def hand_mask(shape, polygons):
    """Label image of the hand-marked holes: 0 = none, k = the k-th outline (1-based)."""
    hm = np.zeros(shape, np.uint8)
    for k, poly in enumerate(polygons, 1):
        cv2.fillPoly(hm, [np.array(poly, np.int32)], k)
    return hm


def match_holes(lab, cands, hm, name):
    """The hand-marked hole each candidate matches ("" if none), as "<file>#<k>"."""
    ids = []
    for label in cands.label:
        reg = lab == label
        hit = ""
        for k in range(1, hm.max() + 1):
            hk = hm == k
            if (reg & hk).sum() / min(reg.sum(), hk.sum()) >= MATCH_OVERLAP:
                hit = f"{name}#{k}"
        ids.append(hit)
    return ids


@dataclass
class CandidateSet:
    table: pd.DataFrame  # every candidate on every slice: measurements, slice, file, heart, hole_id, is_hole
    labels: dict  # file name -> candidate label image
    n_holes: int  # hand-marked holes in total


def build_candidates(slices, labels, candidates_fn=hole_candidates):
    """`slices`: StudySlice objects in study order. `candidates_fn` is the candidate recipe (the shipped one by default)."""
    frames, label_images = [], {}
    for i, s in enumerate(slices):
        lab, f = candidates_fn(s.norm, s.tm.tissue, s.paper)
        f["slice"], f["file"], f["heart"] = i, s.name, s.heart
        f["hole_id"] = match_holes(lab, f, hand_mask(s.tm.tissue.shape, labels.get(s.name, [])), s.name)
        f["is_hole"] = (f.hole_id != "").astype(int)
        label_images[s.name] = lab
        if len(f):
            frames.append(f)
    table = pd.concat(frames, ignore_index=True)
    num = [c for c in table.columns if c not in ("label", "slice", "file", "heart", "hole_id", "is_hole")]
    table[num] = table[num].astype(float)
    table["is_hole"] = table.is_hole.astype(int)
    return CandidateSet(table, label_images, sum(len(v) for v in labels.values()))


def new_hole_model():
    return make_pipeline(
        StandardScaler(), LogisticRegression(C=CFG["holes"]["lr_C"], class_weight="balanced", max_iter=2000)
    )


def fit_hole_model(table, features):
    return new_hole_model().fit(table[features].values, table.is_hole.values)


def loho_scores(table, features):
    """Each heart's candidates scored by a model trained on the other hearts."""
    scores = pd.Series(np.nan, index=table.index)
    for h in sorted(table.heart.unique()):
        tr, te = (table.heart != h).values, (table.heart == h).values
        if te.any():
            model = new_hole_model().fit(table.loc[tr, features].values, table.is_hole[tr].values)
            scores[te] = model.predict_proba(table.loc[te, features].values)[:, 1]
    return scores


def found_and_false(table, called):
    """(hand-marked holes found, candidates wrongly called holes) for a boolean per-candidate decision."""
    called = np.asarray(called, bool)
    return table.hole_id[called & (table.is_hole == 1)].nunique(), int((called & (table.is_hole == 0)).sum())


def choose_features(table, cut=None):
    """The notebook's rule: add flatness only if, held out, it finds at least as many holes with no more
    false holes, and does better on one of the two. Returns (features, {name: held-out scores})."""
    cut = CFG["holes"]["score_cut"] if cut is None else cut
    s3, s4 = loho_scores(table, FEATURES_3), loho_scores(table, FEATURES_4)
    (f3, x3), (f4, x4) = found_and_false(table, s3 >= cut), found_and_false(table, s4 >= cut)
    use_flatness = f4 >= f3 and x4 <= x3 and (f4 > f3 or x4 < x3)
    return (FEATURES_4 if use_flatness else FEATURES_3), {"3 measures": s3, "4 measures": s4}


def held_out_summary(cs, scores, slices, labels, cut=None):
    """How a set of held-out scores does against the hand-marked holes, and whether it passes the Phase 0 rule."""
    cut = CFG["holes"]["score_cut"] if cut is None else cut
    t = cs.table
    called = (scores >= cut).values
    found, false = found_and_false(t, called)
    px_found, px_false, lost, wrong_slices = 0, 0, [], 0
    for i, s in enumerate(slices):
        pred = np.isin(cs.labels[s.name], t.label[(t.slice == i).values & called]) & s.tm.tissue
        hm = hand_mask(s.tm.tissue.shape, labels.get(s.name, []))
        truth = hm > 0
        px_found += sum(bool(pred[hm == k].mean() >= FOUND_FRAC) for k in range(1, hm.max() + 1))
        for r in measure.regionprops(measure.label(pred, connectivity=2)):
            if r.area >= MIN_BLOB_PX and truth[r.coords[:, 0], r.coords[:, 1]].mean() < FALSE_OVERLAP:
                px_false += 1
        lost.append(100 * (pred & ~truth).sum() / s.tm.tissue.sum())
        wrong_slices += bool(truth.any()) != bool(pred.any())
    worst = round(float(max(lost)), 2)
    return {
        "holes_found": found,
        "holes_marked": cs.n_holes,
        "false_holes": false,
        "holes_found_pixel_rule": px_found,
        "false_holes_pixel_rule": px_false,
        "worst_slice_tissue_lost_wrongly_pct": worst,
        "slices_wrong": wrong_slices,
        "slices": len(slices),
        "roc_auc": round(float(roc_auc_score(t.is_hole, scores)), 3),
        "candidates": len(t),
        "holes_among_candidates": int(t.hole_id[t.is_hole == 1].nunique()),
        "passes_phase0_rule": bool(false <= MAX_FALSE and worst <= MAX_LOST_PCT),
    }


def notebook_tissues(slices, labels, cs=None):
    """{file name: tissue mask} as the notebook saved them: its own hole recipe, each heart's holes decided
    by a model trained on the other hearts (Steps 20-22). Method A's frozen forest was trained on these.
    `cs`: the notebook recipe's CandidateSet, if already built."""
    cs = cs or build_candidates(slices, labels, candidates_fn=notebook_candidates)
    features, scores = choose_features(cs.table)
    held_out = scores["4 measures" if len(features) == 4 else "3 measures"]
    out = {}
    for i, s in enumerate(slices):
        rows = (cs.table.slice == i).values
        tissue = s.tm.tissue
        if rows.any():
            holes = decide_holes(cs.labels[s.name], cs.table[rows], held_out[rows].values, tissue, 0.8, 0.5)
            tissue = tissue & ~holes.removed
        out[s.name] = tissue
    return out
