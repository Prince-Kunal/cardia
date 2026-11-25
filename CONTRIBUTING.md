# Working on Cardia

How the three of us split the work, push code, and keep every machine giving the same results.

## Who we are

| Person | GitHub | Commit email | Owns |
|---|---|---|---|
| Prince | `Prince-Kunal` | kunalprince615@gmail.com | Repo maintainer. Engine shared steps, hole model, Method B, local API, cloud sync, desktop phase |
| Melove | `MeloveGupta` | melovegupta0406@gmail.com | Method A, golden set and parity tests, export (PDF/CSV/ZIP, Methods paragraph), Learn engine and quizzes, lead on lesson content |
| Krrish | `krrishverma1805-web` | krrishverma1805@gmail.com | Web app: shell, Analyze screens (import, library, reports), 3D heart, languages, polish |

The split follows what each of us already built. Prince wrote `ttc/` and the hole scorer, and Melove wrote the notebook, which is the source of Method A. Krrish starts on the web app, which needs nothing from Phase 0. Owners review PRs in their area (`.github/CODEOWNERS`). Anyone may work anywhere, but the owner approves.

### Milestones by owner (see PLAN.md §11)

| # | Milestone | Owner | Can start |
|---|---|---|---|
| 0 | Phase 0: lock both methods, one scorecard, golden set | Prince (shared steps, holes, B) + Melove (A, golden set) | now |
| 1 | Engine API: local FastAPI server, OpenAPI contract | Prince | contract in week 1, so the web app can use mock data |
| 2 | Web shell: library, import, processing, settings | Krrish | now, on mock data |
| 3 | Reports and export | Krrish (screens) + Melove (export, Methods paragraph) | after 1 |
| 4 | Cloud sync | Prince | after 2 |
| 5 | Learn engine: lesson player, quizzes, progress | Melove | now |
| 6 | 3D heart | Krrish | now |
| 7 | Learn content v1 | Melove leads, all write, GVSU reviews | now |
| 8 | Languages wave 1 | Krrish | after 2 |
| 9 | Polish, About & Help | Krrish + Prince | late |
| 10 | Pilot | all | last |
| 11 | Desktop (Electron, Windows + macOS) | Prince | when we have a Windows machine |

## First-time setup on a machine

```bash
git clone https://github.com/Prince-Kunal/cardia.git && cd cardia
scripts/setup.sh <your-github-username>   # sets your commit identity for this repo, hooks, engine env; checks tools and data
```

Then:

1. **Tools.** `setup.sh` reports anything missing. You need uv (any recent version; it installs Python 3.14.4 itself), Node 22.21.0 (`.nvmrc`, via nvm or fnm) and pnpm 10.20.0 (`corepack enable`).
2. **Study data.** The GVSU study set (30 scans and 11 `.out` files from 8 hearts) is in `data/`, in git. `python3 scripts/check_data.py` must report `41/41 study files present and identical`. Never edit these files; if one changes, restore it with `git checkout -- data/`.
3. **Reference material and models.** The notebook's saved results (`reference/results_local/`), the golden set (`reference/golden/`), the hand-marked hole outlines (`engine/annotations/`) and the model files (`engine/models/`) are in git. Two things are not: the notebook itself (22 MB, team Drive) and the research repo (`git clone https://github.com/Prince-Kunal/infarct-algorithms reference/research-repo`), which held the retired a\* cut. `uv run python -m training.calibrate_method_c` rebuilds Method C's cut file from the study scans, and `uv run python -m training.export_method_b` retrains and freezes Method B's forest (about 25 minutes). With the data and outlines in place, `cd engine && uv run python -m training.train_hole_model` rebuilds the hole model byte for byte, and `uv run python -m training.export_method_a` rebuilds Method A's forest file from the notebook's `final_model_K_Means_RF.joblib` in `reference/`.
4. **VS Code.** Select `engine/.venv/bin/python` as the interpreter (Python: Select Interpreter).

