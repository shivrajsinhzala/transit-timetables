#!/usr/bin/env node
/**
 * Which deep pages Google may index: data/index-keep.txt, one path a line ("au/brisbane/route-325").
 *
 * On 28 Oct 2026 Google dropped nearly every transit page from its results ("Crawled – currently
 * not indexed", none re-crawled first): ~220,000 pages in three weeks, 177,000 of them never even
 * crawled, read as a site of thin generated pages. Recovery is a small site of pages with proven
 * demand, so route, stop, hub, town and town-to-town pages are indexable only when Search Console
 * shows people searched for them:
 *   - route pages with any impressions (what people search for, and the most complete pages);
 *   - every other deep page with a click, or 20+ impressions, in the export.
 * Country and system pages are always indexable and are not listed. Everything else keeps its page
 * and its links, with <meta name="robots" content="noindex"> and out of the sitemaps
 * (src/layouts/Base.astro, astro.config.mjs).
 *
 *   node scripts/index-keep.mjs <Pages.csv> [...]
 *
 * Each file is a Search Console "Pages" export (Performance > Pages > Export > CSV: Top pages,
 * Clicks, Impressions, ...). Pages are only ever added: a page that earned its place stays, so
 * re-run it monthly on the last month's export.
 */
import fs from 'node:fs';

const OUT = 'data/index-keep.txt';
const SITE = 'https://transit.shivrajsinh.in/';
const MIN_IMPRESSIONS = 20;

const keep = new Set(fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')) : []);
const before = keep.size;
for (const file of process.argv.slice(2)) {
  const [head, ...rows] = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => l.split(','));
  const col = (re) => head.findIndex((h) => re.test(h));
  const [ci, ii] = [col(/^clicks$/i), col(/^impressions$/i)];
  if (ci < 0 || ii < 0) throw new Error(`${file}: no Clicks/Impressions columns (header: ${head.join(',')})`);
  for (const r of rows) {
    if (!r[0].startsWith(SITE)) continue;
    const page = r[0].slice(SITE.length).replace(/^bc\//, 'ca/'); // /bc moved under /ca (Oct 2026)
    if (page.split('/').length < 3) continue; // country and system pages: always indexable
    const clicks = Number(r[ci]), impressions = Number(r[ii]);
    const route = !['stop', 'hub', 'from'].includes(page.split('/')[2]); // some route slugs have no "route-"
    if (route ? impressions >= 1 : clicks >= 1 || impressions >= MIN_IMPRESSIONS) keep.add(page);
  }
}
fs.writeFileSync(OUT, `# Deep pages Google may index (scripts/index-keep.mjs). Country and system pages are always indexable.\n${[...keep].sort().join('\n')}\n`);
console.log(`${OUT}: ${keep.size} pages (${keep.size - before} new)`);
