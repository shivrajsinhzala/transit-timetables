#!/usr/bin/env node
/**
 * Copies MapLibre's own ESM build into public/vendor/maplibre-<version>/ unbundled.
 * MapLibre finds its web worker (and the chunk the worker shares) next to its own file via
 * import.meta.url; once Vite bundles it into /_astro/ under a hashed name, that lookup 404s.
 * Served as-is from a versioned folder, the files find each other and can be cached forever.
 */
import fs from 'node:fs';
import path from 'node:path';

const pkg = JSON.parse(fs.readFileSync('node_modules/maplibre-gl/package.json', 'utf8'));
// Bump REV to rename the folder when files already served must be fetched afresh: browsers and
// Cloudflare keep them a year as immutable. Rev 2: nginx had sent the .mjs files as
// application/octet-stream, which browsers refuse to run as modules, so no map loaded (Oct 2026).
const REV = 2;
const dir = `maplibre-${pkg.version}-${REV}`;
const out = `public/vendor/${dir}`;
fs.rmSync('public/vendor', { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of ['maplibre-gl.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl-worker.mjs', 'maplibre-gl.css']) {
  fs.copyFileSync(path.join('node_modules/maplibre-gl/dist', f), path.join(out, f));
}
fs.writeFileSync('src/data/vendor.json', JSON.stringify({ maplibre: `/vendor/${dir}` }));
console.log(`maplibre ${pkg.version} -> ${out}`);
