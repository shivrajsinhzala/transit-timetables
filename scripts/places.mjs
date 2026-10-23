/**
 * Which town or suburb a stop is in, from GeoNames' list of populated places (cities500.zip: every
 * place of 500 people or more, CC BY 4.0, fetched into data/raw by scripts/fetch-feeds.mjs).
 * GTFS stops have coordinates but no town, and riders search between towns ("cork to macroom
 * bus", "stawell to horsham"), so the journey pages need one.
 *
 * A stop belongs to the place that is nearest relative to its size. A place's reach grows with
 * its population (about 1 km for a village of 1,000, 2.5 km for a town of 10,000, 6 km for a
 * city of 100,000), so a stop in Swords is Swords and not Dublin, and a stop in central Dublin is
 * Dublin and not a neighbourhood whose centre happens to be 300 m nearer. A stop beyond every
 * place's reach (open country between two villages) belongs to none.
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

export const PLACES_FILE = 'data/raw/geonames-cities500.zip';
const ISO = { uk: 'GB', ca: 'CA', ie: 'IE', au: 'AU', nz: 'NZ', us: 'US' };
// Populated places and their sections; not historical, abandoned or destroyed ones.
const KINDS = new Set(['PPL', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLA5', 'PPLC', 'PPLG', 'PPLL', 'PPLS', 'PPLF', 'PPLX']);
// Council areas, boroughs and city-centre districts listed as places: a stop in central London
// is in London, not "City of Westminster", one in Clondalkin is not in "South Dublin", and
// Montréal's and Québec City's merged boroughs ("Sainte-Foy\u2013Sillery\u2013Cap-Rouge", the only
// names GeoNames writes with a long dash) are not towns anyone searches for.
const NOT_TOWNS = /^(City|Town|District|Municipality|County|Borough) of\b|\b(City Centre|Central Business District|CBD)$|^Downtown$|^(North|South|East|West) Dublin$|[\u2013\u2014]/i;
const CELL = 0.25; // grid cell in degrees: about 28 km north-south
// Even London's reach stops at 12 km: further out, a stop is in Barnet or Loughton, and a page
// saying a bus "arrives in London" when it stops in Barnet would mislead.
const MAX_REACH_KM = 12;
const ACCEPT = 1.25; // a stop up to 1.25 reaches from a place's centre still belongs to it

/** A place's reach in km, from its population. */
export const reach = (pop) => Math.min(MAX_REACH_KM, Math.max(0.8, (Math.max(pop, 500) / 1000) ** 0.4));

export function km(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

let rows = null;
/** Every populated place in the countries the site covers, read once per process. */
function allPlaces() {
  if (rows) return rows;
  rows = new Map(Object.values(ISO).map((c) => [c, []]));
  if (!fs.existsSync(PLACES_FILE)) return rows;
  const text = execFileSync('unzip', ['-p', PLACES_FILE, 'cities500.txt'], { maxBuffer: 1 << 28 }).toString();
  for (const line of text.split('\n')) {
    const f = line.split('\t');
    const list = rows.get(f[8]);
    if (!list || !KINDS.has(f[7]) || NOT_TOWNS.test(f[1])) continue;
    // Other names in Latin script (no airport codes): GeoNames names some Irish towns in Irish
    // ("An Muileann gCearr"), and the stops' own names then say which one riders use ("Mullingar").
    const alt = [...new Set((f[3] || '').split(','))].filter((n) => n !== f[1] && /^[\p{Script=Latin}\s'.-]{3,40}$/u.test(n) && /[a-z]/.test(n));
    list.push({ id: Number(f[0]), name: f[1], alt, lat: Number(f[4]), lon: Number(f[5]), pop: Number(f[14]) || 0, kind: f[7] });
  }
  return rows;
}

const fold = (s) => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * The name riders use for a place: GeoNames' own, unless another of its names turns up more often
 * in the names of the stops in it (and the destinations shown on its buses). Only whole words
 * count, so "Ware" is not found in "Warehouse".
 */
export function localName(place, texts) {
  const hay = ` ${texts.map(fold).join(' | ')} `.replace(/[^a-z0-9|]+/g, ' ');
  const count = (n) => {
    const needle = ` ${fold(n).replace(/[^a-z0-9]+/g, ' ').trim()} `;
    if (needle.trim().length < 3) return 0;
    let c = 0;
    for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) c++;
    return c;
  };
  // A shortening of the name ("Hemel" for Hemel Hempstead, "Blandford" for Blandford Forum) never
  // replaces it: the full name already matches a search for the short one.
  const words = ` ${fold(place.name).replace(/[^a-z0-9]+/g, ' ').trim()} `;
  let best = place.name, most = count(place.name);
  for (const n of place.alt || []) {
    if (words.includes(` ${fold(n).replace(/[^a-z0-9]+/g, ' ').trim()} `)) continue;
    const c = count(n);
    if (c > most) { best = n; most = c; }
  }
  return best;
}

/** True when the place list has been downloaded: without it, no journey pages are built. */
export const havePlaces = () => fs.existsSync(PLACES_FILE);

/**
 * A function from a stop's coordinates to its place ({ id, name, lat, lon, pop }) or null, for
 * one country (the site's code: 'uk', 'ca', ...).
 */
export function placeFinder(cc) {
  const list = allPlaces().get(ISO[cc]) || [];
  const grid = new Map();
  for (const p of list) {
    const k = `${Math.floor(p.lat / CELL)}:${Math.floor(p.lon / CELL)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p);
  }
  const cache = new Map();
  const finder = (lat, lon) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
    const ck = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    if (cache.has(ck)) return cache.get(ck);
    const la = Math.floor(lat / CELL), lo = Math.floor(lon / CELL);
    // Two cells east-west: 25 km even in northern Scotland, where a cell is ~14 km wide.
    const near = [];
    for (let i = -1; i <= 1; i++) {
      for (let j = -2; j <= 2; j++) {
        for (const p of grid.get(`${la + i}:${lo + j}`) || []) near.push({ p, s: km({ lat, lon }, p) / reach(p.pop) });
      }
    }
    near.sort((a, b) => a.s - b.s || b.p.pop - a.p.pop);
    let found = near[0]?.s <= ACCEPT ? near[0].p : null;
    // A district of a city (Docklands, where Melbourne's Southern Cross Station is) gives way to
    // the city when the stop is well inside it: riders search "melbourne to ballarat".
    if (found?.kind === 'PPLX') {
      const city = near.find((x) => x.p.kind !== 'PPLX' && x.p.pop >= 5 * found.pop && x.s <= 0.5);
      if (city) found = city.p;
    }
    cache.set(ck, found);
    return found;
  };
  /** The biggest place within `radius` km: the city an unnamed "Airport Zone 15" stop serves. */
  const biggest = (lat, lon, radius) => {
    const la = Math.floor(lat / CELL), lo = Math.floor(lon / CELL);
    let best = null;
    for (let i = -1; i <= 1; i++) for (let j = -2; j <= 2; j++) for (const p of grid.get(`${la + i}:${lo + j}`) || []) {
      if (p.kind !== 'PPLX' && (!best || p.pop > best.pop) && km({ lat, lon }, p) <= radius) best = p;
    }
    return best;
  };
  return Object.assign(finder, { biggest });
}
