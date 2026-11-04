#!/usr/bin/env node
/**
 * Regroups the built site's sitemaps by page type, in a built main shard (default dist/main):
 *   sitemaps/core.xml        home, country, system, route and hub pages (~5,400)
 *   sitemaps/journeys-N.xml  town-to-town and town pages (/from/), 40,000 per file
 *   sitemaps/stops-N.xml     indexable stop pages (scripts/indexed-stops.mjs), 40,000 per file
 * and writes sitemap-index.xml with core first, then journeys, then stops.
 *
 * Why: a new subdomain that submits ~98,000 URLs at once gets most of them parked as
 * "Discovered – currently not indexed". The route and system pages are what people search for
 * ("813 bus timetable", "vernon transit schedule"), so they get a sitemap of their own that
 * Search Console reports on separately, and the stop pages, still linked from every route page,
 * follow behind. Astro's per-shard sitemaps are read and replaced.
 *
 * `node scripts/sitemaps.mjs [dir]` regroups an existing build without rebuilding it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { lastmodOf } from './lastmod.mjs';

const SITE = 'https://transit.shivrajsinh.in';
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
  for (const m of xml.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?/g)) entries.set(m[1], lastmodOf(m[1]) || m[2]?.slice(0, 10) || '');
}
if (entries.size < 1000) throw new Error(`only ${entries.size} URLs found in ${sources.length} sitemaps under ${dir}: is this a full build?`);

const isStop = (url) => /\/stop\/[^/]+$/.test(url);
const isJourney = (url) => /\/from\/[^/]+(\/to\/[^/]+)?$/.test(url);
const core = [...entries.keys()].filter((u) => !isStop(u) && !isJourney(u)).sort();
const journeys = [...entries.keys()].filter(isJourney).sort();
const stops = [...entries.keys()].filter(isStop).sort();

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
    if (line.startsWith('# ')) on = line.slice(2); else if (!entries.has(line)) noindexedOn.set(line, on);
  }
}
const noindexed = [...noindexedOn.keys()];

const urlset = (urls) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${u}</loc>${entries.get(u) ? `<lastmod>${entries.get(u)}</lastmod>` : ''}</url>`).join('')}</urlset>\n`;

for (const file of sources) fs.rmSync(file);
const newest = (urls) => urls.reduce((a, u) => (entries.get(u) > a ? entries.get(u) : a), '');
const maps = [['sitemaps/core.xml', newest(core)]];
fs.writeFileSync(path.join(sub, 'core.xml'), urlset(core));
for (const [name, list] of [['journeys', journeys], ['stops', stops]]) {
  for (let i = 0; i * PER_FILE < list.length; i++) {
    const part = list.slice(i * PER_FILE, (i + 1) * PER_FILE);
    fs.writeFileSync(path.join(sub, `${name}-${i + 1}.xml`), urlset(part));
    maps.push([`sitemaps/${name}-${i + 1}.xml`, newest(part)]);
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
console.log(`sitemaps: ${core.length} core URLs, ${journeys.length} journey URLs, ${stops.length} stop URLs${noindexed.length ? `, ${noindexed.length} noindexed` : ''} in ${maps.length - 1} files`);
