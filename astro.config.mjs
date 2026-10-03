// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export const SITE = 'https://transit.shivrajsinh.in';

export default defineConfig({
  site: SITE,
  // `/bc/kelowna/route-8` is served from `route-8.html` with no redirect hop (Workers static
  // assets' default html_handling), the same reason gsrtc-landing uses the file format.
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [sitemap()],
});
