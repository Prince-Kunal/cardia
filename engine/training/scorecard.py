"""Phase 0 scorecard: both methods through the same checks (PLAN.md §8).

Every number is held out unless it says otherwise:
* Method A: each heart is scored by a forest retrained on the other 7 hearts (training/method_a.py), on the
  shipped front end. "A (app)" is the frozen forest, which saw every heart.
* Method B ("stain ratio", 2026-11-24): each heart is scored with the cuts recalibrated on the other 7 hearts
  (models/stain_ratio/stain_ratio.json, "leave_one_heart_out"); no label or reference sets any cut.

References: Ref-0 = the professor's .out files; Ref-1 = the notebook's corrected reference (her live cut-off
inside the notebook's tissue); Ref-YHS = the second lab file (hearts 109, 119, 129). None is ground truth.
Pixel metrics are pooled over all 30 slices on Ref-1's tissue.

    cd engine && uv run python -m training.scorecard        # about 10 minutes; writes reference/phase0/
"""

import json
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from PIL import Image
from scipy import ndimage as ndi
from sklearn.metrics import roc_auc_score

from ttc_pipeline import ForestModel, HoleModel, StainRatioModel, parse_name, read_rgb, run_front_end
from ttc_pipeline.color import lin_to_srgb, srgb_to_lin
from ttc_pipeline.method_a import pixel_features, summarise_a
from ttc_pipeline.method_b import stain_maps, summarise_b

from .method_a import fit_k_means_rf
from .study import REPO, read_out, study_scans

OUT = REPO / "reference" / "phase0"
NB_MASKS = REPO / "reference" / "results_local" / "masks"
TIME_CONTROL = ("108", "109", "119", "129")
PROF_LIVE_CUT = {"A": 145, "B": 150}  # the professor's live cut-off per photo batch (notebook CFG["prof_rule"])
BATCH_A = ("206", "207", "208", "210")
SEED = 42
SHADOW_LEVELS = (0.75, 0.55)
RIM_PX = 3
W_GRAY = np.array([0.298936021293775, 0.587043074451121, 0.114020904255103])


# ---------- references ----------


def matlab_gray(img):
    return np.round(img.astype(np.float64) @ W_GRAY)


def ref1(rgb, name):
    """Ref-1 (notebook Step 25) on the notebook's saved tissue mask; checked against its saved Ref-1 mask."""
    nb_tissue = np.asarray(Image.open(NB_MASKS / f"{name[:-4]}_tissue.png")) > 0
    vc = PROF_LIVE_CUT["A" if name[:3] in BATCH_A else "B"]
    dead = nb_tissue & (matlab_gray(rgb) > vc)
    saved = np.asarray(Image.open(NB_MASKS / f"{name[:-4]}_ref1_dead.png")) > 0
    assert np.array_equal(dead, saved), f"{name}: Ref-1 does not reproduce the notebook's"
    return nb_tissue, dead


# ---------- notebook helpers (Steps 51 and 62) ----------


def shade_image(img, tissue, level, seed):
    """A round soft shadow over about a third of the tissue, in linear light, the same in R, G and B."""
    ys, xs = np.nonzero(tissue)
    k = np.random.default_rng(seed).integers(len(ys))
    r = 0.3 * np.sqrt(tissue.sum())
    yy, xx = np.mgrid[: tissue.shape[0], : tissue.shape[1]]
    w = np.exp(-((yy - ys[k]) ** 2 + (xx - xs[k]) ** 2) / (2 * (r / 1.5) ** 2))
    lit = srgb_to_lin(img) * (1 - (1 - level) * w)[..., None]
    return np.clip(np.round(lin_to_srgb(lit) * 255), 0, 255).astype(np.uint8), w


def rim_fix(p_tissue, tissue, r=RIM_PX):
    """Each tissue pixel within r px of non-tissue takes the probability of the nearest pixel further inside."""
    d = ndi.distance_transform_edt(tissue)
    inner = d > r
    if not inner.any():
        return np.asarray(p_tissue, np.float32)
    img = np.zeros(tissue.shape, np.float32)
    img[tissue] = p_tissue
    iy, ix = ndi.distance_transform_edt(~inner, return_indices=True)[1]
    return img[iy, ix][tissue].astype(np.float32)


def perturb(rgb):
    """Rotate, flip and 8% darker (research repo evaluate_final.py)."""
    return np.clip(np.rot90(rgb[:, ::-1]).astype(np.float32) * 0.92, 0, 255).astype(np.uint8)


