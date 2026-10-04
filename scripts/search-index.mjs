/**
 * Search and "near me" data, written to public/ for the main shard:
 * - search/index.json: every country, system, route and hub (small enough for one download);
 * - search/<cc>/<system>.json: that system's stops, loaded when a rider searches on its pages;
 * - near/<y>_<x>.json: stops in quarter-degree tiles, so "near me" reads only nine small files.
 * Rows are arrays to stay small: [type, name, sub, url, lat, lon, color, routeNumber]
 * with type 0 town or country, 1 route, 2 hub, 3 stop.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SYSTEM_INDEX, countries, getSystem, pageStops, hubs, forget } from '../src/lib/data.js';
import { plain, routeLabel } from '../src/lib/format.js';

const OUT = 'public';
const r4 = (n) => (n ? Math.round(n * 1e4) / 1e4 : 0);
const TILE = 4;
fs.rmSync(path.join(OUT, 'search'), { recursive: true, force: true });
fs.rmSync(path.join(OUT, 'near'), { recursive: true, force: true });

const items = [];
const tiles = new Map();
for (const c of countries()) items.push([0, c.name, `${c.systems.length} transit systems`, `/${c.cc}`]);
for (const meta of SYSTEM_INDEX) {
  const s = getSystem(meta.key);
  const base = `/${meta.key}`;
  const country = countries().find((c) => c.cc === meta.cc)?.name;
  items.push([0, s.name, `${s.routes.length} routes · ${s.area} · ${country}`, base]);
  for (const r of s.routes) {
    const label = routeLabel(r);
    const name = plain(r.name);
    items.push([1, r.short && !name.toLowerCase().includes(label.toLowerCase()) ? `${label} ${name}` : label === name ? label : `${label} ${name}`.trim(), s.name, `${base}/${r.slug}`, 0, 0, r.color || '', r.short || '']);
  }
  for (const h of hubs(meta.key)) items.push([2, plain(h.name), `${s.name} interchange`, `${base}/hub/${h.slug}`, r4(h.stops[0].lat), r4(h.stops[0].lon)]);
  const stops = pageStops(meta.key).map((st) => [3, plain(st.name), `${s.name} · ${st.code}`, `${base}/stop/${encodeURIComponent(st.code)}`, r4(st.lat), r4(st.lon)]);
  fs.mkdirSync(path.join(OUT, 'search', meta.cc), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'search', meta.cc, `${meta.slug}.json`), JSON.stringify(stops));
  for (const st of stops) {
    if (!st[4]) continue;
    const k = `${Math.floor(st[4] * TILE)}_${Math.floor(st[5] * TILE)}`;
    if (!tiles.has(k)) tiles.set(k, []);
    tiles.get(k).push(st);
  }
  forget(meta.key);
}
fs.mkdirSync(path.join(OUT, 'near'), { recursive: true });
for (const [k, list] of tiles) fs.writeFileSync(path.join(OUT, 'near', `${k}.json`), JSON.stringify(list));
fs.writeFileSync(path.join(OUT, 'search', 'index.json'), JSON.stringify({ v: 2, systems: SYSTEM_INDEX.map((s) => s.key), tiles: [...tiles.keys()], items }));
const size = fs.statSync(path.join(OUT, 'search', 'index.json')).size;
console.log(`search: ${items.length} items (${Math.round(size / 1024)} KB), ${SYSTEM_INDEX.length} stop files, ${tiles.size} near tiles (largest ${Math.max(...[...tiles.values()].map((l) => l.length))} stops)`);
