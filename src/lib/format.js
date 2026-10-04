/** Shared formatting for timetable pages. Times are minutes after midnight of the service day. */

/**
 * Clock times. 12-hour (5:45 am) where that is how timetables are written (Canada, the US,
 * Australia, New Zealand); 24-hour (17:45) in the UK and Ireland. `h24` comes from the country.
 */
export function clock(min, h24 = false) {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  return h24 ? { text: `${String(h).padStart(2, '0')}:${mm}`, pm: false } : { text: `${h % 12 || 12}:${mm}`, pm: h >= 12 };
}

/** 345 -> '5:45 am' (or '05:45' in 24-hour countries) */
export function clockText(min, h24 = false) {
  const c = clock(min, h24);
  if (h24) return c.text;
  return `${c.text} ${c.pm ? 'pm' : 'am'}`;
}

/** GTFS route_type, basic or extended (100s rail, 200s coach, 400s metro, 700s bus, 900s tram, 1000 water), to a basic type. */
export function baseType(type) {
  const t = Number(type);
  if (!(t >= 100)) return t;
  return t < 200 ? 2 : t < 300 ? 3 : t < 500 ? 1 : t < 900 ? 3 : t < 1000 ? 0 : t < 1100 ? 4 : t < 1400 ? 6 : 7;
}

/**
 * What riders call a route's mode, for headings: "bus", "tram", "subway", "train", "ferry".
 * A system can rename trams ("streetcar" in Toronto, "light rail" in Phoenix) with `tram`.
 */
export function modeName(type, sys) {
  const t = baseType(type);
  if (t === 0) return sys?.tram || 'tram';
  return ({ 1: 'subway', 2: 'train', 4: 'ferry', 5: 'cable car', 6: 'gondola', 7: 'funicular', 12: 'monorail' })[t] || 'bus';
}

/** The vehicle a rider waits for, in "the first ___": a subway or light rail line runs trains. */
export function vehicle(type, sys) {
  const n = modeName(type, sys);
  return n === 'subway' || n === 'light rail' || n === 'monorail' ? 'train' : n;
}

/** The mode a set of routes shares, or "transit" when they mix (Toronto: bus, streetcar and subway). */
export function sharedMode(routes, sys) {
  const set = new Set(routes.map((r) => modeName(r.type, sys)));
  return set.size === 1 ? [...set][0] : 'transit';
}

/** The vehicle a set of routes shares, or "departure" for a mix. */
export function sharedVehicle(routes, sys) {
  const set = new Set(routes.map((r) => vehicle(r.type, sys)));
  return set.size === 1 ? [...set][0] : 'departure';
}

/** bus -> buses, ferry -> ferries, light rail -> light rail trains. */
export function plural(n) {
  if (n === 'bus') return 'buses';
  if (n === 'ferry') return 'ferries';
  if (n === 'light rail') return 'light rail trains';
  if (n === 'transit') return 'transit services';
  return `${n}s`;
}

/** Where a rider waits: a stop, a station (rail) or a terminal (ferry). */
export function stopWord(types, sys) {
  const v = new Set(types.map((t) => modeName(t, sys)));
  if ([...v].every((n) => n === 'train' || n === 'subway')) return 'station';
  if ([...v].every((n) => n === 'ferry')) return 'terminal';
  return 'stop';
}

