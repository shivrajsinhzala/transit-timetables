#!/usr/bin/env node
/**
 * Regroups the built site's sitemaps by country, in a built main shard (default dist/main):
 *   sitemaps/site.xml       home, about and privacy
 *   sitemaps/<cc>.xml       one country's indexable pages: its hub, systems, routes, interchanges
 *                           and the deep pages people search for (<cc>-2.xml past 40,000 URLs)
 * and writes sitemap-index.xml, Australia first, then the UK, Ireland, the US, Canada and New
 * Zealand. Only indexable pages are listed (astro.config.mjs asks src/lib/indexing.js), so each
 * country's file in Search Console reads as "submitted vs indexed" for that market.
 *
 * <lastmod> is the date a page's content last changed (scripts/lastmod.mjs), or, for a page no
 * build has recorded yet, its system's timetable refresh date: never the build date.
 *
 * `node scripts/sitemaps.mjs [dir]` regroups an existing build without rebuilding it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { lastmodOf } from './lastmod.mjs';

import { SITE } from '../src/lib/site.js';
const PER_FILE = 40_000; // the protocol allows 50,000; leave headroom
const dir = process.argv[2] || 'dist/main';
const sub = path.join(dir, 'sitemaps');
fs.mkdirSync(sub, { recursive: true });

const sources = [
  ...fs.readdirSync(dir).filter((f) => /^sitemap-\d+\.xml$/.test(f)).map((f) => path.join(dir, f)),
  ...fs.readdirSync(sub).filter((f) => f.endsWith('.xml')).map((f) => path.join(sub, f)),
];
const entries = new Map(); // url -> lastmod
for (const file of sources) {
  // A regrouped build still has these: their pages must not join the indexable sitemaps.
  if (/\/noindexed(-\d+)?\.xml$/.test(file)) continue;
  const xml = fs.readFileSync(file, 'utf8');
  // The date the page's content last changed (scripts/lastmod.mjs), not the build date Astro gives.
  for (const m of xml.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?/g)) entries.set(m[1], lastmodOf(m[1]) || '');
}
if (entries.size < 500) throw new Error(`only ${entries.size} URLs found in ${sources.length} sitemaps under ${dir}: is this a full build?`);

// Fallback dates: a system's refresh date, a country's newest, the site's newest.
const INDEX = JSON.parse(fs.readFileSync('src/data/index.json', 'utf8'));
const builtOf = new Map(INDEX.map((x) => [x.key, x.builtOn]));
const newestIn = (cc) => INDEX.filter((x) => !cc || x.cc === cc).map((x) => x.builtOn).sort().at(-1) || '';
for (const [u, d] of entries) {
  if (d) continue; // the date the content last changed, recorded by scripts/lastmod.mjs
  const parts = u.slice(SITE.length + 1).split('/').filter(Boolean);
  entries.set(u, parts.length >= 2 ? builtOf.get(`${parts[0]}/${parts[1]}`) || newestIn(parts[0]) : newestIn(parts.length === 1 && parts[0].length === 2 ? parts[0] : null));
}

const ORDER = ['au', 'uk', 'ie', 'us', 'ca', 'nz'];
const ccOf = (url) => {
  const first = url.slice(SITE.length + 1).split('/')[0];
  return /^[a-z]{2}$/.test(first) ? first : 'site';
};
const groups = new Map(); // 'site' | cc -> urls
for (const u of [...entries.keys()].sort()) {
  const g = ccOf(u);
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(u);
}
const groupOrder = ['site', ...ORDER, ...[...groups.keys()].filter((g) => g !== 'site' && !ORDER.includes(g)).sort()].filter((g) => groups.has(g));

// Pages that have just turned noindex (data/noindexed.txt: a "# yyyy-mm-dd" line, then one URL a
// line) get a sitemap of their own until Google has recrawled them: without one it finds the
// noindex whenever it next happens by, months later on a young site, and Search Console has
// nothing to report them against. Delete the file once its "Excluded by 'noindex' tag" count
// stops rising (PR #21, 2 Nov 2026: 13,990 town-to-town and town pages).
const NOINDEXED = 'data/noindexed.txt';
// Each "# yyyy-mm-dd" line dates the URLs under it (keep list, 3 Nov 2026: 55,781 more).
const noindexedOn = new Map(); // url -> date it turned noindex
if (fs.existsSync(NOINDEXED)) {
  let on = '';
  for (const line of fs.readFileSync(NOINDEXED, 'utf8').split('\n').filter(Boolean)) {
    // A page the keep list has since taken back is indexable again, so it is left out here.
    if (line.startsWith('# ')) on = line.slice(2); else if (line.startsWith(`${SITE}/`) && !entries.has(line)) noindexedOn.set(line, on);
  }
}
const noindexed = [...noindexedOn.keys()];

const urlset = (urls) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${u}</loc>${entries.get(u) ? `<lastmod>${entries.get(u)}</lastmod>` : ''}</url>`).join('')}</urlset>\n`;

for (const file of sources) fs.rmSync(file);
const newest = (urls) => urls.reduce((a, u) => (entries.get(u) > a ? entries.get(u) : a), '');
const maps = [];
for (const g of groupOrder) {
  const list = groups.get(g);
  for (let i = 0; i * PER_FILE < list.length; i++) {
    const part = list.slice(i * PER_FILE, (i + 1) * PER_FILE);
    const name = `${g}${i ? `-${i + 1}` : ''}.xml`;
    fs.writeFileSync(path.join(sub, name), urlset(part));
    maps.push([`sitemaps/${name}`, newest(part)]);
  }
}
// The first file keeps the name Search Console already has: noindexed.xml, noindexed-2.xml, ...
for (let i = 0; i * PER_FILE < noindexed.length; i++) {
  const part = noindexed.slice(i * PER_FILE, (i + 1) * PER_FILE);
  const name = `noindexed${i ? `-${i + 1}` : ''}.xml`;
  fs.writeFileSync(path.join(sub, name), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${part.map((u) => `<url><loc>${u}</loc>${noindexedOn.get(u) ? `<lastmod>${noindexedOn.get(u)}</lastmod>` : ''}</url>`).join('')}</urlset>\n`);
  maps.push([`sitemaps/${name}`, part.reduce((a, u) => (noindexedOn.get(u) > a ? noindexedOn.get(u) : a), '')]);
}
// Each file's lastmod is its newest page's, so Google rereads only the files that changed.
fs.writeFileSync(path.join(dir, 'sitemap-index.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${maps.map(([m, d]) => `<sitemap><loc>${SITE}/${m}</loc>${d ? `<lastmod>${d}</lastmod>` : ''}</sitemap>`).join('')}</sitemapindex>\n`);
console.log(`sitemaps: ${groupOrder.map((g) => `${g} ${groups.get(g).length}`).join(', ')}${noindexed.length ? `, ${noindexed.length} noindexed` : ''} in ${maps.length} files`);
