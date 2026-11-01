#!/usr/bin/env node
/**
 * Tells IndexNow (Bing, Yandex, Seznam, Naver; Google does not take part) about the live
 * sitemap's pages, so new and changed pages are crawled in days rather than weeks.
 * The key is a public verification token, not a secret: it is served at /<key>.txt.
 *
 * Sent each run: the core pages (home, country, system, route, hub; ~5,400), whose timetables
 * change with each refresh, and only the stop and journey (/from/) pages not sent before
 * (data/indexnow-sent.txt).
 * Sending all ~93,000 stop pages every week asked every engine to re-crawl the whole site, and
 * each crawled page is a run of the router Worker: on 12 Oct 2026 that took the site over the
 * Workers plan's daily request limit (Cloudflare error 1027). Stop pages stay in the sitemap
 * and are linked from every route page, so engines still find and refresh them at their own pace.
 * The first run with no record only records the stop pages: they were all sent on 11 Oct 2026.
 */
import fs from 'node:fs';

const HOST = 'transit.shivrajsinh.in';
const SENT = 'data/indexnow-sent.txt';
const key = fs.readFileSync('data/indexnow-key.txt', 'utf8').trim();
const index = await (await fetch(`https://${HOST}/sitemap-index.xml`)).text();
const urls = [];
// Pages that have just turned noindex (scripts/sitemaps.mjs): each sent once, so Bing recrawls
// them and drops them too.
const NOINDEXED_SENT = 'data/indexnow-noindexed-sent.txt';
let noindexed = [];
for (const sm of [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])) {
  const xml = await (await fetch(sm)).text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (sm.endsWith('/noindexed.xml')) noindexed = locs; else urls.push(...locs);
}
const noindexedSet = new Set(noindexed);
const noindexedSent = new Set(fs.existsSync(NOINDEXED_SENT) ? fs.readFileSync(NOINDEXED_SENT, 'utf8').split('\n').filter(Boolean) : []);
// Stop and town-to-town pages are many and change little: each is sent once, when it is new.
const isStop = (u) => /\/stop\/[^/]+$/.test(u) || /\/from\/[^/]+(\/to\/[^/]+)?$/.test(u);
const stops = urls.filter(isStop);
const seeded = fs.existsSync(SENT);
const sent = new Set(seeded ? fs.readFileSync(SENT, 'utf8').split('\n').filter(Boolean) : stops);
const list = [...urls.filter((u) => !isStop(u)), ...stops.filter((u) => !sent.has(u)), ...noindexed.filter((u) => !noindexedSent.has(u))];
if (!seeded) console.log(`IndexNow: no record of sent stop pages, recording ${stops.length} without sending them`);

let ok = true;
for (let i = 0; i < list.length; i += 10000) {
  const batch = list.slice(i, i + 10000);
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${key}.txt`, urlList: batch }),
  });
  console.log(`IndexNow: ${batch.length} URLs -> HTTP ${res.status}`);
  if (!res.ok) { ok = false; continue; }
  for (const u of batch) if (noindexedSet.has(u)) noindexedSent.add(u); else if (isStop(u)) sent.add(u);
}
// Only pages still in the sitemap: a removed stop or journey that comes back is new again.
const live = new Set(stops);
fs.writeFileSync(SENT, `${[...sent].filter((u) => live.has(u)).sort().join('\n')}\n`);
if (noindexed.length) fs.writeFileSync(NOINDEXED_SENT, `${[...noindexedSent].sort().join('\n')}\n`);
// IndexNow answers 429 when it is sent too much: worth knowing, never worth failing the refresh.
if (!ok) console.warn('! IndexNow refused some URLs; they will be sent again next week');
