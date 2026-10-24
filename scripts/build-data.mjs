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
import Holidays from 'date-holidays';
import { SYSTEMS } from '../data/systems.mjs';
import { havePlaces } from './places.mjs';
import { buildJourneys } from './journeys.mjs';

const RAW = 'data/raw';
const OUT = 'src/data/systems';
const STOPS_OUT = 'src/data/stops';
const JOURNEYS_OUT = 'src/data/journeys';
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
  // A two-day run is two list items, so [0,1,3] reads "Monday, Tuesday and Thursday", not
  // "Monday and Tuesday and Thursday" (the description Google showed for Phoenix route 61s).
  const parts = runs.flatMap(([a, b]) => (a === b ? [WEEKDAYS[a]] : b === a + 1 ? [WEEKDAYS[a], WEEKDAYS[b]] : [`${WEEKDAYS[a]} to ${WEEKDAYS[b]}`]));
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

/** Douglas-Peucker on [lon, lat] pairs; `tol` in degrees (0.0001 is about 10 m). */
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy || 1e-12;
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const t = Math.max(0, Math.min(1, ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / len));
      const ex = ax + t * dx - pts[i][0], ey = ay + t * dy - pts[i][1];
      const d = ex * ex + ey * ey;
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol * tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const round5 = (n) => Math.round(n * 1e5) / 1e5;

/** The zip to read: the feed itself, or one mode's zip extracted from inside it (Melbourne). */
function zipFor(meta) {
  const outer = path.join(RAW, `${meta.feed}.zip`);
  if (!meta.inner) return outer;
  const inner = path.join('data/tmp', `${meta.feed}-${meta.inner.replace(/[^a-z0-9]+/gi, '-')}`);
  if (!fs.existsSync(inner) || fs.statSync(inner).mtimeMs < fs.statSync(outer).mtimeMs) {
    fs.mkdirSync('data/tmp', { recursive: true });
    const fd = fs.openSync(inner, 'w');
    try { execFileSync('unzip', ['-p', outer, meta.inner], { stdio: ['ignore', fd, 'inherit'] }); } finally { fs.closeSync(fd); }
  }
  return inner;
}

