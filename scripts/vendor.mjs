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
const out = `public/vendor/maplibre-${pkg.version}`;
fs.rmSync('public/vendor', { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of ['maplibre-gl.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl-worker.mjs', 'maplibre-gl.css']) {
  fs.copyFileSync(path.join('node_modules/maplibre-gl/dist', f), path.join(out, f));
}
fs.writeFileSync('src/data/vendor.json', JSON.stringify({ maplibre: `/vendor/maplibre-${pkg.version}` }));
console.log(`maplibre ${pkg.version} -> ${out}`);
