/**
 * The live boards on the homepage: one busy stop per region, picked by the visitor's timezone
 * (a rider in Dublin sees Dublin first). Each board's data is a small JSON file built in main.
 */
import { getSystem, pageStops, busiestDay, META } from './data.js';
import { inkFor, place, plain, routeLabel, toward } from './format.js';

export const FEATURED = [
  { key: 'ca/toronto', city: 'Toronto', tz: ['America/Toronto', 'America/New_York', 'America/Montreal', 'America/Halifax', 'America/Detroit', 'America/Chicago'] },
  { key: 'ie/dublin-bus', city: 'Dublin', tz: ['Europe/Dublin'] },
  { key: 'uk/brighton-hove-bus', city: 'Brighton', tz: ['Europe/London', 'Europe/'] },
  { key: 'au/melbourne-trams', city: 'Melbourne', tz: ['Australia/'] },
  { key: 'ca/victoria', city: 'Victoria', tz: ['America/Vancouver', 'America/Edmonton', 'America/Los_Angeles'] },
  { key: 'us/phoenix', city: 'Phoenix', tz: ['America/Phoenix', 'America/Denver'] },
  { key: 'nz/dunedin', city: 'Dunedin', tz: ['Pacific/Auckland'] },
].filter((f) => META[f.key]);


export function boardFor(key) {
  const sys = getSystem(key);
  if (!sys) return null;
  const stop = [...pageStops(key)].sort((a, b) => busiestDay(b) - busiestDay(a))[0];
  if (!stop) return null;
  const base = `/${key}`;
  return {
    key,
    name: place(plain(stop.name)),
    system: sys.name,
    url: `${base}/stop/${encodeURIComponent(stop.code)}`,
    tz: sys.timezone,
    rows: stop.routes.map((r) => {
      const route = sys.routes.find((x) => x.slug === r.route);
      return {
        short: r.short || (route ? routeLabel(route).slice(0, 4) : ''), color: r.color, text: inkFor(r.color), to: toward(r.headsign),
        url: `${base}/${r.route}`,
        days: route?.days.map(({ key: k, days }) => ({ key: k, days })) || [],
        exceptions: route?.exceptions.map(({ date, runs }) => ({ date, runs })) || [],
        times: r.times,
      };
    }),
  };
}
