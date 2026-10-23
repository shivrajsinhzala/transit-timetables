#!/usr/bin/env node
/**
 * Google Search Console from the command line: what Google allows a site to automate.
 *
 *   node scripts/google.mjs submit       submit the sitemap index and every sitemap in it
 *   node scripts/google.mjs status       each sitemap: when Google last read it, errors, URLs
 *   node scripts/google.mjs inspect [n]  ask Google whether n pages (default 300) are indexed;
 *                                        writes the ones that are not to reports/google/
 *   node scripts/google.mjs report [d]   clicks, impressions and position by day (default 14 days)
 *
 * Google has no API that asks it to index an ordinary page: its Indexing API is only for job
 * postings and livestreams, and using it for other pages breaks its terms. So pages get indexed
 * the allowed ways: sitemaps (submitted here after every deploy), internal links, and by hand,
 * "Request indexing" in Search Console for about ten pages a day. `inspect` finds which pages
 * are still out and lists them, most valuable first, in reports/google/request-<date>.txt.
 *
 * Signs in as a Google Cloud service account (key file: deploy/google-sa.json, or the path in
 * GOOGLE_SA), which must be added as a user of the Search Console property. Setup steps are
 * printed when the key is missing. Without a key every command exits 0, so the weekly refresh
 * never fails over it.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const SITE = 'https://transit.shivrajsinh.in';
const PROPERTY = 'sc-domain:shivrajsinh.in';
const KEY_FILE = process.env.GOOGLE_SA || 'deploy/google-sa.json';
const SEEN = 'data/google-inspected.json'; // url -> { at, verdict, state }
const OUT = 'reports/google';
const [cmd = 'status', arg] = process.argv.slice(2);

if (!fs.existsSync(KEY_FILE)) {
  console.log(`No Google key at ${KEY_FILE}. One-time setup (about 10 minutes):
  1. https://console.cloud.google.com/ : create a project (any name), then
     APIs & Services > Library > "Google Search Console API" > Enable.
  2. IAM & Admin > Service accounts > Create service account (any name, no roles).
     Open it > Keys > Add key > JSON. Save the file as ${KEY_FILE}.
  3. https://search.google.com/search-console : property ${PROPERTY} > Settings >
     Users and permissions > Add user: the service account's email, permission "Owner"
     (sitemaps can only be submitted by an owner).
  Then run: node scripts/google.mjs submit`);
  process.exit(0);
}

/** An access token for the service account (OAuth 2.0 JWT bearer flow, no library needed). */
async function token() {
  const sa = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/webmasters', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const sig = crypto.createSign('RSA-SHA256').update(body).sign(sa.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${body}.${sig}` }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`Google sign-in failed: ${JSON.stringify(j)}`);
  return j.access_token;
}

