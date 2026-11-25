"""Method B's training recipe: "Tuned DBSCAN + RF" (GVSU_Infarct_Pipeline_dbscan_search.ipynb, Steps 36-37 and
`fit_model`, Step 48), ported step for step.

1. Settings are picked on the training hearts (`tune_dbscan`, notebook Step 37), in two stages:
   a. every colour scale (s1, s2, s4) x min points x eps (a percentile of the k-th neighbour distances) x groups
      (extremes, split, thirds) x matching (nearest dense member, group centre) is fitted on pooled pixel colours
      and scored by how well DBSCAN's own split matches Ref-1 (average Dice per heart); the 4 best per matching
      are kept;
   b. for each of those and each example rule, a small forest (40 trees, 600 examples per class per slice) is
      trained on DBSCAN's labels and every cut-off is scored the same way. The best combination wins.
2. DBSCAN with the winning settings labels pixels: palest dense group (L* - 1.5 a*) = dead, reddest = alive.
3. Up to 2,000 labelled pixels per class per slice train a random forest (150 trees), as Method A's.

Ref-1 (the professor's live cut-off inside the notebook's tissue) only chooses DBSCAN's settings. The forest
learns from DBSCAN's labels, never from Ref-1 directly.
"""

import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN
from sklearn.ensemble import RandomForestClassifier
from sklearn.neighbors import NearestNeighbors

from ttc_pipeline.method_a import FEATURE_NAMES

from .method_a import CLUSTER_PX_PER_SLICE, RF_PX_PER_CLASS_PER_SLICE, RF_SETTINGS, paleness

LIVE, DEAD, IGN = 0, 1, -1
SEED = 42
DBSCAN_N_FIT = 15000  # pooled colours DBSCAN is fitted on
DBSCAN_BIG = 0.02  # a group counts if it holds at least 2% of them
DBSCAN_MIN_SEP_A = 10.0  # the reddest group must be at least this much redder (a*) than the palest
GRID = {
    "space": ["s1", "s2", "s4"],
    "eps_pct": [1, 2, 3, 5, 7, 10, 15, 20, 35],
    "min_samples": [5, 10, 25, 40],
    "mode": ["extremes", "split", "thirds"],
    "top": 4,
    "rules": {
        "core": [("reach", 1.5), ("reach", 3.0), ("margin", 0.65), ("margin", 0.8), ("margin", 0.9)],
        "centre": [("margin", 0.6), ("margin", 0.7), ("margin", 0.8), ("margin", 0.9)],
    },
    "cut": [0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5],
}
SPACE_COLS = {k: [FEATURE_NAMES.index(f"{c}_{k}") for c in ("L", "a", "b")] for k in GRID["space"]}
EVAL_PX = 3000  # pixels per training slice the settings are scored on
QUICK_RF_PX, QUICK_RF_TREES = 600, 40


def pooled_colours(features, idx, cols, seed=SEED):
    """3,000 random pixels' colours (the given columns) from each slice in idx."""
    rng = np.random.default_rng(seed)
    return np.vstack(
        [
            features[i][rng.choice(len(features[i]), min(CLUSTER_PX_PER_SLICE, len(features[i])), replace=False)][
                :, cols
            ]
            for i in idx
        ]
    )


def fit_sample(X):
    """The 15,000 pooled colours DBSCAN is fitted on."""
    return X[np.random.default_rng(SEED).choice(len(X), min(DBSCAN_N_FIT, len(X)), replace=False)]


