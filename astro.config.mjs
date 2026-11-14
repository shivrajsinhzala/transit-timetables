// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import fs from 'node:fs';
import { minorVariants } from './src/lib/variants.js';
import { indexable } from './src/lib/indexing.js';

import { SITE } from './src/lib/site.js';
export { SITE };

// The site is built in shards (scripts/build-all.mjs): each is its own static deployment, so
// each gets its own output folder and its own folder for scripts, so the router can tell them apart.
const SHARD = process.env.SHARD || 'all';
const sharded = SHARD !== 'all';

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

// Indexable pages only (src/lib/indexing.js decides, the same rule as each page's robots meta).
const pathOf = (page) => page.replace(/^https?:\/\/[^/]+\/?/, '');
const listedPage = (page) => indexable(pathOf(page));

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
    filter: (page) => !/\/(offline|404|embed)$/.test(page) && listedPage(page) && listedRoute(page) && (!sharded || SHARD === 'main' || /^https:\/\/[^/]+\/[a-z]{2}\/[^/]+/.test(page)),
    // No build date: scripts/sitemaps.mjs sets each page's <lastmod> to the date its content last
    // changed (scripts/lastmod.mjs), or its timetable's refresh date.
    serialize(item) { delete item.lastmod; return item; },
  })],
});
