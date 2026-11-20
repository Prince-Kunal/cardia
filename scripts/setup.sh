#!/usr/bin/env bash
# One-time setup for a Cardia clone. Safe to re-run.
#   scripts/setup.sh                 check everything
#   scripts/setup.sh <github-user>   also set your commit identity for this repo
set -uo pipefail
cd "$(dirname "$0")/.."

# GitHub username -> commit email (works with macOS's bash 3.2: no associative arrays)
team_email() {
  case "$1" in
    Prince-Kunal) echo "kunalprince615@gmail.com" ;;
    MeloveGupta) echo "melovegupta0406@gmail.com" ;;
    krrishverma1805-web) echo "krrishverma1805@gmail.com" ;;
    *) echo "" ;;
  esac
}
status=0
say() { printf '%-10s %s\n' "$1" "$2"; }

# 1. Commit identity (repo-local, so other projects on your machine are untouched)
if [ "${1:-}" != "" ]; then
  if [ -z "$(team_email "$1")" ]; then echo "Unknown team username '$1'. Use Prince-Kunal, MeloveGupta or krrishverma1805-web"; exit 1; fi
  git config user.name "$1"
  git config user.email "$(team_email "$1")"
fi
name="$(git config user.name || true)"; email="$(git config user.email || true)"
if [ -n "$name" ] && [ "$(team_email "$name")" = "$email" ]; then say ok "identity: $name <$email>"
else say FIX "identity is '$name <$email>'. Run: scripts/setup.sh <your-github-username>"; status=1; fi

# 2. Shared git hooks (identity check, no lab data, no AI attribution)
git config core.hooksPath .githooks && chmod +x .githooks/* && say ok "git hooks: .githooks"

# 3. Pinned toolchain
want_node="$(cat .nvmrc)"; want_pnpm="10.20.0"
command -v uv >/dev/null && say ok "uv $(uv --version | cut -d' ' -f2)" || { say FIX "install uv: https://docs.astral.sh/uv/"; status=1; }
have_node="$(node --version 2>/dev/null | tr -d v)"
[ "$have_node" = "$want_node" ] && say ok "node $have_node" || { say FIX "node is '${have_node:-missing}', need $want_node (nvm install / fnm install)"; status=1; }
have_pnpm="$(pnpm --version 2>/dev/null)"
[ "$have_pnpm" = "$want_pnpm" ] && say ok "pnpm $have_pnpm" || { say FIX "pnpm is '${have_pnpm:-missing}', need $want_pnpm (corepack enable; corepack prepare pnpm@$want_pnpm --activate)"; status=1; }

# 4. Engine environment (exact versions from engine/uv.lock)
if command -v uv >/dev/null; then
  (cd engine && uv sync --locked --quiet) && say ok "engine env: $(engine/.venv/bin/python --version)" || { say FIX "engine: uv sync --locked failed"; status=1; }
fi

# 5. Study data (byte-identical on every machine)
if [ -x engine/.venv/bin/python ]; then py=engine/.venv/bin/python; else py=python3; fi
log="$(mktemp)"
if "$py" scripts/check_data.py >"$log" 2>&1; then say ok "data: $(tail -1 "$log")"
else say FIX "data: $(tail -1 "$log"). Put the GVSU study files in data/ (see CONTRIBUTING.md)"; status=1; fi
rm -f "$log"

exit $status
