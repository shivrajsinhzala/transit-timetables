#!/usr/bin/env node
/**
 * Checks the move to SITE_URL URL by URL. For every old URL:
 *   - the same path on SITE_URL answers 200 (following none, or at most the site's own 301s
 *     such as /bc -> /ca), and
 *   - with MIGRATION_REDIRECTS on: the old URL answers 301 with Location exactly
 *     SITE_URL + the same path and query, and that answers 200.
 *     With it off: the old URL still answers 200 itself.
 * Anything else is listed in reports/migration/<date>.txt and the script exits 1.
 *
 * Which URLs: every <loc> in the old host's sitemaps (sitemap-index.xml and the files it lists),
 * plus any files given with --urls (one URL or path a line, e.g. data/index-keep.txt or a Search
 * Console export), so pages Google knows but the sitemaps have dropped are checked too.
 *
 *   node scripts/verify-migration.mjs                       # old sitemaps, redirects expected off
 *   MIGRATION_REDIRECTS=on node scripts/verify-migration.mjs --urls data/index-keep.txt
 *   node scripts/verify-migration.mjs --limit 500           # a sample, spread through the list
 *
 * Eight requests at a time, with no cache: it reads the live sites, so run it after a deploy.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SITE, OLD_HOSTS, MIGRATION_REDIRECTS } from '../src/lib/site.js';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const OLD = `https://${opt('--old') || OLD_HOSTS[0]}`;
const LIMIT = Number(opt('--limit')) || 0;
const files = args.flatMap((a, i) => (args[i - 1] === '--urls' ? [a] : []));
const CONCURRENCY = 8;
const UA = 'StopwatchMigrationCheck/1.0';

const get = (url, redirect = 'manual') => fetch(url, { redirect, headers: { 'User-Agent': UA, 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30_000) });

async function sitemapUrls() {
  const out = new Set();
  const read = async (url) => {
    // The sitemaps themselves are read from wherever they now answer (old host or, after the switch, the new one).
    const res = await get(url, 'follow');
    if (!res.ok) { console.warn(`! ${url}: HTTP ${res.status}`); return; }
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
    if (/<sitemapindex/.test(xml)) for (const l of locs) await read(l);
    else for (const l of locs) out.add(l);
  };
  await read(`${OLD}/sitemap-index.xml`);
  return out;
}

// Every URL as a path, so old- and new-host lists compare alike.
const toPath = (u) => {
  const s = u.trim();
  if (!s || s.startsWith('#')) return null;
  if (/^https?:\/\//.test(s)) { const x = new URL(s); return x.pathname + x.search; }
  return `/${s.replace(/^\/+/, '')}`;
};

const paths = new Set();
for (const u of await sitemapUrls()) { const p = toPath(u); if (p) paths.add(p); }
for (const f of files) for (const line of fs.readFileSync(f, 'utf8').split('\n')) { const p = toPath(line.split(',')[0]); if (p && p !== '/Top pages') paths.add(p); }
let list = [...paths].sort();
if (LIMIT && list.length > LIMIT) { const step = list.length / LIMIT; list = Array.from({ length: LIMIT }, (_, i) => list[Math.floor(i * step)]); }
console.log(`checking ${list.length} URLs: ${OLD} -> ${SITE} (redirects ${MIGRATION_REDIRECTS ? 'on' : 'off'})`);

const problems = [];
const finalStatus = async (url) => {
  // Follow at most the site's own redirects (/bc -> /ca, /x.html -> /x), and only on SITE_URL.
  let u = url;
  for (let hop = 0; hop < 3; hop++) {
    const res = await get(u);
    if (res.status < 300 || res.status >= 400) return { status: res.status, url: u };
    const loc = new URL(res.headers.get('location'), u).href;
    if (!loc.startsWith(`${SITE}/`) && loc !== SITE) return { status: res.status, url: u, to: loc };
    u = loc;
  }
  return { status: 'too many redirects', url: u };
};

async function check(p) {
  const oldUrl = `${OLD}${p}`;
  const newUrl = `${SITE}${p}`;
  try {
    const n = await finalStatus(newUrl);
    if (n.status !== 200) problems.push(`${p}  new host: ${n.status}${n.to ? ` -> ${n.to}` : ''}`);
    const o = await get(oldUrl);
    if (MIGRATION_REDIRECTS) {
      const loc = o.headers.get('location');
      if (o.status !== 301) problems.push(`${p}  old host: ${o.status}, wanted 301`);
      else if (loc !== newUrl) problems.push(`${p}  old host: 301 to ${loc}, wanted ${newUrl}`);
    } else if (o.status !== 200) {
      const f = await finalStatus(oldUrl).catch(() => ({ status: 'error' }));
      if (f.status !== 200) problems.push(`${p}  old host: ${o.status}, wanted 200 (redirects off)`);
    }
  } catch (e) {
    problems.push(`${p}  ${e.name === 'TimeoutError' ? 'timed out' : e.message}`);
  }
}

let done = 0;
const queue = [...list];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    await check(queue.shift());
    if (++done % 250 === 0) console.log(`  ${done}/${list.length}, ${problems.length} problems`);
  }
}));

const day = new Date().toISOString().slice(0, 10);
const out = path.join('reports/migration', `${day}.txt`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${list.length} URLs checked ${new Date().toISOString()}: ${OLD} -> ${SITE}, redirects ${MIGRATION_REDIRECTS ? 'on' : 'off'}\n${problems.length} problems\n\n${problems.sort().join('\n')}\n`);
console.log(problems.length ? `✗ ${problems.length} of ${list.length} URLs failed, listed in ${out}` : `✓ all ${list.length} URLs pass (${out})`);
process.exit(problems.length ? 1 : 0);
