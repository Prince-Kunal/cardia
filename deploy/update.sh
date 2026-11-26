#!/usr/bin/env bash
# Run on the server by the GitHub Actions deploy (as root, through sudo): pull, reinstall, restart.
set -euo pipefail
cd /opt/cardia
sudo -u cardia git pull --ff-only
cd engine
sudo -u cardia -H uv sync --frozen --no-dev
systemctl restart cardia
systemctl is-active cardia
