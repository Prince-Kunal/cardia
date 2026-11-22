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
2. **Study data.** Copy the GVSU study set (the 4 infarct hearts from the OneDrive share and the 4 time-control hearts) anywhere inside `data/`. Any folder layout works. `python3 scripts/check_data.py` must report `41/41 study files present and identical`. If a file is missing or changed, ask Prince for the original rather than "fixing" it.
3. **Reference material and models.** For engine work, ask Prince for `reference/` (the notebook and the notebook's saved results), `engine/annotations/` (hand-marked hole outlines) and the model binaries in `engine/models/` (e.g. `holes/hole_model.joblib`). None of these is committed. With the data and outlines in place, `cd engine && uv run python -m training.train_hole_model` rebuilds the hole model byte for byte, and `uv run python -m training.export_method_a` rebuilds Method A's forest file from the notebook's `final_model_K_Means_RF.joblib` in `reference/`.
4. **VS Code.** Select `engine/.venv/bin/python` as the interpreter (Python: Select Interpreter).

Re-run `scripts/setup.sh` whenever something seems off. It must print only `ok` lines.

## Daily workflow

1. `git switch main && git pull`
2. Branch: `<area>/<short-name>`, e.g. `engine/hole-model`, `web/library-screen`, `learn/quiz-types`. Keep branches short-lived (days, not weeks).
3. Commit small and often, under your own identity (the pre-commit hook checks this).
4. Push and open a PR to `main`. Fill in the template. The area owner reviews. One approval is needed, and you can't approve your own PR.
5. **Squash and merge.** The squashed commit keeps the PR author as its author, so each person's contributions stay visible on GitHub.
6. Delete the branch.

Never push directly to `main`. The only exception was the initial commit set on 2026-11-20.

**Committing for a teammate.** Sometimes one of us prepares a part another owns, for example while pairing or setting up. Commit it with your own identity as committer and the owner as author:

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

* **No lab data in git.** No scans, `.out` files, or masks and images derived from the GVSU slices. The repo is public, so once a file is pushed, assume it is out there. The pre-commit hook blocks the obvious cases.
* **No AI attribution in history.** No `Co-Authored-By: Claude` and no "Generated with Claude Code" lines in commits or PRs. `.claude/settings.json` turns this off for Claude Code, and `.githooks/commit-msg` strips such lines from every commit.
* **Engine output is sacred.** Porting code must not change any number (PLAN.md §7). An intended change bumps the pipeline version and regenerates the golden set, and the PR says why.

## Models and large files

The frozen models (`final_model_K_Means_RF.joblib`, the hole model), the hand-marked hole outlines and the golden masks are derived from GVSU data. Until the team decides whether they may sit in a public repo, they stay out of git and are shared through the team Drive, each with its SHA-256 in `engine/models/manifest.json`. The pre-commit hook rejects files over 5 MB.
