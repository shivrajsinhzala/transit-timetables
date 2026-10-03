#!/usr/bin/env node
/**
 * GTFS (data/raw/<feed>.zip) -> the JSON the site is built from (src/data/).
 *
 *   npm run fetch && npm run data && npm run build
 *
 * What a timetable page shows is decided here, so the rules live here too:
 *
 * - Day types are derived, not assumed. BC Transit's feeds have no calendar.txt, only
 *   calendar_dates.txt, so for each weekday the build looks at the next four weeks and takes the
 *   set of services that most often runs on it (holidays excluded). Weekdays whose sets match are
 *   one day type — "Monday to Friday", or "Monday to Thursday" + "Friday" where they differ.
 * - Dates in the next 60 days that run something else are listed as exceptions, named after the
 *   day type they match ("runs the Sunday timetable") or called special/no service.
 * - Columns are the feed's own timepoints (timepoint=1) on the direction's most common stop
 *   pattern, capped at MAX_COLUMNS so a timetable fits a phone without sideways scrolling. A trip
 *   that does not serve a column shows a dash, as on the printed timetables.
 * - Times are kept as minutes after midnight of the service day; GTFS times past 24:00 stay past
 *   1440 so after-midnight trips sort last, and are shown modulo 24 h.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse';
import { parse as parseSync } from 'csv-parse/sync';
import { SYSTEMS, HOLIDAYS } from '../data/systems.mjs';

const RAW = 'data/raw';
const OUT = 'src/data/systems';
const STOPS_OUT = 'src/data/stops';
const WINDOW_DAYS = 28;
const EXCEPTION_DAYS = 60;
const MAX_COLUMNS = 7;
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHORT = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const csvOptions = { columns: true, bom: true, skip_empty_lines: true, relax_column_count: true, trim: true };

function listing(zip) {
  return execFileSync('unzip', ['-Z1', zip]).toString().split('\n').map((s) => s.trim()).filter(Boolean);
}

function readCsv(zip, file) {
  if (!listing(zip).includes(file)) return [];
  return parseSync(execFileSync('unzip', ['-p', zip, file], { maxBuffer: 1 << 30 }), csvOptions);
}

function streamCsv(zip, file, onRow) {
  return new Promise((resolve, reject) => {
    const unzip = spawn('unzip', ['-p', zip, file]);
    const parser = parse(csvOptions);
    parser.on('readable', () => { let r; while ((r = parser.read())) onRow(r); });
    parser.on('error', reject);
    parser.on('end', resolve);
    unzip.stdout.pipe(parser);
    unzip.on('error', reject);
  });
}

/** "25:10:00" -> 1510 */
function minutes(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Today's date (YYYY-MM-DD) in the feed's own timezone. */
function today(tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Monday ... 6 = Sunday */
function weekday(iso) {
  return (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
}

const gtfsDate = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** [0,1,2,3,4] -> "Monday to Friday"; [0,2,4] -> "Monday, Wednesday and Friday" */
function dayLabel(days) {
  if (days.length === 7) return 'Every day';
  const runs = [];
  for (const d of days) {
    const last = runs.at(-1);
    if (last && last[1] === d - 1) last[1] = d; else runs.push([d, d]);
  }
  const parts = runs.map(([a, b]) => (a === b ? WEEKDAYS[a] : b === a + 1 ? `${WEEKDAYS[a]} and ${WEEKDAYS[b]}` : `${WEEKDAYS[a]} to ${WEEKDAYS[b]}`));
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
}

function dayKey(days) {
  if (days.length === 7) return 'daily';
  const runs = [];
  for (const d of days) {
    const last = runs.at(-1);
    if (last && last[1] === d - 1) last[1] = d; else runs.push([d, d]);
  }
  return runs.map(([a, b]) => (a === b ? SHORT[a] : `${SHORT[a]}-${SHORT[b]}`)).join('_');
}

function mode(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function median(values) {
  const v = [...values].sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
}

/** Evenly thin `idx` down to `max`, always keeping the first and the last. */
function thin(idx, max) {
  if (idx.length <= max) return idx;
  const out = [];
  for (let i = 0; i < max; i++) out.push(idx[Math.round((i * (idx.length - 1)) / (max - 1))]);
  return [...new Set(out)];
}

async function buildSystem(feedId, meta) {
  const zip = path.join(RAW, `${feedId}.zip`);
  const agency = readCsv(zip, 'agency.txt')[0] || {};
  const tz = agency.agency_timezone || 'America/Vancouver';
  const feedInfo = readCsv(zip, 'feed_info.txt')[0] || {};
  const start = today(tz);

  // --- which services run on which date -------------------------------------------------
  const servicesOn = new Map(); // date -> Set(service_id)
  const add = (d, s) => { if (!servicesOn.has(d)) servicesOn.set(d, new Set()); servicesOn.get(d).add(s); };
  const end = addDays(start, EXCEPTION_DAYS);
  for (const c of readCsv(zip, 'calendar.txt')) {
    for (let d = start; d <= end; d = addDays(d, 1)) {
      if (d < gtfsDate(c.start_date) || d > gtfsDate(c.end_date)) continue;
      if (c[WEEKDAYS[weekday(d)].toLowerCase()] === '1') add(d, c.service_id);
    }
  }
  for (const c of readCsv(zip, 'calendar_dates.txt')) {
    const d = gtfsDate(c.date);
    if (d < start || d > end) continue;
    if (c.exception_type === '1') add(d, c.service_id);
    else servicesOn.get(d)?.delete(c.service_id);
  }

  // --- trips and stop times for every service that runs in the range -----------------------
  const routes = readCsv(zip, 'routes.txt');
  const stops = new Map(readCsv(zip, 'stops.txt').map((s) => [s.stop_id, s]));
  const rangeServices = new Set([...servicesOn.values()].flatMap((set) => [...set]));
  const trips = new Map();
  for (const t of readCsv(zip, 'trips.txt')) {
    if (rangeServices.has(t.service_id)) trips.set(t.trip_id, { ...t, stops: [] });
  }
  await streamCsv(zip, 'stop_times.txt', (r) => {
    const trip = trips.get(r.trip_id);
    if (!trip) return;
    trip.stops.push({
      id: r.stop_id,
      seq: Number(r.stop_sequence),
      min: minutes(r.departure_time || r.arrival_time),
      tp: r.timepoint === '1',
      board: r.pickup_type !== '1',
    });
  });
  for (const t of trips.values()) t.stops.sort((a, b) => a.seq - b.seq);

  // A date's timetable is what actually runs on it. BC Transit gives each date range its own
  // service id, so two Wednesdays with identical buses have different service ids; comparing
  // ids made every weekday look like its own timetable. Compare the trips instead.
  const tripSig = (t) => `${t.route_id}|${t.direction_id}|${t.stops[0]?.min}|${t.stops.length}|${t.stops[0]?.id}`;
  const serviceSigs = new Map();
  for (const t of trips.values()) {
    if (!serviceSigs.has(t.service_id)) serviceSigs.set(t.service_id, []);
    serviceSigs.get(t.service_id).push(tripSig(t));
  }
  const sigCache = new Map();
  const sigOf = (d) => {
    if (!sigCache.has(d)) {
      const all = [...(servicesOn.get(d) || [])].flatMap((s) => serviceSigs.get(s) || []).sort();
      sigCache.set(d, all.length ? createHash('sha1').update(all.join('\n')).digest('hex') : '');
    }
    return sigCache.get(d);
  };

  // --- the usual timetable for each weekday, and the day types they form -------------------
  const window = Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(start, i)).filter((d) => !HOLIDAYS[d]);
  const usual = WEEKDAYS.map((_, w) => mode(window.filter((d) => weekday(d) === w).map(sigOf)) ?? '');
  // The services of one real date that ran the usual timetable — what the tables are built from.
  const sample = usual.map((sig, w) => window.find((d) => weekday(d) === w && sigOf(d) === sig));
  const groups = new Map();
  usual.forEach((k, w) => { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(w); });
  const dayTypes = [...groups.entries()]
    .filter(([k]) => k)
    .map(([k, days]) => ({ key: dayKey(days), label: dayLabel(days), days, sig: k, services: servicesOn.get(sample[days[0]]) || new Set() }))
    .sort((a, b) => a.days[0] - b.days[0]);
  const noServiceDays = groups.get('') || [];

  // Dates that run something other than their weekday's usual timetable. A run of them is a
  // timetable change (a new season), reported once as a date rather than as forty exceptions.
  const differs = (d) => sigOf(d) !== usual[weekday(d)];
  let changesOn = null;
  for (let d = start; d <= addDays(end, -7); d = addDays(d, 1)) {
    const week = Array.from({ length: 7 }, (_, i) => addDays(d, i));
    if (week.filter(differs).length >= 5) { changesOn = d; break; }
  }
  const exceptions = [];
  for (let d = start; d <= (changesOn ? addDays(changesOn, -1) : end); d = addDays(d, 1)) {
    if (!differs(d)) continue;
    const same = dayTypes.find((t) => t.sig === sigOf(d));
    exceptions.push({ date: d, holiday: HOLIDAYS[d] || null, runs: sigOf(d) === '' ? 'none' : same ? same.key : 'special' });
  }

  const stopName = (id) => stops.get(id)?.stop_name || id;
  const stopCode = (id) => stops.get(id)?.stop_code || id;
  const usedSlugs = new Set();
  const stopDepartures = new Map(); // stop_id -> Map(routeSlug|dir -> {…, times: {dayKey: []}})

  const outRoutes = [];
  for (const r of routes) {
    // Day types per route, not per system: Victoria as a whole differs on Wednesdays because a
    // handful of its 69 routes do, and that must not split route 4's Monday-to-Friday table.
    const own = [...trips.values()].filter((t) => t.route_id === r.route_id && t.stops.length > 1);
    const perDay = WEEKDAYS.map((_, w) => {
      const svc = sample[w] ? servicesOn.get(sample[w]) : null;
      const ts = svc ? own.filter((t) => svc.has(t.service_id)) : [];
      return { ts, sig: ts.map(tripSig).sort().join('\n') };
    });
    const byRouteSig = new Map();
    perDay.forEach(({ sig }, w) => { if (!sig) return; if (!byRouteSig.has(sig)) byRouteSig.set(sig, []); byRouteSig.get(sig).push(w); });
    const types = [...byRouteSig.values()]
      .map((days) => ({ key: dayKey(days), label: dayLabel(days), days, trips: perDay[days[0]].ts }))
      .sort((x, y) => x.days[0] - y.days[0]);
    const routeTrips = [...new Set(types.flatMap((t) => t.trips))];
    if (!routeTrips.length) continue;

    let slug = r.route_short_name ? `route-${slugify(r.route_short_name)}` : slugify(r.route_long_name);
    while (usedSlugs.has(slug)) slug += '-2';
    usedSlugs.add(slug);

    const directions = [];
    for (const dirId of [...new Set(routeTrips.map((t) => t.direction_id || '0'))].sort()) {
      const dirTrips = routeTrips.filter((t) => (t.direction_id || '0') === dirId);
      const patterns = new Map();
      for (const t of dirTrips) {
        const k = t.stops.map((x) => x.id).join('>');
        if (!patterns.has(k)) patterns.set(k, []);
        patterns.get(k).push(t);
      }
      const base = [...patterns.values()].sort((x, y) => y.length - x.length || y[0].stops.length - x[0].stops.length)[0][0];
      let cols = base.stops.map((x, i) => (x.tp ? i : -1)).filter((i) => i >= 0);
      if (cols.length < 2) cols = [0, base.stops.length - 1];
      if (cols[0] !== 0) cols.unshift(0);
      if (cols.at(-1) !== base.stops.length - 1) cols.push(base.stops.length - 1);
      cols = thin(cols, MAX_COLUMNS);
      const colStops = cols.map((i) => base.stops[i].id);
      const headsign = mode(dirTrips.map((t) => t.trip_headsign).filter(Boolean)) || `To ${stopName(base.stops.at(-1).id)}`;

      const schedules = {};
      for (const type of types) {
        const rows = [];
        const seen = new Set();
        for (const t of type.trips) {
          if ((t.direction_id || '0') !== dirId) continue;
          let from = 0;
          const row = colStops.map((id) => {
            for (let j = from; j < t.stops.length; j++) {
              if (t.stops[j].id === id) { from = j + 1; return t.stops[j].min; }
            }
            return null;
          });
          if (!row.some((x) => x != null)) continue;
          const k = row.join(',');
          if (seen.has(k)) continue;
          seen.add(k);
          rows.push(row);

          for (const st of t.stops.slice(0, -1)) {
            if (!st.board || st.min == null) continue;
            if (!stopDepartures.has(st.id)) stopDepartures.set(st.id, new Map());
            const byRoute = stopDepartures.get(st.id);
            const rk = `${slug}|${dirId}`;
            if (!byRoute.has(rk)) byRoute.set(rk, { route: slug, short: r.route_short_name, name: r.route_long_name, color: r.route_color ? `#${r.route_color}` : null, headsign, days: types.map(({ key, label }) => ({ key, label })), times: {} });
            (byRoute.get(rk).times[type.key] ||= []).push(st.min);
          }
        }
        const first = (row) => row.find((x) => x != null);
        rows.sort((x, y) => first(x) - first(y));
        if (rows.length) schedules[type.key] = rows;
      }
      if (!Object.keys(schedules).length) continue;

      directions.push({
        id: dirId,
        headsign,
        columns: colStops.map((id) => ({ code: stopCode(id), name: stopName(id) })),
        stops: base.stops.map((x) => ({ code: stopCode(x.id), name: stopName(x.id) })),
        schedules,
      });
    }
    if (!directions.length) continue;

    // Summary per day type: first and last bus, trips, and the typical daytime gap.
    const summary = {};
    for (const type of types) {
      const starts = directions.flatMap((d) => (d.schedules[type.key] || []).map((row) => row.find((x) => x != null)));
      if (!starts.length) continue;
      const main = directions[0].schedules[type.key]?.map((row) => row.find((x) => x != null)) || [];
      const daytime = main.filter((m) => m >= 7 * 60 && m <= 19 * 60).sort((x, y) => x - y);
      const gaps = daytime.slice(1).map((m, i) => m - daytime[i]).filter((g) => g > 0);
      summary[type.key] = { first: Math.min(...starts), last: Math.max(...starts), trips: starts.length, gap: gaps.length >= 3 ? median(gaps) : null };
    }

    // This route's own exceptions: of the dates the system runs differently, the ones where this
    // route does — said as the timetable it runs instead, when it matches one.
    const sigs = new Map(types.map((t) => [t.trips.map(tripSig).sort().join('\n'), t.key]));
    const routeExceptions = [];
    for (const e of exceptions) {
      const svc = servicesOn.get(e.date) || new Set();
      const sig = own.filter((t) => svc.has(t.service_id)).map(tripSig).sort().join('\n');
      if (sig === perDay[weekday(e.date)].sig) continue;
      routeExceptions.push({ date: e.date, holiday: e.holiday, runs: sig === '' ? 'none' : sigs.get(sig) || 'special' });
    }

    outRoutes.push({
      slug,
      short: r.route_short_name || '',
      name: r.route_long_name || '',
      color: r.route_color ? `#${r.route_color}` : null,
      textColor: r.route_text_color ? `#${r.route_text_color}` : null,
      days: types.map(({ key, label, days }) => ({ key, label, days })),
      exceptions: routeExceptions,
      directions,
      summary,
    });
  }

  const num = (s) => Number.parseFloat(s) || Infinity;
  outRoutes.sort((a, b) => num(a.short) - num(b.short) || a.short.localeCompare(b.short) || a.name.localeCompare(b.name));

  const system = {
    feedId,
    ...meta,
    timezone: tz,
    builtOn: start,
    feed: { version: feedInfo.feed_version || '', from: feedInfo.feed_start_date ? gtfsDate(feedInfo.feed_start_date) : null, to: feedInfo.feed_end_date ? gtfsDate(feedInfo.feed_end_date) : null },
    dayTypes: dayTypes.map(({ key, label, days }) => ({ key, label, days })),
    noServiceDays: noServiceDays.map((d) => WEEKDAYS[d]),
    exceptions,
    changesOn,
    routes: outRoutes,
  };

  const stopsOut = [...stopDepartures.entries()].map(([id, byRoute]) => {
    const s = stops.get(id) || {};
    return {
      code: s.stop_code || id,
      name: s.stop_name || id,
      lat: Number(s.stop_lat) || null,
      lon: Number(s.stop_lon) || null,
      routes: [...byRoute.values()].map((e) => ({ ...e, times: Object.fromEntries(Object.entries(e.times).map(([k, v]) => [k, [...new Set(v)].sort((a, b) => a - b)])) })),
    };
  }).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  return { system, stops: stopsOut };
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(STOPS_OUT, { recursive: true });
const index = [];
for (const [feedId, meta] of Object.entries(SYSTEMS)) {
  if (!fs.existsSync(path.join(RAW, `${feedId}.zip`))) { console.warn(`skip ${feedId}: not downloaded`); continue; }
  const t0 = Date.now();
  const { system, stops } = await buildSystem(feedId, meta);
  fs.writeFileSync(path.join(OUT, `${meta.slug}.json`), JSON.stringify(system));
  fs.writeFileSync(path.join(STOPS_OUT, `${meta.slug}.json`), JSON.stringify(stops));
  index.push({ slug: meta.slug, name: meta.name, area: meta.area, routes: system.routes.length, stops: stops.length, builtOn: system.builtOn });
  console.log(`${meta.slug.padEnd(20)} ${String(system.routes.length).padStart(3)} routes ${String(stops.length).padStart(5)} stops  day types: ${system.dayTypes.map((d) => d.key).join(', ') || '-'}  exceptions: ${system.exceptions.length}  (${Date.now() - t0} ms)`);
}
fs.writeFileSync('src/data/index.json', JSON.stringify(index.sort((a, b) => b.routes - a.routes), null, 1));
