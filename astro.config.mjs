// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export const SITE = 'https://transit.shivrajsinh.in';

export default defineConfig({
  site: SITE,
  // `/bc/kelowna/route-8` is served from `route-8.html` with no redirect hop (Workers static
  // assets' default html_handling), the same reason gsrtc-landing uses the file format.
  trailingSlash: 'never',
  // Inlined: one ~20 KB stylesheet per page beats a render-blocking request on a phone signal
  // (Lighthouse put route pages' first paint at 4.9 s with the external file).
  build: { format: 'file', inlineStylesheets: 'always' },
  integrations: [sitemap({
    filter: (page) => !/\/(offline|404)$/.test(page),
    // Pages change when the timetable data is rebuilt (dates, the next four weeks), so the
    // build date is their true last-modified date.
    serialize(item) { item.lastmod = new Date().toISOString().slice(0, 10); return item; },
  })],
});
