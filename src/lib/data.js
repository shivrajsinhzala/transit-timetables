/** Build-time access to the JSON scripts/build-data.mjs writes. */
import index from '../data/index.json';

const systems = import.meta.glob('../data/systems/*.json', { eager: true, import: 'default' });
const stops = import.meta.glob('../data/stops/*.json', { eager: true, import: 'default' });

export const REGION = { slug: 'bc', name: 'British Columbia' };
export const SYSTEM_INDEX = index;

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
 * page is two or three times and little else — thin enough to do the site more harm than good.
 */
export const MIN_STOP_DEPARTURES = 20;

export function busiestDay(stop) {
  const perDay = {};
  for (const r of stop.routes) for (const [k, v] of Object.entries(r.times)) perDay[k] = (perDay[k] || 0) + v.length;
  return Math.max(0, ...Object.values(perDay));
}

const pageStopsCache = new Map();
export function pageStops(slug) {
  if (!pageStopsCache.has(slug)) pageStopsCache.set(slug, getStops(slug).filter((s) => busiestDay(s) >= MIN_STOP_DEPARTURES));
  return pageStopsCache.get(slug);
}

export function stopPageCodes(slug) {
  return new Set(pageStops(slug).map((s) => s.code));
}
