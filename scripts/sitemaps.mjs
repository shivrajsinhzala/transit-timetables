#!/usr/bin/env node
/**
 * Regroups the built site's sitemaps by page type, in a built main shard (default dist/main):
 *   sitemaps/core.xml        home, country, system, route and hub pages (~5,400)
 *   sitemaps/journeys-N.xml  town-to-town and town pages (/from/), 40,000 per file
 *   sitemaps/stops-N.xml     stop pages, 40,000 per file (~93,000)
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
  const xml = fs.readFileSync(file, 'utf8');
  for (const m of xml.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?/g)) entries.set(m[1], m[2] || '');
}
if (entries.size < 1000) throw new Error(`only ${entries.size} URLs found in ${sources.length} sitemaps under ${dir}: is this a full build?`);

const isStop = (url) => /\/stop\/[^/]+$/.test(url);
const isJourney = (url) => /\/from\/[^/]+(\/to\/[^/]+)?$/.test(url);
const core = [...entries.keys()].filter((u) => !isStop(u) && !isJourney(u)).sort();
const journeys = [...entries.keys()].filter(isJourney).sort();
const stops = [...entries.keys()].filter(isStop).sort();

const urlset = (urls) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${u}</loc>${entries.get(u) ? `<lastmod>${entries.get(u)}</lastmod>` : ''}</url>`).join('')}</urlset>\n`;

for (const file of sources) fs.rmSync(file);
const maps = ['sitemaps/core.xml'];
fs.writeFileSync(path.join(sub, 'core.xml'), urlset(core));
for (const [name, list] of [['journeys', journeys], ['stops', stops]]) {
  for (let i = 0; i * PER_FILE < list.length; i++) {
    fs.writeFileSync(path.join(sub, `${name}-${i + 1}.xml`), urlset(list.slice(i * PER_FILE, (i + 1) * PER_FILE)));
    maps.push(`sitemaps/${name}-${i + 1}.xml`);
  }
}
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(dir, 'sitemap-index.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${maps.map((m) => `<sitemap><loc>${SITE}/${m}</loc><lastmod>${today}</lastmod></sitemap>`).join('')}</sitemapindex>\n`);
console.log(`sitemaps: ${core.length} core URLs, ${journeys.length} journey URLs, ${stops.length} stop URLs in ${maps.length - 1} files`);
