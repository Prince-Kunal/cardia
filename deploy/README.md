# Deploying Cardia to a Vultr server

One server runs the engine and serves the web app; Caddy puts HTTPS in front on a free `<ip>.sslip.io` address (no domain needed). Every push to `main` redeploys by itself (`.github/workflows/deploy.yml`).

**The live site: <https://139-84-209-207.sslip.io>** (PLAN.md D14). GVSU shared the study data for us to use as we like, deployment included.

## One-time setup

1. In Vultr, deploy a **Cloud Compute (regular) server, Ubuntu 24.04, 2 GB RAM or more** (the machine-learning libraries need it). Add your SSH key.
2. SSH in as root and get `setup.sh` (run it from a clone: `git clone` needs the key below, so the first time paste the file in or `scp` it).
3. `bash setup.sh git@github.com:<owner>/cardia.git`. The first run prints a key: add it to the GitHub repo as a **read-only deploy key** (Settings > Deploy keys), then run the same command again.
4. The script ends by printing `DEPLOY_HOST` and `DEPLOY_SSH_KEY`. Add both as repository secrets (Settings > Secrets and variables > Actions).
5. Push to `main` (or run the **deploy** workflow by hand). The site is then at `https://<ip with dashes>.sslip.io`.

## What public mode changes

`python -m cardia_api --public` (see `engine/cardia_api/settings.py`): no per-launch token, any Host the proxy forwards, the UI is the same origin, the watch folder is off, and library backup and restore return 403. The engine still listens on `127.0.0.1` only. The web build uses `VITE_CARDIA_PUBLIC=1` so it talks to its own address.

**Everyone shares one library.** Anyone with the link can see, add and delete hearts. That is fine for a demo; for real use it needs accounts first.

## Checking it

* `systemctl status cardia` and `journalctl -u cardia -n 50` for the engine; `systemctl status caddy` for HTTPS.
* `curl https://<site>/api/v1/health` should return `status: ok`.