async function buildSystem(meta) {
  const feedId = meta.feed;
  const zip = zipFor(meta);
  const hd = new Holidays(...meta.hol);
  const holidayCache = new Map();
  /** Public holiday name on a date in this system's region, or null. */
  const holiday = (d) => {
    if (!holidayCache.has(d)) {
      const h = (hd.isHoliday(new Date(`${d}T12:00:00Z`)) || []).find((x) => x.type === 'public');
      holidayCache.set(d, h ? h.name : null);
    }
    return holidayCache.get(d);
  };
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
  // One feed can hold several systems (Otago: Dunedin and Queenstown): `agency` picks one, or a
  // list (Adelaide Metro is four contractors and the Rail Commissioner, in a feed with country coaches).
  const agencies = meta.agency && [].concat(meta.agency);
  let routes = readCsv(zip, 'routes.txt').filter((r) => !agencies || agencies.includes(r.agency_id));

  // Some feeds give each direction its own route ("Shiel Hill to Opoho", "Opoho to Shiel Hill",
  // both route 10). Riders know one route 10 with two directions, so mirror pairs are merged:
  // the first is kept, and the other's trips become its extra directions.
  const ends = (n) => String(n || '').toLowerCase().replace(/\s+via\s+.*$/, '').replace(/\b(express|loop|service|direct)\b/g, '').split(/\s+(?:to|-|–|—|>)\s+/i).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const pairKey = (r) => { const e = ends(r.route_long_name); return [r.agency_id || '', r.route_short_name || '', r.route_type, e.length === 2 ? [...e].sort().join('~') : String(r.route_long_name || '').toLowerCase()].join('|'); };
  const mirrors = new Map();
  for (const r of routes) { const k = pairKey(r); if (!mirrors.has(k)) mirrors.set(k, []); mirrors.get(k).push(r); }
  const mergedInto = new Map(); // route_id -> { leader, idx }
  for (const list of mirrors.values()) {
    if (list.length < 2 || !list[0].route_short_name) continue;
    list.forEach((r, idx) => mergedInto.set(r.route_id, { leader: list[0].route_id, idx }));
    const e = ends(list[0].route_long_name);
    if (e.length === 2) list[0].route_long_name = String(list[0].route_long_name).replace(/\s+(?:to|>)\s+/i, ' - ');
  }
  routes = routes.filter((r) => !mergedInto.has(r.route_id) || mergedInto.get(r.route_id).leader === r.route_id);
  const routeIds = new Set([...routes.map((r) => r.route_id), ...mergedInto.keys()]);
  const stops = new Map(readCsv(zip, 'stops.txt').map((s) => [s.stop_id, s]));
  const geo = { routes: [] };
  const rangeServices = new Set([...servicesOn.values()].flatMap((set) => [...set]));
  const trips = new Map();
  for (const t of readCsv(zip, 'trips.txt')) {
    if (!rangeServices.has(t.service_id) || !routeIds.has(t.route_id)) continue;
    const m = mergedInto.get(t.route_id);
    // A merged route's directions are its source routes' directions, kept apart.
    const trip = m ? { ...t, route_id: m.leader, direction_id: `${m.idx}${t.direction_id || '0'}` } : { ...t };
    trips.set(t.trip_id, { ...trip, stops: [] });
  }
  // Streamed, keeping only this system's shapes: a UK regional feed's shapes.txt is ~1 GB and
  // holds every operator in the region.
  const shapeIds = new Set([...trips.values()].map((t) => t.shape_id).filter(Boolean));
  const shapes = new Map();
  if (shapeIds.size && listing(zip).includes('shapes.txt')) {
    await streamCsv(zip, 'shapes.txt', (p) => {
      if (!shapeIds.has(p.shape_id)) return;
      if (!shapes.has(p.shape_id)) shapes.set(p.shape_id, []);
      shapes.get(p.shape_id).push([Number(p.shape_pt_sequence), Number(p.shape_pt_lon), Number(p.shape_pt_lat)]);
    });
  }
  for (const [id, pts] of shapes) shapes.set(id, pts.sort((a, b) => a[0] - b[0]).map(([, lon, lat]) => [lon, lat]));
  await streamCsv(zip, 'stop_times.txt', (r) => {
    const trip = trips.get(r.trip_id);
    if (!trip) return;
    trip.stops.push({
      id: r.stop_id,
      seq: Number(r.stop_sequence),
      min: minutes(r.departure_time || r.arrival_time),
      tp: r.timepoint === '1',
      board: r.pickup_type !== '1',
      alight: r.drop_off_type !== '1',
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
  // A feed whose publisher has not yet posted the next timetable has no trips at all after its
  // last date (Morebus, October 2026: nothing after 1 November). Those days are unknown, not
  // "no service": counted, two empty Mondays outvoted two real ones and every weekday timetable
  // vanished. So days after the last date anything runs do not vote.
  let lastRun = null;
  for (let d = start; d <= end; d = addDays(d, 1)) if (sigOf(d)) lastRun = d;
  const window = Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(start, i)).filter((d) => !holiday(d) && (!lastRun || d <= lastRun));
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
    exceptions.push({ date: d, holiday: holiday(d), runs: sigOf(d) === '' ? 'none' : same ? same.key : 'special' });
  }

  const stopName = (id) => stops.get(id)?.stop_name || id;
  const stopCode = (id) => stops.get(id)?.stop_code || id;
  const usedSlugs = new Set();
  const stopDepartures = new Map(); // stop_id -> Map(routeSlug|dir -> {…, times: {dayKey: []}})

  const tripsByRoute = new Map();
  for (const t of trips.values()) { if (!tripsByRoute.has(t.route_id)) tripsByRoute.set(t.route_id, []); tripsByRoute.get(t.route_id).push(t); }
  const outRoutes = [];
  const slugOf = new Map(); // route_id -> page slug, for the journeys
  for (const r of routes) {
    // Day types per route, not per system: Victoria as a whole differs on Wednesdays because a
    // handful of its 69 routes do, and that must not split route 4's Monday-to-Friday table.
    const own = (tripsByRoute.get(r.route_id) || []).filter((t) => t.stops.length > 1);
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

    // Two different routes with one number (Irish Rail's "Commuter", V/Line's "Ballarat") get
    // their long name in the slug; a counter only if that clashes too.
    let slug = r.route_short_name ? `route-${slugify(r.route_short_name)}` : slugify(r.route_long_name);
    if (usedSlugs.has(slug) && r.route_long_name) slug = `${slug}-${slugify(r.route_long_name).slice(0, 48).replace(/-$/, '')}`;
    for (let n = 2; usedSlugs.has(slug); n++) slug = `${slug.replace(/-\d+$/, '')}-${n}`;
    usedSlugs.add(slug);

    const directions = [];
    const geoDirs = [];
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
      // Many feeds (most UK ones) mark every stop as a timepoint or none at all; either way the
      // flags say nothing, so spread the columns evenly along the route instead.
      if (cols.length < 3 || cols.length === base.stops.length) cols = base.stops.map((_, i) => i);
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

      const line = shapes.get(base.shape_id) || base.stops.map((x) => [Number(stops.get(x.id)?.stop_lon), Number(stops.get(x.id)?.stop_lat)]);
      geoDirs.push({
        headsign,
        line: simplify(line, 0.00008).map(([lon, lat]) => [round5(lon), round5(lat)]),
        stops: base.stops.map((x) => {
          const st = stops.get(x.id) || {};
          return [round5(Number(st.stop_lon)), round5(Number(st.stop_lat)), stopCode(x.id), stopName(x.id), x.tp ? 1 : 0];
        }),
      });
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

    geo.routes.push({ slug, short: r.route_short_name || '', name: r.route_long_name || '', color: r.route_color ? `#${r.route_color}` : null, dirs: geoDirs });

    slugOf.set(r.route_id, slug);
    outRoutes.push({
      slug,
      short: r.route_short_name || '',
      name: r.route_long_name || '',
      type: r.route_type === undefined || r.route_type === "" ? 3 : Number(r.route_type),
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
    key: `${meta.cc}/${meta.slug}`,
    timezone: tz,
    builtOn: start,
    // With no stated end date, the last day anything runs is the end, when it is within the range.
    feed: { version: feedInfo.feed_version || '', from: feedInfo.feed_start_date ? gtfsDate(feedInfo.feed_start_date) : null, to: feedInfo.feed_end_date ? gtfsDate(feedInfo.feed_end_date) : lastRun && lastRun < end ? lastRun : null },
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

  const journeys = havePlaces() ? buildJourneys({ cc: meta.cc, trips, stops, slugOf, sample, usual, servicesOn, dayKey, dayLabel, routeCount: outRoutes.length }) : null;

  return { system, stops: stopsOut, geo, journeys };
}

const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const index = fs.existsSync('src/data/index.json') && only ? JSON.parse(fs.readFileSync('src/data/index.json', 'utf8')) : [];
for (const meta of SYSTEMS) {
  const key = `${meta.cc}/${meta.slug}`;
  if (only && !only.has(key) && !only.has(meta.cc)) continue;
  if (!fs.existsSync(path.join(RAW, `${meta.feed}.zip`))) { console.warn(`skip ${key}: not downloaded`); continue; }
  const t0 = Date.now();
  let built;
  try { built = await buildSystem(meta); } catch (e) { console.warn(`! ${key}: ${e.message}`); continue; }
  const { system, stops, geo, journeys } = built;
  if (!system.routes.length) { console.warn(`skip ${key}: no routes running in the next four weeks`); continue; }
  for (const dir of [OUT, STOPS_OUT, JOURNEYS_OUT]) fs.mkdirSync(path.join(dir, meta.cc), { recursive: true });
  fs.writeFileSync(path.join(OUT, meta.cc, `${meta.slug}.json`), JSON.stringify(system));
  fs.writeFileSync(path.join(STOPS_OUT, meta.cc, `${meta.slug}.json`), JSON.stringify(stops));
  // Without the place list (scripts/places.mjs) there are no journeys: drop last week's rather than publish stale ones.
  const journeyFile = path.join(JOURNEYS_OUT, meta.cc, `${meta.slug}.json`);
  if (journeys) fs.writeFileSync(journeyFile, JSON.stringify(journeys)); else fs.rmSync(journeyFile, { force: true });
  // Map data is fetched by the browser only when a rider opens a map, so it lives in public/,
  // outside the pages: one file per route, plus a lighter overview of the whole system.
  const geoDir = path.join('public/geo', meta.cc, meta.slug);
  fs.rmSync(geoDir, { recursive: true, force: true });
  fs.mkdirSync(geoDir, { recursive: true });
  for (const r of geo.routes) fs.writeFileSync(path.join(geoDir, `${r.slug}.json`), JSON.stringify(r));
  fs.writeFileSync(path.join('public/geo', meta.cc, `${meta.slug}.json`), JSON.stringify({
    routes: geo.routes.map((r) => ({ slug: r.slug, short: r.short, name: r.name, color: r.color, line: simplify(r.dirs[0]?.line || [], 0.0004) })),
  }));
  const entry = { key, cc: meta.cc, slug: meta.slug, name: meta.name, area: meta.area, region: meta.region, group: meta.group || null, routes: system.routes.length, stops: stops.length, journeys: journeys?.pairs.length || 0, modes: [...new Set(system.routes.map((r) => r.type))], builtOn: system.builtOn };
  const i = index.findIndex((x) => x.key === key);
  if (i >= 0) index[i] = entry; else index.push(entry);
  console.log(`${key.padEnd(30)} ${String(system.routes.length).padStart(4)} routes ${String(stops.length).padStart(6)} stops ${String(journeys?.pairs.length || 0).padStart(5)}/${journeys?.candidates || 0} journeys  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
fs.writeFileSync('src/data/index.json', JSON.stringify(index.sort((a, b) => b.routes - a.routes), null, 1));
