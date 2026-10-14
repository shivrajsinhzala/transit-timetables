#!/usr/bin/env node
/**
 * Builds data/raw/<feed>.zip for systems that list `merge: [source feeds]` in data/systems.mjs.
 *
 * The UK's Bus Open Data Service publishes regional GTFS files, and a big operator's routes are
 * split across several of them (Stagecoach Midlands is in four). Route, trip and stop ids are
 * the same in every file, so one operator's feed is the union of its rows from each source:
 * routes, trips and stops are de-duplicated by id; services and shapes are numbered per
 * source file (their ids are not shared), so a prefix keeps them apart.
 *
 * Each source file is read once for all the systems that use it, and the output is rebuilt
 * only when a source is newer than it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { parse } from 'csv-parse';
import { SYSTEMS } from '../data/systems.mjs';

const RAW = 'data/raw';
const TMP = 'data/tmp/merge';
const csvOptions = { columns: true, bom: true, skip_empty_lines: true, relax_column_count: true, trim: true };

const targets = SYSTEMS.filter((s) => s.merge);
if (!targets.length) process.exit(0);

const out = (s) => path.join(RAW, `${s.feed}.zip`);
const stale = targets.filter((s) => {
  if (!fs.existsSync(out(s))) return true;
  const built = fs.statSync(out(s)).mtimeMs;
  return s.merge.some((f) => fs.existsSync(path.join(RAW, `${f}.zip`)) && fs.statSync(path.join(RAW, `${f}.zip`)).mtimeMs > built);
});
if (!stale.length) { console.log(`merge: ${targets.length} merged feeds up to date`); process.exit(0); }

const field = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** One GTFS file being written: the header comes from the first row, later rows follow its columns. */
class Table {
  constructor(file) { this.stream = fs.createWriteStream(file); this.cols = null; }
  add(row) {
    if (!this.cols) { this.cols = Object.keys(row); this.stream.write(`${this.cols.join(',')}\n`); }
    this.stream.write(`${this.cols.map((c) => field(row[c])).join(',')}\n`);
  }
  end() { return new Promise((r) => this.stream.end(r)); }
}

function rows(zip, file, onRow) {
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
const has = (zip, file) => execFileSync('unzip', ['-Z1', zip]).toString().split('\n').includes(file);

const FILES = ['agency', 'routes', 'trips', 'stop_times', 'stops', 'calendar', 'calendar_dates', 'shapes', 'frequencies'];
const state = new Map();
for (const s of stale) {
  const dir = path.join(TMP, s.feed);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  state.set(s.feed, {
    dir, agencies: new Set([].concat(s.agency)),
    tables: Object.fromEntries(FILES.map((f) => [f, new Table(path.join(dir, `${f}.txt`))])),
    routes: new Set(), trips: new Set(), stops: new Set(), stopRows: new Map(),
  });
}

const sources = [...new Set(stale.flatMap((s) => s.merge))];
for (const [i, src] of sources.entries()) {
  const zip = path.join(RAW, `${src}.zip`);
  if (!fs.existsSync(zip)) { console.warn(`merge: ${src} not downloaded, skipping`); continue; }
  const users = stale.filter((s) => s.merge.includes(src));
  const tag = `${i}:`;
  const routeOf = new Map(); // route_id -> system feed id, for this source
  const tripOf = new Map(); // trip_id -> system feed id, kept from this source
  const services = new Map(); // service_id -> Set of system feeds
  const shapes = new Map(); // shape_id -> Set of system feeds

  for (const s of users) {
    const st = state.get(s.feed);
    await rows(zip, 'agency.txt', (r) => { if (st.agencies.has(r.agency_id) && !st.tables.agency.seen?.has(r.agency_id)) { (st.tables.agency.seen ||= new Set()).add(r.agency_id); st.tables.agency.add(r); } });
  }
  await rows(zip, 'routes.txt', (r) => {
    for (const s of users) {
      const st = state.get(s.feed);
      if (!st.agencies.has(r.agency_id)) continue;
      routeOf.set(r.route_id, s.feed);
      if (!st.routes.has(r.route_id)) { st.routes.add(r.route_id); st.tables.routes.add(r); }
    }
  });
  await rows(zip, 'trips.txt', (r) => {
    const feed = routeOf.get(r.route_id);
    if (!feed) return;
    const st = state.get(feed);
    if (st.trips.has(r.trip_id)) return; // already taken from an earlier source
    st.trips.add(r.trip_id);
    tripOf.set(r.trip_id, feed);
    (services.get(r.service_id) ?? services.set(r.service_id, new Set()).get(r.service_id)).add(feed);
    if (r.shape_id) (shapes.get(r.shape_id) ?? shapes.set(r.shape_id, new Set()).get(r.shape_id)).add(feed);
    st.tables.trips.add({ ...r, service_id: tag + r.service_id, shape_id: r.shape_id ? tag + r.shape_id : '' });
  });
  await rows(zip, 'stop_times.txt', (r) => {
    const feed = tripOf.get(r.trip_id);
    if (!feed) return;
    const st = state.get(feed);
    st.stops.add(r.stop_id);
    st.tables.stop_times.add(r);
  });
  if (has(zip, 'frequencies.txt')) await rows(zip, 'frequencies.txt', (r) => { const feed = tripOf.get(r.trip_id); if (feed) state.get(feed).tables.frequencies.add(r); });
  await rows(zip, 'stops.txt', (r) => {
    for (const s of users) {
      const st = state.get(s.feed);
      if (st.stops.has(r.stop_id) && !st.stopRows.has(r.stop_id)) { st.stopRows.set(r.stop_id, 1); st.tables.stops.add(r); }
    }
  });
  const withService = (r, add) => { for (const feed of services.get(r.service_id) ?? []) add(state.get(feed), { ...r, service_id: tag + r.service_id }); };
  await rows(zip, 'calendar.txt', (r) => withService(r, (st, row) => st.tables.calendar.add(row)));
  if (has(zip, 'calendar_dates.txt')) await rows(zip, 'calendar_dates.txt', (r) => withService(r, (st, row) => st.tables.calendar_dates.add(row)));
  await rows(zip, 'shapes.txt', (r) => { for (const feed of shapes.get(r.shape_id) ?? []) state.get(feed).tables.shapes.add({ ...r, shape_id: tag + r.shape_id }); });
  console.log(`merge: read ${src} for ${users.map((s) => s.slug).join(', ')}`);
}

for (const s of stale) {
  const st = state.get(s.feed);
  await Promise.all(Object.values(st.tables).map((t) => t.end()));
  const files = FILES.map((f) => `${f}.txt`).filter((f) => st.tables[f.replace('.txt', '')].cols);
  const tmp = `${out(s)}.part`;
  fs.rmSync(tmp, { force: true });
  execFileSync('zip', ['-q', '-j', tmp, ...files.map((f) => path.join(st.dir, f))]);
  fs.renameSync(tmp, out(s));
  fs.rmSync(st.dir, { recursive: true, force: true });
  console.log(`merge: ${s.feed}: ${st.routes.size} routes, ${st.trips.size} trips, ${st.stops.size} stops from ${s.merge.length} files`);
}
