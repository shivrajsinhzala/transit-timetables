# Handoff: what to do next, for Claude Code on the Mac

This folder carries a cloud Claude Code session (12 Oct 2026) over to Claude Code on the Mac,
which has what the cloud session lacked: SSH to the server, the Cloudflare login, the GTFS
data, and the Semrush connector. Open Claude Code in the project folder and say:

> Read handoff/README.md and do the tasks in order. Ask me before anything in Cloudflare.

Delete this folder once the tasks are done.

---

## What happened so far

1. **The site went down with Cloudflare error 1027** (HTTP 429 on every `/ca/*`, `/uk/*`,
   `/geo/*` URL; home and country pages still loaded). The router Worker
   (`worker/router.js`) had gone over the Workers Free plan's 100,000 requests a day. Two
   things used it up:
   - every request for scripts (`/_a/<shard>/`) and maps (`/geo/`) also ran the Worker, so one
     page view cost up to three requests;
   - `scripts/indexnow.mjs` sent all ~98,000 URLs every week, asking every engine to re-crawl
     the whole site.

   Also on: Cloudflare **Speed Brain** (the `speculation-rules` header), which prefetches links,
   one more request each.
2. **PR #1, merged**: scripts and maps are copied into the main deployment (free static
   assets, no Worker run), and IndexNow sends core pages weekly but each stop page only once
   (`data/indexnow-sent.txt`). **Not deployed yet**: nothing has been built or deployed since.
3. **Decision: leave Cloudflare Workers for our own server** (we already have SSH to it)
   instead of paying for Workers Paid. Cloudflare stays in front only as a free CDN and for
   HTTPS, with no Worker, so there is no request limit.
4. **PR #2, on this branch** (`claude/transit-rate-limiting-jymsd1`):
   - `build-all.mjs --server` / `scripts/deploy-server.mjs`: build shard by shard as before,
     rsync each shard into one new release on the server, go live by an atomic symlink swap,
     keep three releases;
   - `deploy/nginx.conf`: clean URLs, the `/bc` redirects, 404 page and cache headers;
   - `deploy/setup-server.sh user@host`: sets up the server, writes `deploy/server.env`,
     builds, uploads and checks, all in one command;
   - `deploy/README.md`: the full steps, the Cloudflare switch and rollback.

   Tested in the cloud with nginx and rsync against a local stand-in for the server. Not yet
   run against the real server or with a full build.
5. **Next after hosting: SEO.** Search Console has started showing results. The goal is
   thousands of users a day from search, using Semrush for competitors and keywords.

---

## Tasks, in order

### 1. Move the site to the server

- [ ] `git fetch && git checkout claude/transit-rate-limiting-jymsd1`
- [ ] Ask me for the server's SSH address (`user@host`) if it isn't clear from `~/.ssh/config`.
- [ ] Run `deploy/setup-server.sh user@host`. It needs sudo on the server, and the first upload
      is ~6.5 GB. If the server is behind NAT, pass its public IP as `SERVER_IP=…`. If it has
      IPv6, uncomment the `listen [::]` lines in deploy/nginx.conf.
- [ ] Every check at the end must print `ok`. If any fails, fix it before going further.
- [ ] **Stop and ask me** before step 4 of `deploy/README.md`, the Cloudflare switch:
      origin certificate and SSL mode Full (strict), remove the Worker's custom domain,
      add a proxied `A` record. After the switch, check
      `curl -sI https://transit.shivrajsinh.in/ca/victoria` is 200, served via Cloudflare, with
      no 1027 error.
- [ ] Run `npm run indexnow`. The first run only records the stop pages; that's expected.
- [ ] Mark PR #2 ready and merge it once the site is live from the server.

### 2. SEO: thousands of users a day

Use the **Semrush connector** for data and the site's own code for changes. Work from numbers
and don't guess volumes.

- [ ] **Search Console**: ask me for the export (Performance → last 28 days → Queries and
      Pages CSVs) or for access. List queries ranking 5–20 with impressions: those are the
      quickest wins.
- [ ] **Competitors** (Semrush competitors and organic research): find who ranks for our page
      types in each country, for example `[city] bus schedule`, `route [N] [city]`,
      `[operator] [route] timetable`, `[stop name] bus times`, `bc transit [town]`,
      `[town] bus times`. Expect Moovit, the Transit app, bustimes.org (UK), operator sites and
      PDF timetables. For each: traffic, top pages, page structure, and what they lack that we
      have (whole day on one screen, next bus, offline).
- [ ] **Keywords**: volume and difficulty per country and system. Rank systems and page types
      by achievable traffic. Big systems (Toronto, Dublin, Melbourne, the UK operators) are
      likely to matter most.
- [ ] **Gap analysis**: keywords competitors rank for that we have the data to answer but
      no page for. Candidates: `[A] to [B] bus`, `last bus [city]`, `[route] sunday
      schedule`, holiday service, `bus [N] near me`.
- [ ] **Changes**, as a PR with numbers behind each one: titles, H1s and descriptions in the
      words people search with; internal links (system ↔ routes ↔ stops ↔ hubs); structured
      data; new page types only where the gap analysis shows demand. Keep
      `scripts/verify-build.mjs` passing, then build and deploy with `npm run release:server`.
- [ ] Optional quick win: each page inlines ~20 KB of CSS, and the site is ~6.5 GB. Making it
      smaller speeds up pages (a ranking factor) and every deploy.

---

## Things to know about this codebase

- `npm run refresh:server` is the full weekly pipeline to the server: fetch feeds, data,
  images, build, upload, IndexNow. `scripts/weekly-refresh.sh` (launchd, Mondays 04:00) picks
  the server automatically once `deploy/server.env` exists.
- A full build needs ~12 GB of RAM for the data step and ~2 GB of free disk per shard. Shards
  are built and uploaded one at a time.
- Systems are listed in `data/systems.mjs`. Add one only after reading its licence.
- Never change a published URL slug. Removed pages get redirects in both `worker/router.js`
  and `deploy/nginx.conf`.
