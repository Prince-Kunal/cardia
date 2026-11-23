# Cardia: notes for Claude Code sessions

Three people work on this repo from different machines. Read [PLAN.md](PLAN.md) for the product and [CONTRIBUTING.md](CONTRIBUTING.md) for ownership and workflow.

## Rules

- **No AI attribution, ever.** Never add `Co-Authored-By: Claude`, "Generated with Claude Code", or a Claude session link to a commit message, PR title, PR body or comment. `.claude/settings.json` turns attribution off, and `.githooks/commit-msg` strips it as a backstop.
- **The committer is always the person at the keyboard** (repo-local `git config user.name/user.email`; never change it). To commit a teammate's part for them, keep that identity and pass `--author="<their GitHub username> <their team email>"`. Git then records both people. The pre-commit hook checks that author and committer are both team identities.
- **Every commit is authored by the owner of its files** (`.github/CODEOWNERS`, last match wins; with several owners, the first), whoever wrote it. Split a change that spans areas into one commit per owner.
- **Merge PRs with "Rebase and merge", never squash.** A squash commit is authored by whoever opened the PR, which hides the owners.
- **Lab data is committed (decided 2026-11-23: not secret).** `data/`, the model files, `engine/annotations/`, `reference/results_local/` (minus caches) and `reference/golden/` are in git. Never edit them by hand. No `*.pkl` caches, and nothing over 5 MB (the notebook stays on the team Drive).
- **Engine behaviour is pinned to the reference notebook** (PLAN.md §7). Porting must not change any output. An intended change bumps the pipeline version and regenerates the golden set.
- Commit or push only when asked. Work on a branch and open a PR to `main`.

## Commands

- Setup check: `scripts/setup.sh`
- Engine: `cd engine && uv sync --locked`, then `uv run pytest` and `uv run ruff check .`
- Engine API: `cd engine && uv run python -m cardia_api [--mock]`; after changing the API, `uv run python -m cardia_api.openapi` rewrites the contract
- Data check: `python3 scripts/check_data.py`
