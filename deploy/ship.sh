#!/usr/bin/env bash
# Run on your own computer from anywhere: bash ~/cardia/deploy/ship.sh
# Pulls main, makes the public-deploy branch, runs the engine and web tests, then commits and pushes ONLY if they pass.
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only origin main
git checkout -B public-deploy
(cd engine && uv run pytest -q ${PYTEST_ARGS:-})
(cd web && pnpm install --frozen-lockfile && pnpm lint && pnpm test)
git add deploy engine/cardia_api engine/tests/test_public.py web/src/api/connection.ts
[ -f .github/workflows/deploy.yml ] && git add .github/workflows/deploy.yml || echo "Note: .github/workflows/deploy.yml is missing; copy it in and commit it too."
git status --short
git -c user.name="Melove Gupta" -c user.email="melovegupta0406@gmail.com" commit -F - <<'MSG'
feat(deploy): a public mode for the engine and a Vultr deploy

--public runs the engine behind a reverse proxy: no per-launch token, the UI is served from the
engine's own address, one shared library, and the watch folder, backup and restore are off.
deploy/ has the server setup, Caddy and systemd files; deploy.yml redeploys on every push to main.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
MSG
git push -u origin public-deploy
echo "Pushed. Open a pull request into main when you're ready."
