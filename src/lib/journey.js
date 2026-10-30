/** Wording and arithmetic shared by the journey pages (town to town, and each town's "from" page). */
import { routeLabel } from './format.js';

const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// On 28 Oct 2026, eleven days after ~40,000 town-to-town pages went up, Search Console showed the
// whole site vanishing from most searches (impressions down ~75% overnight, positions unchanged
// where it still showed): the pattern of a site judged to be mass-produced pages. Pairs with a
// bus or two a week say little more than that, so they stay up for riders but ask Google not to
// index them, and leave the sitemaps (astro.config.mjs). Each town's "from" page is a list of
// such pairs (position 33, no clicks in the four weeks before) and is treated the same.
export const THIN_WEEKLY = 10;
/** Whether Google should index this town-to-town page: more than THIN_WEEKLY departures a week. */
export const indexedPair = (pair) => pair.weekly > THIN_WEEKLY;

/** 50 -> '50 min', 110 -> '1 h 50 min', 120 -> '2 h' */
export function duration(m) {
  if (m == null || Number.isNaN(m)) return '';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), mm = m % 60;
  return mm ? `${h} h ${mm} min` : `${h} h`;
}

/** ['a', 'b', 'c'] -> 'a, b and c' */
export function listText(items) {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0] || '';
}

/** The days a departure runs when not every day of its tab: [1, 3] -> 'Tue and Thu only'. */
export function daysOnly(days) {
  const runs = [];
  for (const d of days) { const last = runs.at(-1); if (last && last[1] === d - 1) last[1] = d; else runs.push([d, d]); }
  const parts = runs.flatMap(([a, b]) => (a === b ? [SHORT[a]] : b === a + 1 ? [SHORT[a], SHORT[b]] : [`${SHORT[a]} to ${SHORT[b]}`]));
  return `${listText(parts)} only`;
}

/** 'route 233', 'routes 233 and 40', 'Ballarat Line and route 30': the routes in a sentence. */
export function routeList(routes) {
  const labels = routes.map(routeLabel);
  const nums = labels.filter((l) => /^Route /.test(l)).map((l) => l.slice(6));
  const named = labels.filter((l) => !/^Route /.test(l));
  return listText([...named, ...(nums.length ? [`${nums.length > 1 ? 'routes' : 'route'} ${listText(nums)}`] : [])]);
}

/** Departures on each weekday (0 = Monday), counting the ones that run only some days. */
export function perWeekday(pair) {
  return [0, 1, 2, 3, 4, 5, 6].map((w) => {
    const d = pair.days.find((x) => x.days.includes(w));
    return d ? pair.trips[d.key].filter((r) => !r[5] || r[5].includes(w)).length : 0;
  });
}

const weekdayOf = (iso) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;

/**
 * Dates a pair runs something other than its usual weekday, from its routes' own exceptions:
 * when every route does the same (all run the Sunday timetable on a bank holiday, or none run
 * on Christmas Day) the pair does too; when they differ, the day is "special" and the page says
 * to check before travelling, rather than promise a departure that may not run.
 */
export function pairExceptions(pair, routes) {
  const dates = [...new Set(routes.flatMap((r) => r.exceptions.map((e) => e.date)))].sort();
  const out = [];
  for (const date of dates) {
    const wd = weekdayOf(date);
    let holiday = null;
    const outcomes = routes.map((r) => {
      const e = r.exceptions.find((y) => y.date === date);
      if (!e) return wd;
      holiday ||= e.holiday;
      if (e.runs === 'none' || e.runs === 'special') return e.runs;
      return r.days.find((d) => d.key === e.runs)?.days[0] ?? 'special';
    });
    const first = outcomes[0];
    let runs;
    if (!outcomes.every((o) => o === first)) runs = 'special';
    else if (first === 'none' || first === 'special') runs = first;
    else runs = pair.days.find((d) => d.days.includes(first))?.key || 'none';
    const usual = pair.days.find((d) => d.days.includes(wd))?.key || 'none';
    if (runs !== usual) out.push({ date, holiday, runs });
  }
  return out;
}
