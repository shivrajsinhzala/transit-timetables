#!/usr/bin/env node
/**
 * Which stop and interchange pages Google may index (src/lib/indexing.js reads both files):
 *   src/data/indexed-stops.json  { "<cc>/<system>": [code, …] }
 *   src/data/indexed-hubs.json   { "<cc>/<system>": [hub slug, …] }
 *
 * A stop page is indexable when it is a major interchange or people already search for it:
 *   - it serves more distinct routes than MAJOR_STOP_PERCENTILE of its system's stop pages, and
 *     at least MAJOR_STOP_MIN_ROUTES routes (src/lib/indexing.js), or
 *   - Search Console showed it impressions (data/stops-keep.txt, data/index-keep.txt).
 * A hub (an exchange with several bays) is indexable when one of its bays is.
 *
 * Every other stop keeps its page for riders, linked from its routes, with noindex,follow and out of
 * the sitemaps. Before Oct 2026 every stop with 100+ departures a day was indexable: ~22,000 pages
 * of near-identical shape, which is the kind of mass that sank the site on 28 Oct.
 */
import fs from 'node:fs';
import { SYSTEM_INDEX, getStops, busiestDay, MIN_STOP_DEPARTURES, hubs, forget } from '../src/lib/data.js';
import { MAJOR_STOP_PERCENTILE, MAJOR_STOP_MIN_ROUTES } from '../src/lib/indexing.js';

const OUT = 'src/data/indexed-stops.json';
const OUT_HUBS = 'src/data/indexed-hubs.json';

const keep = new Map(); // system key -> Set of codes with Search Console impressions
for (const file of ['data/stops-keep.txt', 'data/index-keep.txt']) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^([a-z]{2}\/[a-z0-9-]+)\/stop\/(.+)$/.exec(line.trim());
    if (m) { if (!keep.has(m[1])) keep.set(m[1], new Set()); keep.get(m[1]).add(decodeURIComponent(m[2])); }
  }
}

const routesServed = (s) => new Set(s.routes.map((r) => r.route)).size;

const out = {};
const outHubs = {};
let pages = 0, major = 0, proven = 0;
for (const { key } of SYSTEM_INDEX) {
  const mine = keep.get(key) || new Set();
  const withPage = getStops(key).filter((s) => busiestDay(s) >= MIN_STOP_DEPARTURES);
  pages += withPage.length;
  // The route count a stop must beat: the system's MAJOR_STOP_PERCENTILE point.
  const counts = withPage.map(routesServed).sort((a, b) => a - b);
  const cut = counts.length ? counts[Math.min(counts.length - 1, Math.floor(counts.length * MAJOR_STOP_PERCENTILE))] : Infinity;
  const floor = Math.max(cut, MAJOR_STOP_MIN_ROUTES);
  const codes = new Set();
  for (const s of withPage) {
    if (routesServed(s) >= floor) { codes.add(s.code); major++; }
    else if (mine.has(s.code)) { codes.add(s.code); proven++; }
  }
  out[key] = [...codes];
  outHubs[key] = hubs(key).filter((h) => h.stops.some((s) => codes.has(s.code))).map((h) => h.slug);
  forget?.(key);
}
fs.writeFileSync(OUT, JSON.stringify(out));
fs.writeFileSync(OUT_HUBS, JSON.stringify(outHubs));
const hubCount = Object.values(outHubs).reduce((a, v) => a + v.length, 0);
console.log(`${OUT}: ${major + proven} of ${pages} stop pages indexable (${major} major interchanges, ${proven} more with Search Console impressions); ${OUT_HUBS}: ${hubCount} hubs`);