# ---------- per slice ----------


@dataclass
class Slice:
    name: str
    heart: str
    weight: float
    norm: np.ndarray
    tissue_a: np.ndarray
    uncertain: np.ndarray
    features: np.ndarray = field(repr=False)
    p_app: np.ndarray = field(repr=False)  # frozen forest, per tissue pixel
    rgb: np.ndarray = field(repr=False)
    paper: np.ndarray = field(repr=False)
    holes_removed: np.ndarray = field(repr=False)
    stain: np.ndarray = field(repr=False)  # Method B's s and theta per pixel (NaN outside the tissue)
    tint: np.ndarray = field(repr=False)
    ref_tissue: np.ndarray = field(repr=False)
    ref_dead: np.ndarray = field(repr=False)
    p_held_out: np.ndarray | None = field(default=None, repr=False)


def run_slice(rgb, hole_model, forest, stain):
    fe = run_front_end(rgb, hole_model)
    features = pixel_features(fe.norm, fe.tissue)
    s, t = stain_maps(rgb, fe.paper, fe.tissue, fe.holes.removed, stain.sigma, stain.edge_px)
    return fe, features, forest.dead_probability(features), s, t


def load_study(scans, hole_model, forest, stain):
    out = []
    for name, path in scans.items():
        rgb = read_rgb(path)
        fe, features, p_app, b_s, b_t = run_slice(rgb, hole_model, forest, stain)
        ref_tissue, ref_dead = ref1(rgb, name)
        heart, weight = parse_name(name)
        out.append(
            Slice(name, heart, weight, fe.norm, fe.tissue, fe.holes.uncertain, features, p_app, rgb, fe.paper,
                  fe.holes.removed, b_s, b_t, ref_tissue, ref_dead)
        )  # fmt: skip
    return out


def held_out_forests(slices):
    """{heart: forest trained on the other hearts}, and each slice's held-out probabilities."""
    forests = {}
    feats = [s.features for s in slices]
    for h in sorted({s.heart for s in slices}):
        _, rf = fit_k_means_rf(feats, [i for i, s in enumerate(slices) if s.heart != h])
        rf.n_jobs = 1
        forests[h] = rf
    for s in slices:
        s.p_held_out = forests[s.heart].predict_proba(s.features)[:, 1].astype(np.float32)
    return forests


def b_model(s, stain):
    """Method B with the cuts recalibrated without this slice's heart."""
    return StainRatioModel.from_info({**stain.info, "cuts": stain.info["calibration"]["leave_one_heart_out"][s.heart]})


def b_held_out(s, stain):
    return summarise_b(s.stain, s.tint, s.tissue_a, s.uncertain, b_model(s, stain))


def b_score(s, stain):
    """Higher = more likely dead: less stain, and red-leaning pixels below every cream-leaning one."""
    m = b_model(s, stain)
    with np.errstate(invalid="ignore"):
        return np.where(s.tissue_a, -np.nan_to_num(s.stain) - 10.0 * (s.tint >= m.tint_cut), -1e9)


# ---------- metrics ----------


def heart_pct(df, col):
    """Slice % weighted by slice weight, per heart."""
    return pd.Series({h: np.average(g[col], weights=g["weight"]) for h, g in df.groupby("heart")})


def mae(a, b):
    m = a.notna() & b.notna()
    return float((a[m] - b[m]).abs().mean())


def pixel_scores(slices, dead_of, score_of):
    """Dice and ROC AUC vs Ref-1, pooled over the slices, on Ref-1's tissue."""
    y = np.concatenate([s.ref_dead[s.ref_tissue] for s in slices])
    yh = np.concatenate([dead_of(s)[s.ref_tissue] for s in slices])
    sc = np.concatenate([score_of(s)[s.ref_tissue] for s in slices])
    tp, fp, fn = int((yh & y).sum()), int((yh & ~y).sum()), int((~yh & y).sum())
    return {"dice_vs_ref1": 2 * tp / max(2 * tp + fp + fn, 1), "roc_auc_vs_ref1": float(roc_auc_score(y, sc))}


