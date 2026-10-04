/** Shared formatting for timetable pages. Times are minutes after midnight of the service day. */

/** 345 -> { text: '5:45', pm: false }; 1487 (24:47, after midnight) -> { text: '12:47', pm: false } */
export function clock(min) {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return { text: `${h % 12 || 12}:${String(m % 60).padStart(2, '0')}`, pm: h >= 12 };
}

/** 345 -> '5:45 am' */
export function clockText(min) {
  const c = clock(min);
  return `${c.text} ${c.pm ? 'pm' : 'am'}`;
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

/** "Route 8" or the route's name when it has no number. */
export function routeLabel(r) {
  return r.short ? `Route ${r.short}` : r.name;
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
  return String(stopName).replace(/\s+(Bay|Bay\s*#)\s*[A-Z0-9]+$/i, '').replace(/\s*[\u2013\u2014]\s*/g, ' - ').trim();
}

/** [345, 365, 400, 1487] -> [{ hour: 5, label: '5', pm: false, mins: ['45'] }, …] in service-day order. */
export function byHour(times) {
  const rows = [];
  for (const t of times) {
    const h = Math.floor(t / 60);
    let row = rows.at(-1);
    if (!row || row.h !== h) rows.push(row = { h, label: String((h % 24) % 12 || 12), pm: h % 24 >= 12, mins: [] });
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
