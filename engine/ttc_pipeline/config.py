"""Fixed settings, copied from the reference notebook's `CFG` (Step 4).

Only the entries the engine uses are kept. Changing any value changes engine output, so it
needs a pipeline version bump and a regenerated golden set (PLAN.md §7).
"""

CFG = {
    "seed": 42,  # makes every random choice repeatable
    "paper_target_linear": 0.88,  # brightness the paper is set to after lighting correction
    "hole_small_frac": 0.002,  # an enclosed hole smaller than this share of the slice is filled (Step 18)
    "hole_dark_dL": 10.0,  # an enclosed hole no more than this many L* darker than the paper is filled (Step 18)
    "holes": {
        # hole candidates (research repo version, chosen in Phase 0): darker paper or very dark
        "v_max": 145.0,
        "g_r": 0.5,
        "b_g": 0.95,
        "dark_L": 32.0,
        "min_px": 200,
        "edge_margin_px": 6,
        # hole model: regularisation; at or above the cut-off a candidate is a hole, in the band it is uncertain
        "lr_C": 0.3,
        "score_cut": 0.8,
        "uncertain_from": 0.5,
    },
    "dead_threshold": 0.5,  # probability at or above which a pixel is called dead (Method A)
}