Re-run `scripts/setup.sh` whenever something seems off. It must print only `ok` lines.

## Daily workflow

1. `git switch main && git pull`
2. Branch: `<area>/<short-name>`, e.g. `engine/hole-model`, `web/library-screen`, `learn/quiz-types`. Keep branches short-lived (days, not weeks).
3. Commit small and often. **Each commit belongs to the owner of its files** (`.github/CODEOWNERS`, last match wins), whoever wrote it: if a change touches several people's areas, split it into one commit per owner and set each commit's author to that owner (below). You are always the committer. The pre-commit hook checks that both are team identities.
4. Push and open a PR to `main`. Fill in the template. The area owner reviews. One approval is needed, and you can't approve your own PR.
5. **Rebase and merge.** Every commit lands on `main` as it is, with its own author, so each person's work shows as theirs. Don't squash: a squash commit is authored by whoever opened the PR, and everyone else is reduced to a co-author line.
6. Delete the branch.

Never push directly to `main`. The only exception was the initial commit set on 2026-11-20. Commits merged before this rule (PRs #2 to #8) were squashed and stay as they are.

**Committing in a teammate's area.** We cover for each other: whoever does the work, a commit goes to the person who owns that part of the code. Commit it with your own identity as committer and the owner as author:

```bash
git commit --author="MeloveGupta <melovegupta0406@gmail.com>" -m "docs(content): lesson format"
```

GitHub then shows "MeloveGupta authored and Prince-Kunal committed". The history records both people, and the hook rejects any author outside the team. For work two people did together, the person typing commits it with a `Co-authored-by: <username> <team email>` trailer for the other.

### Commit messages

`type(scope): what changed`, in the imperative, under about 70 characters.

* types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`
* scopes: `engine`, `api`, `web`, `learn`, `heart3d`, `content`, `i18n`, `ci`, `docs`

Example: `feat(engine): port lighting correction from notebook Part D`

## Keeping every machine consistent

| What | Pinned by | Rule |
|---|---|---|
| Python 3.14.4 + numpy 2.5.5, OpenCV 5.1.0, scikit-learn 1.9.1 … | `engine/.python-version`, `engine/uv.lock` | Install with `uv sync --locked`. Change versions only in a PR that says why |
| Node 22.21.0, pnpm 10.20.0 | `.nvmrc`, `packageManager` in `web/package.json` | Install with `pnpm install --frozen-lockfile` |
| Line endings, indentation | `.gitattributes`, `.editorconfig` | LF everywhere |
| Study data | `scripts/study-data.sha256` | `check_data.py` must pass before running engine tests |
| Model files | `engine/models/manifest.json` (SHA-256 per file, Phase 0) | The engine refuses a file whose hash doesn't match |
| Formatting and lint | `ruff` (engine); `prettier` + `eslint` (web, added with the scaffold) | CI runs them on every PR (engine: `.github/workflows/engine.yml`, macOS + Linux) |
| Git hooks | `.githooks/` via `core.hooksPath` | Set by `setup.sh` |

## Rules

* **Lab data in git (decided 2026-11-23).** The study set, models, hole outlines, notebook results and golden set are committed; the data is not secret. Add new lab data only in a PR that says what it is and where it comes from. No pickled caches (`*.pkl`), which the pre-commit hook blocks.
* **No AI attribution in history.** No `Co-Authored-By: Claude` and no "Generated with Claude Code" lines in commits or PRs. `.claude/settings.json` turns this off for Claude Code, and `.githooks/commit-msg` strips such lines from every commit.
* **Engine output is sacred.** Porting code must not change any number (PLAN.md §7). An intended change bumps the pipeline version and regenerates the golden set, and the PR says why.

## Models and large files

The frozen models are in git, each with its SHA-256 in `engine/models/manifest.json`; the engine refuses a file whose hash doesn't match. The pre-commit hook rejects files over 5 MB, so the notebook (22 MB) and its caches stay on the team Drive.
