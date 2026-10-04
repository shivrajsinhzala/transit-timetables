/**
 * Build-time access to the JSON scripts/build-data.mjs writes, and what pages derive from it.
 *
 * The site is built in shards (scripts/shards.mjs): each shard is its own static deployment of at
 * most ~18k files, and `SHARD` says which one is being built. Systems are read from disk only when
 * that shard needs them, so a build never holds the whole world in memory. With no shard plan
 * (local dev) everything is built.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SYSTEMS, COUNTRIES, GROUPS } from '../../data/systems.mjs';
import { place, slugify, plain, baseType } from './format.js';

const ROOT = process.cwd();
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

export { COUNTRIES, GROUPS };
export const META = Object.fromEntries(SYSTEMS.map((s) => [`${s.cc}/${s.slug}`, s]));
/** What the registry says about a system wins over what was built: names and credits change without a rebuild. */
const fromMeta = (key) => {
  const m = META[key] || {};
  return { name: m.name, area: m.area, region: m.region, group: m.group || null, attribution: m.attribution, tram: m.tram };
};
export const SYSTEM_INDEX = (fs.existsSync(path.join(ROOT, 'src/data/index.json')) ? read('src/data/index.json') : [])
  .filter((s) => META[s.key])
  .map((s) => ({ ...s, ...fromMeta(s.key) }));

const PLAN = fs.existsSync(path.join(ROOT, 'src/data/shards.json')) ? read('src/data/shards.json') : null;
export const SHARD = process.env.SHARD || 'all';

/** FNV-1a: which bucket a stop of a split system lives in. The router (worker/router.js) uses the same hash. */
export function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}
/** Is this system's own pages (index, routes, hubs) built in the current shard? */
export const inShard = (key) => SHARD === 'all' || !PLAN || PLAN.systems[key] === SHARD;
/** The shard a stop page is built in: its system's, or for a split system, its hash bucket's. */
export const stopShard = (key, code) => {
  const split = PLAN?.split?.[key];
  return split ? split[fnv(String(code)) % split.length] : PLAN?.systems[key];
};
export const stopInShard = (key, code) => SHARD === 'all' || !PLAN || stopShard(key, code) === SHARD;
/** Does the current shard build any stop pages of this system? */
export const hasStopsInShard = (key) => SHARD === 'all' || !PLAN || PLAN.systems[key] === SHARD || (PLAN.split?.[key] || []).includes(SHARD);
/** Are the global pages (home, countries, about) built in the current shard? */
export const isMain = SHARD === 'all' || SHARD === 'main' || !PLAN;

/** Countries that have at least one built system, in COUNTRIES order. */
export function countries() {
  return Object.entries(COUNTRIES)
    .map(([cc, c]) => ({ cc, ...c, systems: SYSTEM_INDEX.filter((s) => s.cc === cc) }))
    .filter((c) => c.systems.length);
}

export const country = (cc) => ({ cc, ...COUNTRIES[cc] });

const cache = new Map();
const memo = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };
/** Drop one system's cached data (scripts that walk every system keep memory flat with this). */
export const forget = (key) => { for (const k of [...cache.keys()]) if (k.endsWith(`:${key}`)) cache.delete(k); };

export function getSystem(key) {
  return memo(`sys:${key}`, () => {
    const [cc, slug] = key.split('/');
    const file = `src/data/systems/${cc}/${slug}.json`;
    if (!fs.existsSync(path.join(ROOT, file))) return null;
    const sys = { ...read(file), ...fromMeta(key) };
    // A "change" on the first day of the window is just the window starting: not news.
    if (sys.changesOn && sys.changesOn <= sys.builtOn) sys.changesOn = null;
    // Route numbers several routes share (Irish Rail's "Commuter", V/Line's "Ballarat") cannot
    // name a page on their own: those routes are labelled by their long name instead.
    const count = {};
    for (const r of sys.routes) if (r.short) count[r.short] = (count[r.short] || 0) + 1;
    for (const r of sys.routes) {
      if (r.short && count[r.short] > 1 && r.name) r.label = plain(r.name).replace(/\s+-\s+/g, ' to ');
      else if (!r.short && [2].includes(baseType(r.type))) r.label = plain(r.name).replace(/\s+-\s+/g, ' to ');
    }
    return sys;
  });
}

export function getStops(key) {
  return memo(`stops:${key}`, () => {
    const [cc, slug] = key.split('/');
    const file = `src/data/stops/${cc}/${slug}.json`;
    return fs.existsSync(path.join(ROOT, file)) ? mergeCodes(read(file)) : [];
  });
}

/**
 * Some feeds give one stop number to several platforms (Luas, Phoenix, Dunedin): riders see one
 * number on the sign, so they get one page, with every route that calls at any of them.
 */