const AUTH = { Authorization: `Bearer ${await token()}` };
const WM = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(PROPERTY)}`;
async function api(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { ...AUTH, 'Content-Type': 'application/json', ...init.headers } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${url}: HTTP ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function sitemaps() {
  const index = await (await fetch(`${SITE}/sitemap-index.xml`)).text();
  return [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

async function submit() {
  const list = [`${SITE}/sitemap-index.xml`, ...await sitemaps()];
  for (const sm of list) {
    await api(`${WM}/sitemaps/${encodeURIComponent(sm)}`, { method: 'PUT' });
    console.log(`submitted ${sm}`);
  }
}

async function status() {
  const { sitemap = [] } = await api(`${WM}/sitemaps`);
  const ours = sitemap.filter((s) => s.path.startsWith(SITE));
  if (!ours.length) { console.log('No transit sitemaps in Search Console yet: run `submit`.'); return; }
  for (const s of ours.sort((a, b) => a.path.localeCompare(b.path))) {
    const urls = (s.contents || []).reduce((n, c) => n + Number(c.submitted || 0), 0);
    console.log(`${s.path.replace(SITE, '')}: ${urls || '?'} URLs, read ${s.lastDownloaded?.slice(0, 10) || 'never'}${s.isPending ? ', pending' : ''}${Number(s.errors) ? `, ${s.errors} errors` : ''}${Number(s.warnings) ? `, ${s.warnings} warnings` : ''}`);
  }
}

/**
 * Pages worth checking first: route and system pages (core), then town-to-town journeys, then
 * stops. A page checked in the last 14 days is skipped, and one already indexed for 60.
 */
async function inspect(n) {
  const seen = fs.existsSync(SEEN) ? JSON.parse(fs.readFileSync(SEEN, 'utf8')) : {};
  const rank = (sm) => (/core/.test(sm) ? 0 : /journeys/.test(sm) ? 1 : 2);
  const urls = [];
  for (const sm of (await sitemaps()).sort((a, b) => rank(a) - rank(b))) {
    const xml = await (await fetch(sm)).text();
    urls.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  }
  const day = 86_400_000;
  const due = urls.filter((u) => { const s = seen[u]; return !s || Date.now() - s.at > (s.verdict === 'PASS' ? 60 : 14) * day; }).slice(0, n);
  let done = 0;
  for (const url of due) {
    try {
      const r = await api('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', { method: 'POST', body: JSON.stringify({ inspectionUrl: url, siteUrl: PROPERTY }) });
      const ix = r.inspectionResult?.indexStatusResult || {};
      seen[url] = { at: Date.now(), verdict: ix.verdict || '?', state: ix.coverageState || '?' };
    } catch (e) {
      // 429: the day's quota (2,000 per property) or the per-minute one (600) is used up.
      if (/HTTP 429/.test(e.message)) { console.log('Google quota reached for now; run again later.'); break; }
      console.warn(`! ${url}: ${e.message}`);
      continue;
    }
    if (++done % 50 === 0) { console.log(`${done}/${due.length} checked`); fs.writeFileSync(SEEN, JSON.stringify(seen)); }
    await new Promise((r) => setTimeout(r, 120)); // under 600 a minute
  }
  fs.writeFileSync(SEEN, JSON.stringify(seen));

  const all = Object.entries(seen);
  const indexed = all.filter(([, s]) => s.verdict === 'PASS');
  const byState = {};
  for (const [, s] of all) if (s.verdict !== 'PASS') byState[s.state] = (byState[s.state] || 0) + 1;
  console.log(`\nChecked ${done} now. Of ${all.length} pages checked so far, ${indexed.length} are indexed (${Math.round((100 * indexed.length) / Math.max(1, all.length))}%).`);
  for (const [state, count] of Object.entries(byState).sort((a, b) => b[1] - a[1])) console.log(`  not indexed, ${state}: ${count}`);

  // The hand-requested list: unindexed pages in sitemap order (routes, then journeys, then stops).
  const order = new Map(urls.map((u, i) => [u, i]));
  const out = all.filter(([u, s]) => s.verdict !== 'PASS' && order.has(u)).sort((a, b) => order.get(a[0]) - order.get(b[0])).map(([u]) => u);
  fs.mkdirSync(OUT, { recursive: true });
  const file = `${OUT}/request-${new Date().toISOString().slice(0, 10)}.txt`;
  fs.writeFileSync(file, `# Not yet indexed, most valuable first. In Search Console, paste each into the top search\n# bar (URL inspection), then click "Request indexing". Google allows about 10 a day.\n${out.join('\n')}\n`);
  console.log(`\n${out.length} unindexed pages listed in ${file}; the first 10:`);
  for (const u of out.slice(0, 10)) console.log(`  ${u}`);
}

async function report(days) {
  const end = new Date(Date.now() - 2 * 86_400_000); // Search Console data lags about two days
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  const d = (x) => x.toISOString().slice(0, 10);
  const q = (dimensions, rowLimit = 1000) => api(`${WM}/searchAnalytics/query`, {
    method: 'POST',
    body: JSON.stringify({ startDate: d(start), endDate: d(end), dimensions, rowLimit, dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'contains', expression: 'transit.shivrajsinh.in' }] }] }),
  });
  const { rows = [] } = await q(['date']);
  console.log('date        clicks  impressions  ctr    position');
  for (const r of rows) console.log(`${r.keys[0]}  ${String(r.clicks).padStart(6)}  ${String(r.impressions).padStart(11)}  ${(100 * r.ctr).toFixed(1).padStart(4)}%  ${r.position.toFixed(1).padStart(8)}`);
  const top = (await q(['query'], 15)).rows || [];
  console.log('\nTop searches:');
  for (const r of top) console.log(`  ${r.keys[0]}: ${r.clicks} clicks, ${r.impressions} impressions, position ${r.position.toFixed(1)}`);
}

if (cmd === 'submit') await submit();
else if (cmd === 'status') await status();
else if (cmd === 'inspect') await inspect(Math.min(2000, Number(arg) || 300));
else if (cmd === 'report') await report(Number(arg) || 14);
else { console.log('Usage: node scripts/google.mjs submit | status | inspect [n] | report [days]'); process.exit(1); }
