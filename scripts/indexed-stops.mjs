#!/usr/bin/env node
/**
 * Which stop pages Google should index: src/data/indexed-stops.json, { "<cc>/<system>": [code, …] }.
 *
 * About 170,000 stops have a page (20+ departures on their busiest day), and on 22 Oct 2026 Google
 * had indexed ~13,000 of the site's ~221,000 pages while spending ~90% of its crawl on stop pages:
 * route and town-to-town pages, what people actually search for, waited behind them (Melbourne's
 * tram 96 and 19 were "unknown to Google"). So only the busiest stops are indexable:
 *   - MIN_DEPARTURES or more departures on their busiest day (~22,000 stops), and
 *   - every stop page already in Google's results (data/stops-keep.txt, from Search Console).
 * Every other stop page stays on the site, linked from its routes, with <meta name="robots"
 * content="noindex"> and out of the sitemaps. Without this file, every stop page is indexable.
 */
import fs from 'node:fs';
import { SYSTEM_INDEX, getStops, busiestDay, MIN_STOP_DEPARTURES } from '../src/lib/data.js';

const MIN_DEPARTURES = 100;
const OUT = 'src/data/indexed-stops.json';

const keep = new Map(); // system key -> Set of codes
for (const line of fs.readFileSync('data/stops-keep.txt', 'utf8').split('\n')) {
  const m = /^([a-z]{2}\/[a-z0-9-]+)\/stop\/(.+)$/.exec(line.trim());
  if (m) { if (!keep.has(m[1])) keep.set(m[1], new Set()); keep.get(m[1]).add(decodeURIComponent(m[2])); }
}

const out = {};
let pages = 0, indexed = 0;
for (const { key } of SYSTEM_INDEX) {
  const mine = keep.get(key) || new Set();
  const codes = [];
  for (const s of getStops(key)) {
    const busiest = busiestDay(s);
    if (busiest < MIN_STOP_DEPARTURES) continue; // no page at all
    pages++;
    if (busiest >= MIN_DEPARTURES || mine.has(s.code)) codes.push(s.code);
  }
  out[key] = codes;
  indexed += codes.length;
}
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`${OUT}: ${indexed} of ${pages} stop pages indexable (${MIN_DEPARTURES}+ departures, or already in Google)`);
