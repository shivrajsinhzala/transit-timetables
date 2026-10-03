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
  return String(stopName).replace(/\s+(Bay|Bay\s*#)\s*[A-Z0-9]+$/i, '').trim();
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
