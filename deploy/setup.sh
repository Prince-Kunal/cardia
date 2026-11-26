#!/usr/bin/env bash
# One-time server setup for Cardia on a fresh Ubuntu 24.04 Vultr server. Run as root:
#   bash setup.sh git@github.com:<owner>/cardia.git
# It runs in two parts. The first prints a key; add it to the GitHub repo as a read-only deploy key
# (Settings > Deploy keys), then run the same command again to finish.
set -euo pipefail
REPO="${1:?usage: bash setup.sh git@github.com:<owner>/cardia.git}"

apt-get update -y
apt-get install -y git curl rsync ufw debian-keyring debian-archive-keyring apt-transport-https gpg

id cardia &>/dev/null || useradd --system --create-home --home-dir /home/cardia --shell /bin/bash cardia
id deploy &>/dev/null || useradd --create-home --shell /bin/bash deploy

# A read-only key so the server can pull the private repo.
sudo -u cardia -H bash -c 'mkdir -p ~/.ssh && chmod 700 ~/.ssh && [ -f ~/.ssh/id_ed25519 ] || ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 -C cardia-server
  ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null'
if ! sudo -u cardia -H git ls-remote "$REPO" &>/dev/null; then
  echo; echo "Add this as a read-only deploy key on the GitHub repo, then run this script again:"; echo
  cat /home/cardia/.ssh/id_ed25519.pub; exit 0
fi

[ -d /opt/cardia/.git ] || { mkdir -p /opt/cardia; chown cardia:cardia /opt/cardia; sudo -u cardia -H git clone "$REPO" /opt/cardia; }
mkdir -p /opt/cardia-web; chown deploy:deploy /opt/cardia-web

# uv installs Python 3.14 and the pinned packages.
command -v uv &>/dev/null || curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin UV_NO_MODIFY_PATH=1 sh
(cd /opt/cardia/engine && sudo -u cardia -H uv sync --frozen --no-dev)

# The engine service.
install -m 644 /opt/cardia/deploy/cardia.service /etc/systemd/system/cardia.service
chmod +x /opt/cardia/deploy/update.sh
systemctl daemon-reload; systemctl enable --now cardia

# The key GitHub Actions uses to log in as `deploy`: made here, its private half is printed once at the end.
sudo -u deploy -H bash -c 'mkdir -p ~/.ssh && chmod 700 ~/.ssh && [ -f ~/.ssh/id_ed25519 ] || ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 -C github-actions
  cat ~/.ssh/id_ed25519.pub > ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'

# The deploy user may run only the update script as root.
echo "deploy ALL=(root) NOPASSWD: /opt/cardia/deploy/update.sh" > /etc/sudoers.d/cardia-deploy
chmod 440 /etc/sudoers.d/cardia-deploy

# Caddy: HTTPS in front of the engine, on a free <ip>.sslip.io name (no domain needed).
if ! command -v caddy &>/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y; apt-get install -y caddy
fi
IP=$(curl -4 -s https://ifconfig.me)
SITE="${IP//./-}.sslip.io"
sed "s/{\$CARDIA_SITE}/$SITE/" /opt/cardia/deploy/Caddyfile > /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

ufw allow OpenSSH; ufw allow 80/tcp; ufw allow 443/tcp; ufw --force enable
echo; echo "Done. The site will be at https://$SITE once the first web build is deployed."
echo "In the GitHub repo (Settings > Secrets and variables > Actions) add:"
echo "  DEPLOY_HOST = $IP"
echo "  DEPLOY_SSH_KEY = everything between the lines below"
echo "----"; cat /home/deploy/.ssh/id_ed25519; echo "----"
