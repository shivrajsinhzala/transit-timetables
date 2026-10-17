/**
 * Splits the site into shards that each fit one Cloudflare Workers static deployment (20,000
 * files per version). Every system's pages and map data stay together in one shard, except a
 * system too big for that (Melbourne's 700 bus routes): its stop pages are spread over several
 * shards by a hash of the stop number, which the router (worker/router.js) computes the same way.
 *
 * Writes src/data/shards.json, read by src/lib/data.js at build time and by the router.
 */
import fs from 'node:fs';
import { SYSTEM_INDEX, getSystem, pageStops, hubs, forget, journeyPageCount } from '../src/lib/data.js';

const CAPACITY = 17_500; // pages + map files per shard, leaving room for scripts, 404 and headers
const SPLIT_OVER = 12_000; // a system bigger than this has its stop pages spread out
const BUCKET = 7_000; // at most this many stop pages per bucket

const items = [];
for (const meta of SYSTEM_INDEX) {
  const s = getSystem(meta.key);
  const routes = s.routes.length;
  const stops = pageStops(meta.key).length;
  const hubCount = hubs(meta.key).length;
  const core = 1 + routes + hubCount + (routes + 1) + journeyPageCount(meta.key); // index, routes, hubs, map files, town-to-town pages
  if (core + stops <= SPLIT_OVER) items.push({ key: meta.key, size: core + stops });
  else {
    const n = Math.ceil(stops / BUCKET);
    items.push({ key: meta.key, size: core, core: true });
    for (let b = 0; b < n; b++) items.push({ key: meta.key, size: Math.ceil(stops / n), bucket: b, of: n });
  }
  forget(meta.key);
}

// Sticky: a system stays in the shard it was in last week while it still fits there. Shards
// are deployed one after another and the router last, so a system that moves is briefly
// unreachable; keeping moves rare keeps the weekly refresh invisible. The rest go first fit,
// biggest first, ties broken by key so the same data always gives the same plan.
items.sort((a, b) => b.size - a.size || a.key.localeCompare(b.key) || (a.bucket ?? -1) - (b.bucket ?? -1));
const prev = fs.existsSync('src/data/shards.json') ? JSON.parse(fs.readFileSync('src/data/shards.json', 'utf8')) : null;
const shards = (prev?.shards || []).map((id) => ({ id, size: 0, items: [] }));
const fits = (sh, it) => sh.size + it.size <= CAPACITY && !(it.bucket != null && sh.items.some((y) => y.key === it.key && y.bucket != null));
const put = (sh, it) => { sh.size += it.size; sh.items.push(it); };
const rest = [];
for (const it of items) {
  const was = it.bucket == null ? prev?.systems?.[it.key] : prev?.split?.[it.key]?.length === it.of ? prev.split[it.key][it.bucket] : null;
  const sh = was && shards.find((x) => x.id === was);
  if (sh && fits(sh, it)) put(sh, it); else rest.push(it);
}
let next = shards.length;
for (const it of rest) {
  let sh = shards.find((x) => fits(x, it));
  if (!sh) shards.push(sh = { id: `s${++next}`, size: 0, items: [] });
  put(sh, it);
}
const moved = rest.filter((it) => prev && (it.bucket == null ? prev.systems?.[it.key] : prev.split?.[it.key])).map((it) => it.key);
if (moved.length) console.log(`moved between shards: ${[...new Set(moved)].join(', ')}`);

const plan = { generated: new Date().toISOString(), shards: shards.filter((s) => s.items.length).map((s) => s.id), systems: {}, split: {}, sizes: {} };
for (const sh of shards) {
  plan.sizes[sh.id] = sh.size;
  for (const it of sh.items) {
    if (it.bucket == null) plan.systems[it.key] = sh.id;
    else (plan.split[it.key] ||= Array(it.of))[it.bucket] = sh.id;
  }
}
fs.writeFileSync('src/data/shards.json', JSON.stringify(plan, null, 1));
console.log(`${shards.length} shards: ${shards.map((s) => `${s.id} ${s.size} (${s.items.length})`).join(', ')}; split: ${Object.keys(plan.split).join(', ') || 'none'}`);
