// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import fs from 'node:fs';
import { minorVariants } from './src/lib/variants.js';

export const SITE = 'https://transit.shivrajsinh.in';

// The site is built in shards (scripts/build-all.mjs): each is its own static deployment, so
// each gets its own output folder and its own folder for scripts, so the router can tell them apart.
const SHARD = process.env.SHARD || 'all';
const sharded = SHARD !== 'all';

// Stop pages Google should index (scripts/indexed-stops.mjs); the others are noindex and left out
// of the sitemaps. No file: every stop page is listed.
const INDEXED = fs.existsSync('src/data/indexed-stops.json') ? JSON.parse(fs.readFileSync('src/data/indexed-stops.json', 'utf8')) : null;
const indexedSets = INDEXED && Object.fromEntries(Object.entries(INDEXED).map(([k, v]) => [k, new Set(v)]));
const listedStop = (page) => {
  const m = /^https:\/\/[^/]+\/([a-z]{2}\/[^/]+)\/stop\/([^/]+)$/.exec(page);
  return !m || !indexedSets || Boolean(indexedSets[m[1]]?.has(decodeURIComponent(m[2])));
};

// Minor route variants ("7S" next to "7") name their main route as canonical (src/lib/variants.js),
// so they are left out too. Only the slugs are kept, not the system's timetables.
const variantSlugs = new Map();
const listedRoute = (page) => {
  const m = /^https:\/\/[^/]+\/([a-z]{2})\/([^/]+)\/(route-[^/]+)$/.exec(page);
  if (!m) return true;
  const key = `${m[1]}/${m[2]}`;
  if (!variantSlugs.has(key)) {
    const file = `src/data/systems/${key}.json`;
    variantSlugs.set(key, fs.existsSync(file) ? new Set(minorVariants(JSON.parse(fs.readFileSync(file, 'utf8')).routes).keys()) : new Set());
  }
  return !variantSlugs.get(key).has(m[3]);
};

export default defineConfig({
  site: SITE,
  // `/ca/kelowna/route-8` is served from `route-8.html` with no redirect hop (Workers static
  // assets' default html_handling), the same reason gsrtc-landing uses the file format.
  trailingSlash: 'never',
  // Inlined: one ~20 KB stylesheet per page beats a render-blocking request on a phone signal
  // (Lighthouse put route pages' first paint at 4.9 s with the external file).
  build: { format: 'file', inlineStylesheets: 'always', ...(sharded ? { assets: `_a/${SHARD}` } : {}) },
  ...(sharded ? { outDir: `./dist/${SHARD}` } : {}),
  integrations: [sitemap({
    // Each shard lists only its own pages: every shard also builds the home and about pages
    // (Astro builds every static page), but they are served from main.
    filter: (page) => !/\/(offline|404|embed)$/.test(page) && listedStop(page) && listedRoute(page) && (!sharded || SHARD === 'main' || /^https:\/\/[^/]+\/[a-z]{2}\/[^/]+/.test(page)),
    // Pages change when the timetable data is rebuilt (dates, the next four weeks), so the
    // build date is their true last-modified date.
    serialize(item) { item.lastmod = new Date().toISOString().slice(0, 10); return item; },
  })],
});