/** 15 -> 'every 15 min'; 90 -> 'every 1 h 30 min' */
export function every(gap) {
  if (!gap) return '';
  const h = Math.floor(gap / 60);
  const m = gap % 60;
  return `every ${[h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** '2026-10-12' -> 'Mon 12 Oct' */
export function shortDate(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** '2026-10-12' -> '12 October 2026' */
export function longDate(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('en-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * How a route is named: "Route 8" for numbered routes, "Alamein Line" / "Red Line" for named rail
 * and tram lines, the long name when there is no short one.
 */
export function routeLabel(r) {
  if (r.label) return r.label;
  if (!r.short) return plain(r.name);
  const t = baseType(r.type);
  if ([0, 1, 2, 12].includes(t) && !/\d/.test(r.short)) return /line$/i.test(r.short) ? r.short : `${r.short} Line`;
  if ([1, 2].includes(t)) return `Line ${r.short}`;
  return `Route ${r.short}`;
}

/** What an exception date runs, in words. */
export function runsText(e, days) {
  if (e.runs === 'none') return 'no service';
  if (e.runs === 'special') return 'a special timetable';
  const t = days.find((d) => d.key === e.runs);
  return t ? `the ${t.label} timetable` : 'a different timetable';
}

/** "UBCO Exchange Bay B" -> "UBCO Exchange": the place, without the bay a rider boards at. */
export function place(stopName) {
  // Only a bay identifier: one capital letter or a number ("Bay F", "Bay 3", "Bay #2"). The
  // looser /Bay\s*\w+$/i turned "Douglas St at Bay St" into "Douglas St at".
  return String(stopName).replace(/\s+Bay\s*#?\s*(?:[A-Z]|\d{1,2})$/, '').replace(/\s*[\u2013\u2014]\s*/g, ' - ').trim();
}

/** [345, 365, 400, 1487] -> [{ hour label, pm, mins: [{ m, text }] }, …] in service-day order. */
export function byHour(times, h24 = false) {
  const rows = [];
  for (const t of times) {
    const h = Math.floor(t / 60);
    let row = rows.at(-1);
    if (!row || row.h !== h) rows.push(row = { h, label: h24 ? String(h % 24).padStart(2, '0') : String((h % 24) % 12 || 12), pm: !h24 && h % 24 >= 12, mins: [] });
    row.mins.push({ m: t, text: String(t % 60).padStart(2, '0') });
  }
  return rows;
}

export function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Long dashes in feed text become plain hyphens, so no page shows typographic dashes. */
export function plain(s) {
  return String(s ?? '').replace(/\s*[–—]\s*/g, ' - ');
}

/** Relative luminance of a #rrggbb colour (WCAG 2). */
function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Text colour for a route badge: white or graphite, whichever reads better on the operator's
 * route colour. Feeds pair yellow routes with white text (1.9:1); this picks 4.5:1 or better.
 */
export function inkFor(bg) {
  const L = luminance(bg);
  if (L == null) return '#ffffff';
  // Near-black rather than the page graphite: on mid-tones (#B06E0E, #ED1D8F, #8177B7) graphite
  // reached only 4.3-4.5:1, near-black clears 4.8:1.
  const onWhite = 1.05 / (L + 0.05);
  const onInk = (L + 0.05) / (0.0035 + 0.05);
  return onWhite >= onInk ? '#ffffff' : '#0b0c0d';
}

/** "Kelowna" -> "Kelowna’s", "Smithers" -> "Smithers’" */
export function possessive(name) {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`;
}

/** Does a system's own name already say the mode ("Dublin Bus", "Melbourne Trams", "Luas")? */
export const namesMode = (name) => /(bus|buses)\b|\b(tram|trams|train|trains|rail|ferry|ferries|coach|coaches|luas)\b/i.test(name);

export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The name a route is searched by, with its mode: "Kelowna Bus", "Toronto TTC Streetcar",
 * "Dublin Bus" (the name already says it), "Melbourne Trams".
 */
export function brandFor(sys, type) {
  const n = modeName(type, sys);
  if (namesMode(sys.name)) return sys.name;
  return `${sys.name} ${n.split(' ').map(cap).join(' ')}`;
}

/**
 * Where a trip is going, from its destination sign: "Downtown - To UBCO" -> "UBCO",
 * TTC's "South - 131 Nugget towards Kennedy Station" -> "Kennedy Station".
 */
export function toward(headsign) {
  const h = plain(headsign)
    .replace(/^.*\btowards\s+/i, '')
    .replace(/^.*-\s*To\s+/i, '')
    .replace(/^To\s+/i, '');
  return place(h) || 'terminus';
}