class DBSCANTuned:
    """DBSCAN with tunable settings (notebook Step 37): colour scale, eps (a percentile of neighbour distances),
    min points, which groups make examples, how pixels are matched to groups, the example rule and the cut-off."""

    def __init__(self, space="s1", q=10, ms=15, mode="extremes", base="core", rule="reach", val=1.0, cut=0.5):
        self.space, self.q, self.ms, self.mode, self.base, self.rule, self.val, self.cut = (
            space, q, ms, mode, base, rule, val, cut,
        )  # fmt: skip
        self.cols = SPACE_COLS[space]
        self.ok, self.eps = False, np.nan

    def fit(self, X):
        Xs = fit_sample(X)
        kd = np.sort(NearestNeighbors(n_neighbors=self.ms).fit(Xs).kneighbors(Xs)[0][:, -1])
        self.eps = float(np.percentile(kd, self.q))
        return self.assign(Xs, DBSCAN(eps=self.eps, min_samples=self.ms).fit(Xs))

    def assign(self, Xs, db):
        lab = db.labels_
        ids, cnt = np.unique(lab[lab >= 0], return_counts=True)
        big = ids[cnt >= DBSCAN_BIG * len(Xs)]
        if len(big) < 2:
            return self  # fewer than two big groups: unusable
        means = {int(c): Xs[lab == c].mean(0) for c in big}
        pal = {c: paleness(m) for c, m in means.items()}
        dead, live = max(pal, key=pal.get), min(pal, key=pal.get)
        if means[live][1] - means[dead][1] < DBSCAN_MIN_SEP_A:
            return self  # palest and reddest not different enough
        lo, hi = pal[live], pal[dead]
        if self.mode == "extremes":
            cls = {c: DEAD if c == dead else LIVE if c == live else IGN for c in pal}
        elif self.mode == "split":
            cls = {c: DEAD if pal[c] > (lo + hi) / 2 else LIVE for c in pal}
        else:
            cls = {
                c: DEAD if pal[c] >= hi - (hi - lo) / 3 else LIVE if pal[c] <= lo + (hi - lo) / 3 else IGN for c in pal
            }
        self.n_groups = len(big)
        self.means, self.groups = means, cls
        if self.base == "centre":
            self.centres = np.array([means[c] for c in pal], np.float32)
            self.ccls = np.array([cls[c] for c in pal], np.int8)
        else:
            core = np.zeros(len(Xs), bool)
            core[db.core_sample_indices_] = True
            self.nn_d = NearestNeighbors(n_neighbors=1).fit(Xs[core & np.isin(lab, [c for c in pal if cls[c] == DEAD])])
            self.nn_l = NearestNeighbors(n_neighbors=1).fit(Xs[core & np.isin(lab, [c for c in pal if cls[c] == LIVE])])
        self.ok = True
        return self

    def _dist(self, X):
        """Distance of each pixel to the nearest dead and the nearest alive group."""
        if self.base == "centre":
            D = np.linalg.norm(X[:, None, :] - self.centres[None], axis=2)
            return D[:, self.ccls == DEAD].min(1), D[:, self.ccls == LIVE].min(1)
        return self.nn_d.kneighbors(X)[0][:, 0], self.nn_l.kneighbors(X)[0][:, 0]

    def label(self, X):
        y = np.full(len(X), IGN, np.int8)
        if self.base == "centre":  # like K-Means: nearest centre, if clearly nearest
            D = np.linalg.norm(X[:, None, :] - self.centres[None], axis=2)
            near = self.ccls[D.argmin(1)]
            d1 = D.min(1)
            d2 = np.full(len(X), np.inf, np.float32)  # nearest centre of a *different* kind
            for c in np.unique(self.ccls):
                d2 = np.where(near != c, np.minimum(d2, D[:, self.ccls == c].min(1)), d2)
            sure = d1 <= self.val * d2
            y[sure] = near[sure]
            return y
        dd, dl = self._dist(X)
        if self.rule == "margin":
            y[dl <= self.val * dd] = LIVE
            y[dd <= self.val * dl] = DEAD
            return y
        lim = self.val * self.eps
        y[(dl <= lim) & (dl < dd)] = LIVE
        y[(dd <= lim) & (dd <= dl)] = DEAD
        return y

    def score(self, X):
        dd, dl = self._dist(X)
        return (dl / np.maximum(dl + dd, 1e-9)).astype(np.float32)

    def rule_text(self):
        return f"margin {self.val}" if self.rule == "margin" else f"reach {self.val} x eps"

    def describe(self):
        return {
            "colour_scale": self.space,
            "eps_percentile": self.q,
            "min_points": self.ms,
            "groups": self.mode,
            "matching": {"core": "nearest dense member", "centre": "group centre"}[self.base],
            "example_rule": self.rule_text(),
            "cut": self.cut,
            "eps": round(self.eps, 4),
        }


def _heart_dice(p, y, groups):
    """Average Dice per heart."""
    return float(np.mean([2 * (p[g] & y[g]).sum() / max(p[g].sum() + y[g].sum(), 1) for g in groups]))


def _quick_rf_probs(L, features, train_idx, evX):
    """A small forest (40 trees, 600 examples per class per slice) on L's examples; its dead probabilities."""
    rng = np.random.default_rng(SEED)
    Xs, ys = [], []
    for i in train_idx:
        y = L.label(features[i][:, L.cols])
        for c in (LIVE, DEAD):
            j = np.flatnonzero(y == c)
            if len(j):
                j = rng.choice(j, min(len(j), QUICK_RF_PX), replace=False)
                Xs.append(features[i][j])
                ys.append(np.full(len(j), c))
    if not ys or len(np.unique(np.concatenate(ys))) < 2:
        return None
    rf = RandomForestClassifier(**{**RF_SETTINGS, "n_estimators": QUICK_RF_TREES}).fit(
        np.vstack(Xs), np.concatenate(ys)
    )
    return rf.predict_proba(evX)[:, list(rf.classes_).index(DEAD)]


