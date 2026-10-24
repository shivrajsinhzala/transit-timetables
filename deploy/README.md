# Hosting on our own server

The site is ~100,000 static files. On Cloudflare Workers Free it needed seven deployments and a
router Worker in front, and every page view counted toward a 100,000-requests-a-day limit
(error 1027 when it ran out). On our own server it is one folder served by nginx, with no file
or request limits. Cloudflare stays in front as a free CDN and for HTTPS.

The build doesn't change: it still builds shard by shard, which keeps memory and disk use low.
`--server` copies each shard into one new release on the server over SSH, and the release goes
live, all at once, after the last one (`scripts/deploy-server.mjs`).

## Quick way: one command

```bash
deploy/setup-server.sh user@host     # steps 1–3 below: server setup, server.env, build, upload, checks
```

Then do step 4 (Cloudflare) by hand.

## 1. Prepare the server (once)

Any Linux server with SSH. About 6 GB free disk: pages are stored gzipped, so one release is
~2 GB (it was ~14 GB of plain HTML in October 2026), and a release uploads next to the live one.
nginx serves `route-8.gz` for `/ca/kelowna/route-8` (`location @page` in `deploy/nginx.conf`).
A release from before compression still works; `deploy/compress-release.py` compresses one in
place. Install logrotate too: minimal images leave it out, and the nginx access log then grows
without limit (1.85 GB by 24 Oct 2026).

```bash
sudo apt install nginx rsync logrotate
sudo mkdir -p /var/www/stopwatch && sudo chown "$USER" /var/www/stopwatch
```

From the project folder on the Mac, copy the nginx config across and enable it:

```bash
scp deploy/nginx.conf deploy/stopwatch-security.conf server:/tmp/
ssh server 'sudo mv /tmp/stopwatch-security.conf /etc/nginx/snippets/ &&
  sudo mv /tmp/nginx.conf /etc/nginx/sites-available/stopwatch &&
  sudo ln -sf /etc/nginx/sites-available/stopwatch /etc/nginx/sites-enabled/stopwatch &&
  sudo nginx -t && sudo systemctl reload nginx'
```

## 2. Point the build at it (once, on the Mac)

```bash
cp deploy/server.env.example deploy/server.env   # then set DEPLOY_SSH (and DEPLOY_PATH if not /var/www/stopwatch)
scripts/weekly-refresh.sh --check                 # should say "server: ssh to … works"
```

`deploy/server.env` is not committed. Once it exists, the weekly refresh deploys to the server
instead of Cloudflare Workers.

## 3. First deploy, and check it before switching DNS

```bash
npm run release:server     # build and upload the current data (the first upload sends everything)
curl -sI -H 'Host: transit.shivrajsinh.in' http://SERVER_IP/ca/victoria       # 200
curl -sI -H 'Host: transit.shivrajsinh.in' http://SERVER_IP/bc/victoria       # 301 to /ca/victoria
```

Each refresh after that sends only the files that changed.

## 4. Switch transit.shivrajsinh.in to the server (Cloudflare dashboard)

1. **HTTPS between Cloudflare and the server.** SSL/TLS → Origin Server → Create certificate.
   Save the certificate and key on the server as `/etc/ssl/stopwatch.pem` and
   `/etc/ssl/stopwatch.key`, then add to the `server { }` block in
   `/etc/nginx/sites-available/stopwatch`:
   ```nginx
   listen 443 ssl http2;        # nginx 1.25+ may warn this form is deprecated; it still works
   # listen [::]:443 ssl http2;   # only if the server has IPv6
   ssl_certificate     /etc/ssl/stopwatch.pem;
   ssl_certificate_key /etc/ssl/stopwatch.key;
   ```
   Then run `sudo nginx -t && sudo systemctl reload nginx`. Set SSL/TLS mode to **Full (strict)**.
2. **Detach the Worker.** Workers & Pages → `transit-timetables` → Settings → Domains & Routes →
   remove `transit.shivrajsinh.in`.
3. **DNS.** Add an `A` record: name `transit`, the server's IP, **Proxied** (orange cloud).
   Add an `AAAA` record too if the server has IPv6.

The site moves over within a minute. The Workers can stay as they are for rollback; to roll
back, remove the DNS record and add the custom domain to the Worker again.

## Rolling back a bad release

```bash
ssh server 'ls /var/www/stopwatch/releases'      # the live one and the one before it
ssh server 'ln -sfn /var/www/stopwatch/releases/<older> /var/www/stopwatch/current.new &&
  mv -T /var/www/stopwatch/current.new /var/www/stopwatch/current'
```
