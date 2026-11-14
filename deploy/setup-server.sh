#!/bin/bash
# One-time server setup and first deploy, run from the project folder on the Mac:
#
#   deploy/setup-server.sh user@host
#
# 1. installs nginx and rsync on the server and creates /var/www/stopwatch (needs sudo there);
# 2. installs deploy/nginx.conf and deploy/stopwatch-security.conf and reloads nginx;
# 3. writes deploy/server.env, so the build and the weekly refresh deploy to this server;
# 4. builds and uploads the site (npm run release:server; the first upload sends ~6.5 GB);
# 5. checks key URLs on the server by IP, before any DNS change.
# It never touches Cloudflare: the DNS switch is step 4 of deploy/README.md.
# Safe to run again; `--skip-build` stops after step 3.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${1:?usage: deploy/setup-server.sh user@host [--skip-build]}"
SKIP_BUILD="${2:-}"
DEPLOY_PATH="${DEPLOY_PATH:-/var/www/stopwatch}"
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=15)

echo "→ checking ssh to ${HOST}"
"${SSH[@]}" "$HOST" true

echo "→ installing nginx and rsync, creating ${DEPLOY_PATH}"
"${SSH[@]}" -t "$HOST" "set -e
  if ! command -v nginx >/dev/null || ! command -v rsync >/dev/null || ! command -v logrotate >/dev/null; then
    sudo apt-get update -q && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -q nginx rsync logrotate
  fi
  sudo mkdir -p ${DEPLOY_PATH}/releases && sudo chown -R \"\$(id -un)\" ${DEPLOY_PATH}"

echo "→ installing the nginx site"
node scripts/make-migration.mjs   # host blocks from SITE_URL and MIGRATION_REDIRECTS
conf=deploy/nginx.conf
site=$(mktemp)
sed "s#/var/www/stopwatch/current#${DEPLOY_PATH}/current#" deploy/stopwatch-site.conf > "$site"
scp -q "$conf" "$HOST":/tmp/stopwatch-nginx.conf
scp -q "$site" "$HOST":/tmp/stopwatch-site.conf
scp -q deploy/stopwatch-security.conf deploy/stopwatch-hosts.conf deploy/stopwatch-old-host.conf deploy/stopwatch-moved.conf deploy/headway-moved.conf deploy/busclock-moved.conf "$HOST":/tmp/
"${SSH[@]}" -t "$HOST" "set -e
  sudo mkdir -p /etc/nginx/snippets
  for f in stopwatch-site stopwatch-security stopwatch-hosts stopwatch-old-host stopwatch-moved headway-moved busclock-moved; do sudo mv /tmp/\$f.conf /etc/nginx/snippets/\$f.conf; done
  sudo mv /tmp/stopwatch-nginx.conf /etc/nginx/sites-available/stopwatch
  sudo ln -sf /etc/nginx/sites-available/stopwatch /etc/nginx/sites-enabled/stopwatch
  sudo nginx -t && sudo systemctl reload nginx"
rm -f "$site"

echo "→ writing deploy/server.env"
printf 'DEPLOY_SSH=%s\nDEPLOY_PATH=%s\n' "$HOST" "$DEPLOY_PATH" > deploy/server.env
"${SSH[@]}" "$HOST" "test -d ${DEPLOY_PATH}/releases && test -w ${DEPLOY_PATH}" && echo "  server.env written; the build will deploy to ${HOST}"

if [ "$SKIP_BUILD" = "--skip-build" ]; then echo "done (build skipped)"; exit 0; fi

echo "→ building and uploading (long: every shard is built, then uploaded)"
if [ ! -d data/raw ] || [ -z "$(ls data/raw/*.zip 2>/dev/null)" ]; then npm run fetch && npm run data && node scripts/make-images.mjs; fi
npm run release:server

echo "→ checking the server directly"
IP="${SERVER_IP:-$("${SSH[@]}" "$HOST" "hostname -I | awk '{print \$1}'")}"  # SERVER_IP=… if the server is behind NAT
fail=0
SITE_HOST="$(node -e "import('./src/lib/site.js').then((m) => console.log(m.SITE_HOST))")"
check() {  # path, expected status
  got=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -H "Host: ${SITE_HOST}" "http://${IP}$1")
  if [ "$got" = "$2" ]; then echo "  ok   $2 $1"; else echo "  FAIL $1: got $got, wanted $2"; fail=1; fi
}
check / 200
check /ca 200
check /ca/victoria 200
check /bc/victoria 301
check /search/index.json 200
check /sitemap-index.xml 200
check /no-such-page 404
if [ "$fail" = 1 ]; then echo "some checks failed: do not switch DNS yet"; exit 1; fi
echo "server ${IP} is ready. Next: deploy/README.md step 4 (Cloudflare: origin certificate, remove the Worker's domain, A record ${IP} proxied)."
