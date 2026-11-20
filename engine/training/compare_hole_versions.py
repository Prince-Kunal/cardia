"""Phase 0: which version of our hole scorer becomes the shared hole file (PLAN.md §8)?

Both versions run on the shared front end and are scored against the same hand-marked holes with
the same rules, each heart held out in turn. Pass rule (fixed before running): the version that
finds more holes wins, provided it calls at most 3 creases holes and no slice loses more than 1%
of its tissue wrongly; a tie goes to fewer false holes.

Result on 2026-11-20: no version passed. The team chose the research repo's version (same holes
found, half the false holes); its one breach, 1.47% of slice 109IS151 lost to a crease, is a stated
limit (PLAN.md §2d).

    cd engine && uv run python -m training.compare_hole_versions
"""

import pandas as pd

from ttc_pipeline.holes import FEATURES

from .holes import build_candidates, held_out_summary, load_labels, loho_scores
from .notebook_holes import FEATURES_3, FEATURES_4, notebook_candidates
from .study import study_slices


def compare(slices, labels):
    nb = build_candidates(slices, labels, candidates_fn=notebook_candidates)
    repo = build_candidates(slices, labels)
    versions = {
        "notebook, 4 measures (with flatness)": (nb, FEATURES_4),
        "notebook, 3 measures": (nb, FEATURES_3),
        "repo, 3 measures (shipped)": (repo, FEATURES),
    }
    return pd.DataFrame(
        {name: held_out_summary(cs, loho_scores(cs.table, f), slices, labels) for name, (cs, f) in versions.items()}
    ).T


def main():
    labels, labels_sha = load_labels()
    slices = study_slices()
    assert len(slices) == 30, f"expected the 30 study slices in data/, found {len(slices)}"
    table = compare(slices, labels)
    passing = table[table.passes_phase0_rule.astype(bool)]
    winner = (
        passing.sort_values(["holes_found", "false_holes"], ascending=[False, True]).index[0] if len(passing) else None
    )
    pd.set_option("display.width", 220)
    print(f"Labels sha256 {labels_sha[:12]}…\n")
    print(table.T.to_string())
    print(f"\nWinner by the Phase 0 rule: {winner or 'none passes'}")


if __name__ == "__main__":
    main()