def ring(slices, dead_of, tissue_of):
    """Dead share within 3 px of the edge minus the share 4-10 px in (notebook Step 62), in points."""
    near = far = n_near = n_far = 0
    for s in slices:
        t = tissue_of(s)
        d = ndi.distance_transform_edt(t)
        dead = dead_of(s)
        a, b = t & (d > 0) & (d <= 3), t & (d > 3) & (d <= 10)
        near, n_near = near + int((dead & a).sum()), n_near + int(a.sum())
        far, n_far = far + int((dead & b).sum()), n_far + int(b.sum())
    return 100 * near / max(n_near, 1) - 100 * far / max(n_far, 1)


def area_weight_r(df, col):
    rs = [np.corrcoef(g[col], g["weight"])[0, 1] for _, g in df.groupby("heart") if len(g) >= 3]
    return float(np.mean(rs))


def full(s, p_tissue, tissue):
    img = np.zeros(tissue.shape, np.float32)
    img[tissue] = p_tissue
    return img


# ---------- the checks ----------


def per_slice_table(slices, stain, ref0, yhs):
    rows = []
    for s in slices:
        a_app = summarise_a(s.p_app, s.tissue_a, s.uncertain)
        a_ho = summarise_a(s.p_held_out, s.tissue_a, s.uncertain)
        b_app = summarise_b(s.stain, s.tint, s.tissue_a, s.uncertain, stain)
        b_ho = b_held_out(s, stain)
        rows.append(
            {
                "file": s.name,
                "heart": s.heart,
                "weight": s.weight,
                "ref0": ref0.get(s.name),
                "ref1": 100 * s.ref_dead.sum() / s.ref_tissue.sum(),
                "yhs": yhs.get(s.name, np.nan),
                "a_app": a_app.dead_pct,
                "a": a_ho.dead_pct,
                "a_low": a_ho.low_pct,
                "a_high": a_ho.high_pct,
                "a_unsure": a_ho.unsure_pct,
                "b_app": b_app.dead_pct,
                "b": b_ho.dead_pct,
                "b_low": b_ho.low_pct,
                "b_high": b_ho.high_pct,
                "b_borderline": b_ho.borderline_pct,
                "area": int(s.tissue_a.sum()),
            }
        )
    return pd.DataFrame(rows)


def agreement(df):
    hearts = pd.DataFrame(
        {c: heart_pct(df, c) for c in ("ref0", "ref1", "a", "b", "a_low", "a_high", "b_low", "b_high")}
    )
    hearts["yhs"] = heart_pct(df.dropna(subset=["yhs"]), "yhs")
    out = {}
    for m in ("a", "b"):
        out[m] = {
            "slice_mae_vs_ref0": mae(df[m], df.ref0),
            "slice_mae_vs_ref1": mae(df[m], df.ref1),
            "slice_mae_vs_yhs": mae(df[m], df.yhs),
            "heart_mae_vs_ref0": mae(hearts[m], hearts.ref0),
            "heart_mae_vs_ref1": mae(hearts[m], hearts.ref1),
            "heart_mae_vs_yhs": mae(hearts[m], hearts.yhs),
            "time_control_hearts_pct": {h: round(float(hearts.loc[h, m]), 1) for h in TIME_CONTROL},
        }
    return hearts, out


def shadow_test(slices, forests, stain):
    """Share of pixels under a soft shadow that change verdict (notebook Step 51), mean over slices."""
    rows = []
    for i, s in enumerate(slices):
        before_a = s.p_held_out >= 0.5
        mb = b_model(s, stain)
        before_b = b_held_out(s, stain).dead[s.tissue_a]
        for lv in SHADOW_LEVELS:
            img, w = shade_image(s.norm, s.tissue_a, lv, SEED + i)
            zone = w[s.tissue_a] >= 0.5
            after = forests[s.heart].predict_proba(pixel_features(img, s.tissue_a))[:, 1] >= 0.5
            rows.append(_flips("a", lv, before_a[zone], after[zone]))
            img_b, w_b = shade_image(s.rgb, s.tissue_a, lv, SEED + i)
            zone_b = w_b[s.tissue_a] >= 0.5
            sb, tb = stain_maps(img_b, s.paper, s.tissue_a, s.holes_removed, mb.sigma, mb.edge_px)
            after_b = summarise_b(sb, tb, s.tissue_a, s.uncertain, mb).dead[s.tissue_a]
            rows.append(_flips("b", lv, before_b[zone_b], after_b[zone_b]))
    return pd.DataFrame(rows).groupby(["method", "light"]).mean().round(2)


