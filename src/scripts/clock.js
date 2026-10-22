/**
 * Time helpers shared by the site script (app.js) and the embeddable board (embed.js): the
 * rider's "now" in the network's timezone, and which timetable runs today.
 */

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DEFAULT_TZ = 'America/Vancouver';

/** The current date, weekday (0 = Monday) and minute of the day in a given timezone. */
export function now(tz = DEFAULT_TZ) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { iso: `${p.year}-${p.month}-${p.day}`, wd: WD.indexOf(p.weekday), min: Number(p.hour) * 60 + Number(p.minute) };
}

export function yesterday(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Which of a route's day types runs on a date: an exception first, else the weekday's. */
export function dayKey(route, iso, wd) {
  const ex = (route.exceptions || []).find((e) => e.date === iso);
  if (ex) return ['none', 'special'].includes(ex.runs) ? null : ex.runs;
  return (route.days.find((d) => d.days.includes(wd)) || {}).key || null;
}

/** Minute of the day as "14:05" or "2:05". */
export const clockText = (m, h24) => { m = ((m % 1440) + 1440) % 1440; const h = Math.floor(m / 60); const mm = String(m % 60).padStart(2, '0'); return h24 ? `${String(h).padStart(2, '0')}:${mm}` : `${h % 12 || 12}:${mm}`; };
export const waitText = (w) => (w <= 0 ? 'now' : w < 60 ? `in ${w} min` : `in ${Math.floor(w / 60)} h ${w % 60 ? `${w % 60} min` : ''}`.trim());

/**
 * Departures in the next three hours from board rows ({ days, exceptions, times: { dayKey: [minutes] } }),
 * soonest first. After midnight, last night's late trips (GTFS times past 24:00) still count.
 */
export function upcoming(rows, tz, span = 180) {
  const t = now(tz);
  const y = yesterday(t.iso);
  const ywd = (t.wd + 6) % 7;
  const out = [];
  for (const r of rows) {
    const k = dayKey(r, t.iso, t.wd);
    for (const m of (k && r.times[k]) || []) if (m >= t.min && m < t.min + span) out.push({ r, m, w: m - t.min });
    const yk = dayKey(r, y, ywd);
    for (const m of (yk && r.times[yk]) || []) if (m >= 1440 && m - 1440 >= t.min && m - 1440 < t.min + span) out.push({ r, m, w: m - 1440 - t.min });
  }
  return { t, list: out.sort((a, b) => a.w - b.w) };
}
