/** Build-time access to the JSON scripts/build-data.mjs writes, and what pages derive from it. */
import index from '../data/index.json';
import { REGIONS } from '../../data/systems.mjs';
import { place, slugify } from './format.js';

const systems = import.meta.glob('../data/systems/*.json', { eager: true, import: 'default' });
const stops = import.meta.glob('../data/stops/*.json', { eager: true, import: 'default' });

export const REGION = { slug: 'bc', name: 'British Columbia' };
export const SYSTEM_INDEX = index;
export { REGIONS };

export function getSystem(slug) {
  return systems[`../data/systems/${slug}.json`];
}

export function getStops(slug) {
  return stops[`../data/stops/${slug}.json`] || [];
}

export function allSystems() {
  return index.map((s) => getSystem(s.slug)).filter(Boolean);
}

/**
 * Stops that get a page: at least MIN_STOP_DEPARTURES buses on their busiest day. Below that a
 * page is two or three times and little else, thin enough to do the site more harm than good.
 */
export const MIN_STOP_DEPARTURES = 20;

export function busiestDay(stop) {
  const perDay = {};
  for (const r of stop.routes) for (const [k, v] of Object.entries(r.times)) perDay[k] = (perDay[k] || 0) + v.length;
  return Math.max(0, ...Object.values(perDay));
}

const cache = new Map();
const memo = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };

export function pageStops(slug) {
  return memo(`stops:${slug}`, () => getStops(slug).filter((s) => busiestDay(s) >= MIN_STOP_DEPARTURES));
}

export function stopPageCodes(slug) {
  return memo(`codes:${slug}`, () => new Set(pageStops(slug).map((s) => s.code)));
}

/**
 * Hubs: places with several boarding bays ("Orchard Park Exchange Bay A" … "Bay G"). Riders
 * search for the exchange, not the bay, so each gets one page listing every bay and route.
 */
export function hubs(slug) {
  return memo(`hubs:${slug}`, () => {
    const groups = new Map();
    for (const s of pageStops(slug)) {
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

export function hubOf(slug, stop) {
  const p = place(stop.name);
  return hubs(slug).find((h) => h.name === p) || null;
}

function metres(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** The closest other stop pages, within a 10-minute walk. */
export function nearby(slug, stop, limit = 6) {
  if (!stop.lat) return [];
  return pageStops(slug)
    .filter((s) => s.code !== stop.code && s.lat)
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