def tune_dbscan(features, y_ref, hearts, train_idx, log=print):
    """Notebook Step 37 on slices train_idx. `features`: per-slice (n x 22); `y_ref`: per-slice Ref-1 dead
    (bool, same pixels); `hearts`: heart per slice. Returns {"grid", "stage2", "best"}."""
    rng = np.random.default_rng(SEED + 1)
    evX, evy, evh = [], [], []
    for i in train_idx:
        j = rng.choice(len(features[i]), min(EVAL_PX, len(features[i])), replace=False)
        evX.append(features[i][j])
        evy.append(y_ref[i][j])
        evh.append(np.full(len(j), hearts[i]))
    evX, evy, evh = np.vstack(evX), np.concatenate(evy), np.concatenate(evh)
    groups_h = [evh == h for h in np.unique(evh)]
    q1 = slice(None, None, 3)  # stage 1 uses a third of the pixels
    y1, g1 = evy[q1], [g[q1] for g in groups_h]
    stage1, pool = [], {}
    for sp in GRID["space"]:
        X = pooled_colours(features, train_idx, SPACE_COLS[sp])
        pool[sp] = X
        Xs = fit_sample(X)
        evC = evX[q1][:, SPACE_COLS[sp]]
        for ms in GRID["min_samples"]:
            kd = np.sort(NearestNeighbors(n_neighbors=ms).fit(Xs).kneighbors(Xs)[0][:, -1])
            for q in GRID["eps_pct"]:
                eps = float(np.percentile(kd, q))
                db = DBSCAN(eps=eps, min_samples=ms).fit(Xs)
                for mode in GRID["mode"]:
                    for base in ("core", "centre"):
                        L = DBSCANTuned(sp, q, ms, mode, base)
                        L.eps = eps
                        L.assign(Xs, db)
                        stage1.append(
                            {"space": sp, "ms": ms, "q": q, "mode": mode, "base": base,
                             "dice": _heart_dice(L.score(evC) >= 0.5, y1, g1) if L.ok else np.nan}
                        )  # fmt: skip
        log(f"  stage 1, colour scale {sp} done")
    stage1 = pd.DataFrame(stage1)
    stage2 = []
    for base, g_ in stage1.dropna().groupby("base"):
        for _, b in g_.nlargest(GRID["top"], "dice").iterrows():
            L = DBSCANTuned(b["space"], int(b["q"]), int(b["ms"]), b["mode"], base).fit(pool[b["space"]])
            if not L.ok:
                continue
            for rule, val in GRID["rules"][base]:
                L.rule, L.val = rule, val
                pr = _quick_rf_probs(L, features, train_idx, evX)
                for cut in GRID["cut"]:
                    stage2.append(
                        {"space": L.space, "q": L.q, "ms": L.ms, "mode": L.mode, "base": base, "rule": rule,
                         "val": val, "cut": cut, "dice": np.nan if pr is None else _heart_dice(pr >= cut, evy, groups_h)}
                    )  # fmt: skip
    log("  stage 2 done")
    stage2 = pd.DataFrame(stage2)
    ok = stage2.dropna()
    best = None
    if len(ok):
        b = ok.loc[ok["dice"].idxmax()]
        best = {
            "space": b["space"], "q": int(b["q"]), "ms": int(b["ms"]), "mode": b["mode"], "base": b["base"],
            "rule": b["rule"], "val": float(b["val"]), "cut": float(b["cut"]),
        }  # fmt: skip
    return {"grid": stage1, "stage2": stage2, "best": best}


def fit_dbscan_rf(features, idx, best):
    """Train Method B on slices idx with tuned settings `best` (notebook `fit_model("Tuned DBSCAN + RF", idx)`).
    Returns (labeller, forest)."""
    labeller = DBSCANTuned(**best)
    labeller.fit(pooled_colours(features, idx, labeller.cols))
    if not labeller.ok:
        raise RuntimeError("DBSCAN found no separated alive/dead groups with the tuned settings")
    rng = np.random.default_rng(SEED)
    Xs, ys = [], []
    for i in idx:
        y = labeller.label(features[i][:, labeller.cols])
        for c in (LIVE, DEAD):
            j = np.flatnonzero(y == c)
            if len(j):
                j = rng.choice(j, min(len(j), RF_PX_PER_CLASS_PER_SLICE), replace=False)
                Xs.append(features[i][j])
                ys.append(np.full(len(j), c))
    rf = RandomForestClassifier(**RF_SETTINGS).fit(np.vstack(Xs), np.concatenate(ys))
    return labeller, rf
