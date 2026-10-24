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
import { minorVariants } from './variants.js';

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

/**
 * A system's busiest routes, by trips on their busiest day type: what the homepage and country
 * pages link to directly, so search engines reach the route pages riders look for in one hop.
 */
export function busiestRoutes(key, n = 6) {
  const sys = getSystem(key);
  if (!sys) return [];
  const trips = (r) => Math.max(0, ...Object.values(r.summary || {}).map((s) => s.trips || 0));
  return [...sys.routes].sort((a, b) => trips(b) - trips(a)).slice(0, n).map((route) => ({ route, url: `/${key}/${route.slug}` }));
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

/**
 * Whether a stop page is for Google (scripts/indexed-stops.mjs): the busiest stops, and those
 * already in its results. The rest are noindex and out of the sitemaps. No list: all of them.
 */
export function isIndexedStop(key, code) {
  const all = memo('indexed-stops', () => {
    const file = path.join(ROOT, 'src/data/indexed-stops.json');
    return fs.existsSync(file) ? Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(file, 'utf8'))).map(([k, v]) => [k, new Set(v)])) : null;
  });
  return !all || Boolean(all[key]?.has(code));
}

export function stopPageCodes(key) {
  return memo(`codes:${key}`, () => new Set(pageStops(key).map((s) => s.code)));
}

/**
 * Stop pages that get a link from other pages: those Google may index. Noindex keeps a page out of
 * results, not out of the crawl: with every route linking its quiet stops, Googlebot fetched
 * 320-350 noindex stop pages a day and 25-47 route pages (server log, 22-24 Oct 2026), and only
 * ~1,000 of ~9,400 route and network pages were indexed. Quiet stops keep their pages, reachable
 * from search and near me; their names show as plain text elsewhere.
 */
export function linkedStopCodes(key) {
  return memo(`linked:${key}`, () => new Set(pageStops(key).filter((s) => isIndexedStop(key, s.code)).map((s) => s.code)));
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

/**
 * Town-to-town journeys (scripts/journeys.mjs): { places, pairs, stops }, or null when the data
 * was built without the place list. Each pair gets a page at /<cc>/<system>/from/<a>/to/<b>, and
 * each place with journeys a page at /<cc>/<system>/from/<a> listing them.
 */
export function getJourneys(key) {
  return memo(`jour:${key}`, () => {
    const [cc, slug] = key.split('/');
    const file = `src/data/journeys/${cc}/${slug}.json`;
    if (!fs.existsSync(path.join(ROOT, file))) return null;
    const j = read(file);
    const sys = getSystem(key);
    // A route that is no longer in the timetable takes its journeys with it.
    const live = new Set(sys?.routes.map((r) => r.slug) || []);
    j.pairs = j.pairs.filter((p) => p.routes.every((r) => live.has(r)));
    // No page shows a long dash (scripts/verify-build.mjs): a place name with one reads with a hyphen.
    for (const p of j.places) p.name = plain(p.name);
    j.from = j.places.map(() => []);
    j.to = j.places.map(() => []);
    for (const p of j.pairs) { j.from[p.a].push(p); j.to[p.b].push(p); }
    return j;
  });
}

export const journeyUrl = (key, j, p) => `/${key}/from/${j.places[p.a].slug}/to/${j.places[p.b].slug}`;
export const fromUrl = (key, j, i) => `/${key}/from/${j.places[i].slug}`;

/** Departures on a pair's busiest weekday: how pairs and places are ranked on the pages. */
export function pairDaily(p) {
  let best = 0;
  for (let w = 0; w < 7; w++) {
    const d = p.days.find((x) => x.days.includes(w));
    if (!d) continue;
    const n = p.trips[d.key].filter((r) => !r[5] || r[5].includes(w)).length;
    if (n > best) best = n;
  }
  return best;
}

/** Places with a "from" page: every place a journey leaves from, busiest first. */
export function journeyPlaces(key) {
  return memo(`jplaces:${key}`, () => {
    const j = getJourneys(key);
    if (!j) return [];
    return j.places.map((p, i) => ({ ...p, i, out: j.from[i], in: j.to[i], daily: j.from[i].reduce((n, x) => n + pairDaily(x), 0) }))
      .filter((p) => p.out.length)
      .sort((a, b) => b.daily - a.daily || b.pop - a.pop);
  });
}

/** Number of journey pages (pairs and places) a system builds: the shard planner counts them. */
export function journeyPageCount(key) {
  const j = getJourneys(key);
  return j ? j.pairs.length + journeyPlaces(key).length : 0;
}

/** The journeys a route serves, most departures first: the route page links the top few. */
export function routeJourneys(key, slug, n = 8) {
  const j = getJourneys(key);
  if (!j) return [];
  return j.pairs.filter((p) => p.routes.includes(slug)).sort((a, b) => pairDaily(b) - pairDaily(a) || b.km - a.km).slice(0, n)
    .map((p) => ({ p, url: journeyUrl(key, j, p), from: j.places[p.a], to: j.places[p.b] }));
}

/**
 * The two towns a route runs between, as riders name them ("Heckmondwike", "Leeds"): the ends of
 * its longest town-to-town journey. Null without journey data. Titles and headings use it when the
 * feed gives the route no name, because riders search "201 bus timetable leeds".
 */
export function routeEnds(key, slug) {
  const j = getJourneys(key);
  if (!j) return null;
  let best = null;
  for (const p of j.pairs) if (p.routes.includes(slug) && (!best || p.km > best.km || (p.km === best.km && pairDaily(p) > pairDaily(best)))) best = p;
  return best ? { from: j.places[best.a].name, to: j.places[best.b].name } : null;
}

/** The main route a minor variant defers to ("7S" to "7", src/lib/variants.js), or null. */
export function mainRouteOf(key, slug) {
  return memo(`variants:${key}`, () => minorVariants(getSystem(key).routes)).get(slug) || null;
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
