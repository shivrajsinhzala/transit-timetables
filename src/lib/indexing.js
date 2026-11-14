/**
 * Which pages Google may index. The layout (robots meta) and the sitemap filter (astro.config.mjs)
 * both ask `indexable(path)`, so a page can never be indexable in one and not the other.
 *
 * Why so few: on 28 Oct 2026 Google dropped almost the whole site after ~220,000 template pages
 * appeared on a four-week-old host (Phase 1 report). The relaunch offers Google a smaller set of
 * pages that each carry something specific: every country, system and route page with real
 * service, the interchanges, and the deep pages people already search for. Everything else keeps
 * its page and its links for riders, with noindex,follow, and stays out of the sitemaps.
 *
 *   home, about, privacy, country, system   always
 *   route                                    ROUTE_MIN_WEEKLY_TRIPS+ trips a week, or proven demand
 *   stop                                     src/data/indexed-stops.json (scripts/indexed-stops.mjs):
 *                                            the top (1 - MAJOR_STOP_PERCENTILE) of each system's stops
 *                                            by routes served, with MAJOR_STOP_MIN_ROUTES+, or proven
 *   hub (interchange)                        when one of its bays is a major stop, or proven
 *   town to town                             proven demand AND enough service (journey.js indexedPair)
 *   town ("from" list)                       never: a list of links, nothing to quote
 *
 * "Proven demand" is data/index-keep.txt: pages Search Console showed impressions for
 * (scripts/index-keep.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { keptPage } from './data.js';
import { indexedPair } from './journey.js';

/** Routes with fewer trips a week than this (school specials, one-a-week shoppers) are noindex. */
export const ROUTE_MIN_WEEKLY_TRIPS = 10;
/** A stop is a major interchange when it serves more routes than this share of its system's stops. */
export const MAJOR_STOP_PERCENTILE = 0.98;
/** ...and at least this many routes, so a small town's "busiest" stop with two routes is not one. */
export const MAJOR_STOP_MIN_ROUTES = 3;

const ROOT = process.cwd();
const cache = new Map();
const memo = (k, f) => (cache.has(k) ? cache.get(k) : (cache.set(k, f()), cache.get(k)));
const readJson = (rel) => {
  const file = path.join(ROOT, rel);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
};

/** Trips a week on a route, from its summary: each of the route's own day groups ("mon-fri",
 * "sat") times the days it covers. The system's day types are per calendar day and do not match. */
export function weeklyTrips(system, route) {
  let n = 0;
  for (const d of route.days || []) n += (route.summary?.[d.key]?.trips || 0) * (d.days?.length || 1);
  return n;
}

/** Slugs of a system's routes with enough service to index. Only the slugs are kept in memory. */
function servedRoutes(key) {
  return memo(`routes:${key}`, () => {
    const s = readJson(`src/data/systems/${key}.json`);
    return new Set(s ? s.routes.filter((r) => weeklyTrips(s, r) >= ROUTE_MIN_WEEKLY_TRIPS).map((r) => r.slug) : []);
  });
}

function majorStops() {
  return memo('stops', () => {
    const j = readJson('src/data/indexed-stops.json');
    return j ? Object.fromEntries(Object.entries(j).map(([k, v]) => [k, new Set(v)])) : {};
  });
}
export const isMajorStop = (key, code) => Boolean(majorStops()[key]?.has(String(code)));

/** Town pairs with enough service, as "a/b" slugs. */
function servedPairs(key) {
  return memo(`pairs:${key}`, () => {
    const j = readJson(`src/data/journeys/${key}.json`);
    return new Set(j ? j.pairs.filter(indexedPair).map((p) => `${j.places[p.a].slug}/${j.places[p.b].slug}`) : []);
  });
}

/** Hubs that hold a major stop, as slugs (scripts/indexed-stops.mjs writes them beside the stops). */
function majorHubs() {
  return memo('hubs', () => {
    const j = readJson('src/data/indexed-hubs.json');
    return j ? Object.fromEntries(Object.entries(j).map(([k, v]) => [k, new Set(v)])) : {};
  });
}

/**
 * Whether Google may index the page at `pagePath` (no leading slash, '' for the homepage).
 * Pages that are never for search (404, offline, embed) pass noindex to the layout themselves.
 */
export function indexable(pagePath) {
  const parts = pagePath.split('/').filter(Boolean);
  if (parts.length <= 2) return true; // home, about, privacy, country, system
  const key = `${parts[0]}/${parts[1]}`;
  const kept = keptPage(parts.map(decodeURIComponent).join('/')) === true;
  const kind = parts[2];
  if (kind === 'stop') return kept || isMajorStop(key, decodeURIComponent(parts[3] || ''));
  if (kind === 'hub') return kept || Boolean(majorHubs()[key]?.has(parts[3]));
  if (kind === 'from') {
    if (parts.length === 4) return false; // town page: a list of links
    return kept && servedPairs(key).has(`${parts[3]}/${parts[5]}`);
  }
  if (parts.length === 3) return kept || servedRoutes(key).has(kind); // route
  return false;
}