def _flips(method, light, b0, b1):
    return {
        "method": method,
        "light": light,
        "alive_to_dead_pct": 100 * (b1 & ~b0).sum() / max((~b0).sum(), 1),
        "dead_to_alive_pct": 100 * (~b1 & b0).sum() / max(b0.sum(), 1),
    }


def robustness(scans, slices, hole_model, forest, stain):
    """|change in slice %| after rotate + flip + 8% darker, for the app's pipeline (frozen forest, shipped cuts)."""
    rows = []
    for s in slices:
        rgb = perturb(read_rgb(scans[s.name]))
        fe, _, p_app, b_s, b_t = run_slice(rgb, hole_model, forest, stain)
        a = summarise_a(p_app, fe.tissue, fe.holes.uncertain).dead_pct
        b = summarise_b(b_s, b_t, fe.tissue, fe.holes.uncertain, stain)
        a0 = summarise_a(s.p_app, s.tissue_a, s.uncertain).dead_pct
        b0 = summarise_b(s.stain, s.tint, s.tissue_a, s.uncertain, stain)
        rows.append({"file": s.name, "a_shift": abs(a - a0), "b_shift": abs(b.dead_pct - b0.dead_pct)})
    return pd.DataFrame(rows)


def a_time_control_fixes(slices, df, hearts, base_dice, yhs):
    """PLAN §8, Method A limit 1: the rim fix and a probability cut calibrated on the time-control hearts
    (chosen on two, tested on the third). Pass: heart MAE vs YHS <= 5 pp, Dice vs Ref-1 drops by < 0.01."""
    grid = np.round(np.arange(0.50, 0.951, 0.05), 2)
    tc = [h for h in ("109", "119", "129")]
    p_rim = {s.name: rim_fix(s.p_held_out, s.tissue_a) for s in slices}
    out = {}
    for variant, pmap in (("cut", {s.name: s.p_held_out for s in slices}), ("rim fix + cut", p_rim)):

        def slice_pct(name, cut, pmap=pmap):
            return 100 * float((pmap[name] >= cut).mean())

        def tc_mae(hs, cut, pmap=pmap):
            names = [s.name for s in slices if s.heart in hs and s.name in yhs]
            return float(np.mean([abs(slice_pct(n, cut) - yhs[n]) for n in names]))

        held, chosen = {}, {}
        for h in tc:
            c = float(grid[int(np.argmin([tc_mae([x for x in tc if x != h], c) for c in grid]))])
            chosen[h] = c
            sl = [s for s in slices if s.heart == h]
            held[h] = np.average([slice_pct(s.name, c) for s in sl], weights=[s.weight for s in sl])
        heart_mae = float(np.mean([abs(held[h] - hearts.loc[h, "yhs"]) for h in tc]))
        c_all = float(grid[int(np.argmin([tc_mae(tc, c) for c in grid]))])
        dice = pixel_scores(slices, lambda s, c=c_all, pmap=pmap: full(s, pmap[s.name] >= c, s.tissue_a) > 0,
                            lambda s, pmap=pmap: full(s, pmap[s.name], s.tissue_a))["dice_vs_ref1"]  # fmt: skip
        out[variant] = {
            "cuts_chosen_holding_out": chosen,
            "cut_on_all_three": c_all,
            "heart_mae_vs_yhs": round(heart_mae, 2),
            "dice_vs_ref1": round(dice, 4),
            "dice_drop": round(base_dice - dice, 4),
            "passes": bool(heart_mae <= 5 and base_dice - dice < 0.01),
        }
    rim_dice = pixel_scores(slices, lambda s: full(s, p_rim[s.name] >= 0.5, s.tissue_a) > 0,
                            lambda s: full(s, p_rim[s.name], s.tissue_a))["dice_vs_ref1"]  # fmt: skip
    rim_hearts = pd.Series(
        {h: np.average([100 * float((p_rim[s.name] >= 0.5).mean()) for s in slices if s.heart == h],
                       weights=[s.weight for s in slices if s.heart == h]) for h in tc}
    )  # fmt: skip
    out["rim fix"] = {
        "heart_mae_vs_yhs": round(float((rim_hearts - hearts.loc[tc, "yhs"]).abs().mean()), 2),
        "dice_vs_ref1": round(rim_dice, 4),
        "dice_drop": round(base_dice - rim_dice, 4),
        "ring_points": round(
            ring(slices, lambda s: full(s, p_rim[s.name] >= 0.5, s.tissue_a) > 0, lambda s: s.tissue_a), 1
        ),
    }
    return out


