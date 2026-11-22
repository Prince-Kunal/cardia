"""Method A's training recipe (reference notebook Steps 33-34 and `fit_model`, Step 67), ported step for step.

1. K-Means (k = 3) on (L*, a*, b* at sigma 1) pooled from the training slices, 3,000 pixels per slice.
   The palest centre (L* - 1.5 a*) is dead, the reddest alive, the middle one unlabelled. A pixel is
   labelled only if it is clearly closer to one centre (distance ratio < 0.8).
2. Up to 2,000 labelled pixels per class per slice train a random forest (150 trees).

Reproducibility:
* `fit_k_means_rf` uses a fresh generator (seed 42), as the notebook's `fit_model` does. The notebook's
  held-out run instead shared one generator across five labellers, in an order that changed between
  Python processes, so its held-out numbers cannot be reproduced exactly.
* K-Means adds float32 numbers in an order that depends on the CPU and the number of threads, so
  retraining on another machine moves its centres by about 1e-5 and the forest changes slightly. Here
  K-Means runs on one thread, so a retrain depends only on the code and the data. The shipped forest is
  the notebook's own frozen file, not a retrain (PLAN.md D5).
"""

import numpy as np
from sklearn.cluster import KMeans
from sklearn.ensemble import RandomForestClassifier
from threadpoolctl import threadpool_limits

from ttc_pipeline.method_a import COLOUR_COLS

LIVE, DEAD, IGN = 0, 1, -1
SEED = 42
CLUSTER_PX_PER_SLICE = 3000
KMEANS_K, KMEANS_MARGIN = 3, 0.8
RF_PX_PER_CLASS_PER_SLICE = 2000
RF_SETTINGS = {
    "n_estimators": 150,
    "min_samples_leaf": 10,
    "max_features": "sqrt",
    "class_weight": "balanced_subsample",
    "n_jobs": -1,
    "random_state": 42,
}


def paleness(m):
    return m[0] - 1.5 * m[1]


def pooled_colours(features, idx, seed=SEED):
    """3,000 random pixels' (L*, a*, b* at sigma 1) from each slice in idx. `features`: per-slice feature arrays."""
    rng = np.random.default_rng(seed)
    return np.vstack(
        [
            features[i][rng.choice(len(features[i]), min(CLUSTER_PX_PER_SLICE, len(features[i])), replace=False)][
                :, COLOUR_COLS
            ]
            for i in idx
        ]
    )


class KMeansLabeller:
    """Notebook Step 34: red group -> alive, cream group -> dead, pink group and unclear pixels -> unlabelled."""

    def fit(self, X):
        with threadpool_limits(1):  # one fixed summation order (see the module notes)
            self.km = KMeans(KMEANS_K, n_init=10, random_state=SEED).fit(X)
        c = self.km.cluster_centers_
        self.live = int(np.argmin([paleness(m) for m in c]))
        self.dead = int(np.argmax([paleness(m) for m in c]))
        return self

    def label(self, X):
        d = self.km.transform(X)
        o = np.sort(d, 1)
        near = d.argmin(1)
        conf = o[:, 0] / np.maximum(o[:, 1], 1e-6) < KMEANS_MARGIN
        y = np.full(len(X), IGN, np.int8)
        y[(near == self.live) & conf] = LIVE
        y[(near == self.dead) & conf] = DEAD
        return y


def fit_k_means_rf(features, idx):
    """Train Method A on slices idx. `features`: per-slice (n_pixels x 22) arrays, in study order.
    Returns (labeller, forest), as the notebook's fit_model("K-Means + RF", idx)."""
    labeller = KMeansLabeller().fit(pooled_colours(features, idx))
    rng = np.random.default_rng(SEED)
    Xs, ys = [], []
    for i in idx:
        y = labeller.label(features[i][:, COLOUR_COLS])
        for c in (LIVE, DEAD):
            j = np.flatnonzero(y == c)
            if len(j):
                j = rng.choice(j, min(len(j), RF_PX_PER_CLASS_PER_SLICE), replace=False)
                Xs.append(features[i][j])
                ys.append(np.full(len(j), c))
    rf = RandomForestClassifier(**RF_SETTINGS).fit(np.vstack(Xs), np.concatenate(ys))
    return labeller, rf


def loho_probabilities(features, hearts):
    """Each slice's dead probabilities from a model trained on the other hearts. `hearts`: heart per slice."""
    out = {}
    for h in sorted(set(hearts)):
        train = [i for i, x in enumerate(hearts) if x != h]
        _, rf = fit_k_means_rf(features, train)
        rf.n_jobs = 1
        col = list(rf.classes_).index(DEAD)
        for i, x in enumerate(hearts):
            if x == h:
                out[i] = rf.predict_proba(features[i])[:, col].astype(np.float32)
    return out