function mergeCodes(stops) {
  const byCode = new Map();
  for (const s of stops) {
    const have = byCode.get(s.code);
    if (!have) { byCode.set(s.code, s); continue; }
    for (const r of s.routes) {
      const same = have.routes.find((x) => x.route === r.route && x.headsign === r.headsign);
      if (!same) { have.routes.push(r); continue; }
      for (const [k, v] of Object.entries(r.times)) same.times[k] = [...new Set([...(same.times[k] || []), ...v])].sort((a, b) => a - b);
      for (const d of r.days) if (!same.days.some((x) => x.key === d.key)) same.days.push(d);
    }
  }
  return [...byCode.values()];
}

/** Systems whose own pages (index, routes, hubs) this shard builds. */
export function shardSystems() {
  return SYSTEM_INDEX.filter((s) => inShard(s.key)).map((s) => getSystem(s.key)).filter(Boolean);
}

/** Systems with at least one stop page in this shard. */
export function stopSystems() {
  return SYSTEM_INDEX.filter((s) => hasStopsInShard(s.key)).map((s) => getSystem(s.key)).filter(Boolean);
}

/**
 * Stops that get a page: at least MIN_STOP_DEPARTURES departures on their busiest day. Below that
 * a page is two or three times and little else, thin enough to do the site more harm than good.
 */
export const MIN_STOP_DEPARTURES = 20;

export function busiestDay(stop) {
  const perDay = {};
  for (const r of stop.routes) for (const [k, v] of Object.entries(r.times)) perDay[k] = (perDay[k] || 0) + v.length;
  return Math.max(0, ...Object.values(perDay));
}

export function pageStops(key) {
  return memo(`pstops:${key}`, () => getStops(key).filter((s) => busiestDay(s) >= MIN_STOP_DEPARTURES));
}

export function stopPageCodes(key) {
  return memo(`codes:${key}`, () => new Set(pageStops(key).map((s) => s.code)));
}

/**
 * Hubs: places with several boarding bays ("Orchard Park Exchange Bay A" … "Bay G"). Riders
 * search for the exchange, not the bay, so each gets one page listing every bay and route.
 */
export function hubs(key) {
  return memo(`hubs:${key}`, () => {
    const groups = new Map();
    for (const s of pageStops(key)) {
      const p = place(s.name);
      if (p === s.name) continue;
      if (!groups.has(p)) groups.set(p, []);
      groups.get(p).push(s);
    }
    return [...groups.entries()]
      .filter(([, list]) => list.length >= 2)
      .map(([name, list]) => ({ name, slug: slugify(name), stops: list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })) }))
      .sort((a, b) => b.stops.length - a.stops.length);
  });
}

export function hubOf(key, stop) {
  const p = place(stop.name);
  return hubs(key).find((h) => h.name === p) || null;
}

function metres(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** The closest other stop pages, within a 10-minute walk (grid-bucketed: big systems have 20k stops). */
export function nearby(key, stop, limit = 6) {
  if (!stop.lat) return [];
  const grid = memo(`grid:${key}`, () => {
    const g = new Map();
    for (const s of pageStops(key)) {
      if (!s.lat) continue;
      const k = `${Math.floor(s.lat * 100)}:${Math.floor(s.lon * 100)}`;
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(s);
    }
    return g;
  });
  const la = Math.floor(stop.lat * 100), lo = Math.floor(stop.lon * 100);
  const cand = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) cand.push(...(grid.get(`${la + i}:${lo + j}`) || []));
  return cand
    .filter((s) => s.code !== stop.code)
    .map((s) => ({ stop: s, m: metres(stop, s) }))
    .filter((x) => x.m <= 800)
    .sort((a, b) => a.m - b.m)
    .slice(0, limit);
}

/** Every route that calls at a stop, with its colour, for badges. */
export function routeBadges(system, stop) {
  const seen = new Map();
  for (const r of stop.routes) if (!seen.has(r.route)) seen.set(r.route, system.routes.find((x) => x.slug === r.route));
  return [...seen.values()].filter(Boolean);
}

/** URL helpers: every page lives under /<country>/<system>/. */
export const sysUrl = (s) => `/${s.cc}/${s.slug}`;

/** Systems in a country, from the index (no system files read). */
export const systemsIn = (cc) => SYSTEM_INDEX.filter((s) => s.cc === cc);

/** Region and group names for a system's breadcrumbs and country page. */
export function regionOf(s) {
  const c = COUNTRIES[s.cc];
  return { name: c.regions[s.region] || c.name, slug: s.region, group: s.group ? GROUPS[s.group] : null };
}