def ranges(df, hearts):
    """PLAN §2g / §8: the range contains Ref-YHS on the time-control hearts and is <= 10 pp wide on >= 80% of slices."""
    out = {}
    for m in ("a", "b"):
        width = df[f"{m}_high"] - df[f"{m}_low"]
        tc = hearts.loc[["109", "119", "129"]]
        contains = {h: bool(tc.loc[h, f"{m}_low"] <= tc.loc[h, "yhs"] <= tc.loc[h, f"{m}_high"]) for h in tc.index}
        slices_tc = df.dropna(subset=["yhs"])
        out[m] = {
            "contains_yhs_hearts": contains,
            "contains_yhs_slices": f"{int(((slices_tc[f'{m}_low'] <= slices_tc.yhs) & (slices_tc.yhs <= slices_tc[f'{m}_high'])).sum())} of {len(slices_tc)}",
            "share_of_slices_at_most_10pp_wide": round(float((width <= 10).mean()), 3),
            "median_width_pp": round(float(width.median()), 1),
            "passes": bool(all(contains.values()) and (width <= 10).mean() >= 0.8),
        }
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    scans = study_scans()
    assert len(scans) == 30
    yhs, ref0 = read_out("*InfSizeYHS.out"), read_out("*InfSize.out")
    hole_model, forest, stain = HoleModel.load(), ForestModel.load(), StainRatioModel.load()
    slices = load_study(scans, hole_model, forest, stain)
    print("Ref-1 reproduces the notebook's masks on all 30 slices.")
    forests = held_out_forests(slices)
    df = per_slice_table(slices, stain, ref0, yhs)
    hearts, agree = agreement(df)
    pix = {
        "a": pixel_scores(slices, lambda s: full(s, s.p_held_out >= 0.5, s.tissue_a) > 0,
                          lambda s: full(s, s.p_held_out, s.tissue_a)),
        "b": pixel_scores(slices, lambda s: b_held_out(s, stain).dead, lambda s: b_score(s, stain)),
    }  # fmt: skip
    rings = {
        "ref1": ring(slices, lambda s: s.ref_dead, lambda s: s.ref_tissue),
        "a": ring(slices, lambda s: full(s, s.p_held_out >= 0.5, s.tissue_a) > 0, lambda s: s.tissue_a),
        "b": ring(slices, lambda s: b_held_out(s, stain).dead, lambda s: s.tissue_a),
    }
    shadows = shadow_test(slices, forests, stain)
    robust = robustness(scans, slices, hole_model, forest, stain)
    fixes = a_time_control_fixes(slices, df, hearts, pix["a"]["dice_vs_ref1"], yhs)
    rng = ranges(df, hearts)
    diff_slices = (df.a - df.b).abs()
    diff_hearts = (hearts.a - hearts.b).abs()
    summary = {
        "agreement": agree,
        "pixels_vs_ref1": pix,
        "ring_points": {k: round(v, 1) for k, v in rings.items()},
        "shadow": {f"{m} at {int(100 * lv)}% light": row.to_dict() for (m, lv), row in shadows.iterrows()},
        "rotate_flip_darker_mean_shift_pp": {
            "a": round(robust.a_shift.mean(), 2),
            "b": round(robust.b_shift.mean(), 2),
        },
        "rotate_flip_darker_max_shift_pp": {"a": round(robust.a_shift.max(), 2), "b": round(robust.b_shift.max(), 2)},
        "area_vs_weight_mean_within_heart_r": round(area_weight_r(df, "area"), 3),
        "method_a_time_control_fixes": fixes,
        "ranges": rng,
        "a_minus_b": {
            "slice_abs_diff_pp": {q: round(float(diff_slices.quantile(q)), 1) for q in (0.5, 0.8, 0.9, 1.0)},
            "heart_abs_diff_pp": {h: round(float(v), 1) for h, v in diff_hearts.items()},
        },
        "app_vs_held_out_a_mean_abs_diff_pp": round(float((df.a_app - df.a).abs().mean()), 2),
    }
    df.to_csv(OUT / "scorecard_per_slice.csv", index=False)
    hearts.round(2).to_csv(OUT / "scorecard_per_heart.csv")
    (OUT / "scorecard.json").write_text(json.dumps(summary, indent=2, default=float) + "\n")
    print(json.dumps(summary, indent=2, default=float))


if __name__ == "__main__":
    main()
