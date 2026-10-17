/**
 * Town-to-town journeys: for every pair of places a system links directly (no change of
 * vehicle), when each bus or train leaves the first and reaches the second on each day of a
 * usual week. That is what "cork to macroom bus" and "stawell to horsham" ask, and what a route
 * page cannot answer: it lists one route's timepoints, and a pair of towns can be served by
 * several routes or by stops that are not timepoints.
 *
 * - A trip's stops are grouped into visits to places (scripts/places.mjs); every later place it
 *   reaches is a journey from every earlier one. Boarding must be allowed where it leaves and
 *   alighting where it arrives (coaches that only set down in the first towns are not offered).
 * - Each visit is timed at its stop nearest the place's centre, and only stops in the middle of
 *   a place count: a bus that skirts the edge of Hertford on its way to Ware has not been to
 *   Hertford, and two stops either side of the town boundary are not a journey between towns.
 * - Weekdays are computed from the same sample dates as the timetables, then shown as weekdays,
 *   Saturday and Sunday (see groupDays), with the odd departure that runs only some weekdays
 *   marked as such rather than splitting the week into four tabs.
 * - A pair gets a page when its towns are at least MIN_KM apart and it has MIN_WEEKLY
 *   departures a week. A big network links hundreds of suburbs to each other, so each system
 *   keeps at most maxPairs: first every town's main link each way, the destination it has most
 *   service to and the place it has most service from (a village's page to and from its market
 *   town is what its people search for: "bus from bovingdon to hemel hempstead", "waterford to
 *   mooncoin bus"), then the best of the rest.
 */
import { placeFinder, localName, km, reach } from './places.mjs';

const MIN_KM = 3;
const MIN_WEEKLY = 5;
const MAX_HOURS = 12;

const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * How many pairs a system may publish: more routes or more towns, more pairs (V/Line's 48
 * coach routes reach 150 towns), up to 1,000. Google crawls a young site a couple of thousand
 * pages a day, so the pairs riders search for most come first and the long tail of
 * suburb-to-suburb pairs in a city network is left out.
 */
export const maxPairs = (routes, towns) => Math.min(1000, Math.max(150, routes * 5, towns * 3));

/**
 * "Dublin Airport Zone 15", "Melbourne Airport T1/Departure Dr": an airport is a place of its own
 * (GeoNames lists towns, not airports), and one people travel to and from a great deal: "bus
 * times to dublin airport", "frankston to melbourne airport". Streets named after an airport
 * ("Airport Way & Aerospace") are not one.
 */
const AIRPORT = /\b((?:[A-Z][\w'.]*\s){0,2}[A-Z][\w'.]*\sAirport)\b(?!\s+(?:Rd|Road|Way|Dr|Drive|Blvd|Boulevard|Ave|Avenue|St|Street|Pkwy|Parkway|Lane|Ln|Ct|Court|Hwy|Highway|Industrial|Business|Retail|Park|Est|Estate|Rdbt|Roundabout|Hotel|Link)\b)/;
const AIRPORT_POP = 100_000; // ranks an airport with a large town: it is one of a region's main destinations
// Stops at an airport named for nothing but it (Dublin Airport's are "Airport Zone 15"): the airport
// takes the name of the biggest city within 30 km. "Airport Rnbt" and "Airport Parking" are not it.
const BARE_AIRPORT = /^Airport(?:\s+(?:Zone|Terminal|T\d|Arrivals|Departures|Bus Station|Coach Station|Interchange)\b|\s*\(|$)/i;

export function buildJourneys({ cc, trips, stops, slugOf, sample, usual, servicesOn, dayKey, dayLabel, routeCount }) {
  const find = placeFinder(cc);
  const placeOf = new Map();
  const fromCentre = new Map(); // stop_id -> km from its place's centre
  const airports = new Map(); // name -> place
  const airportOf = (s) => {
    let name = null;
    const m = AIRPORT.exec(s.stop_name || '');
    if (m && !/^(Near|Opp|Opposite|At|Outside|Before|After)\b/i.test(m[1])) name = m[1].replace(/^The\s/, '');
    else if (BARE_AIRPORT.test(s.stop_name || '')) {
      const city = find.biggest(Number(s.stop_lat), Number(s.stop_lon), 30);
      if (city) name = `${city.name} Airport`;
    }
    if (!name) return null;
    if (!airports.has(name)) airports.set(name, { id: `air:${name}`, name, alt: [], lat: Number(s.stop_lat), lon: Number(s.stop_lon), pop: AIRPORT_POP, kind: 'AIRP' });
    return airports.get(name);
  };
  const at = (id) => {
    if (!placeOf.has(id)) {
      const s = stops.get(id);
      const pt = s && { lat: Number(s.stop_lat), lon: Number(s.stop_lon) };
      const air = s && airportOf(s);
      const p = air || (pt ? find(pt.lat, pt.lon) : null);
      placeOf.set(id, p);
      // Every stop at an airport serves it: terminals can be a kilometre or two apart.
      if (p) fromCentre.set(id, air ? 0 : km(pt, p));
    }
    return placeOf.get(id);
  };
  // A village's GeoNames point can be a kilometre from its bus stop (Mooncoin's is 1.1 km away).
  const central = (id) => fromCentre.get(id) <= Math.max(1.5, 0.6 * reach(placeOf.get(id).pop));
  const nearest = (list) => list.reduce((b, s) => (!b || fromCentre.get(s.id) < fromCentre.get(b.id) ? s : b), null);

  const weekdays = [0, 1, 2, 3, 4, 5, 6].filter((w) => sample[w]);
  const byWeekday = new Map(); // weekday -> Map(pairKey -> [[dep, arr, route_id, fromStopId, toStopId]])
  const far = new Map(); // pairKey -> km, or false when too close
  for (const w of weekdays) {
    const same = weekdays.find((v) => v < w && usual[v] === usual[w]);
    if (same != null) { byWeekday.set(w, byWeekday.get(same)); continue; }
    const svc = servicesOn.get(sample[w]) || new Set();
    const out = new Map();
    for (const t of trips.values()) {
      if (!svc.has(t.service_id) || !slugOf.has(t.route_id)) continue;
      const visits = [];
      for (const st of t.stops) {
        if (st.min == null) continue;
        const p = at(st.id);
        if (!p) continue;
        const last = visits.at(-1);
        if (last && last.p === p) last.stops.push(st); else visits.push({ p, stops: [st] });
      }
      if (visits.length < 2) continue;
      const seen = new Map();
      for (let i = 0; i < visits.length - 1; i++) {
        const dep = nearest(visits[i].stops.filter((s) => s.board && central(s.id)));
        if (!dep) continue;
        for (let j = i + 1; j < visits.length; j++) {
          const a = visits[i].p, b = visits[j].p;
          if (a === b) continue;
          const k = `${a.id}>${b.id}`;
          if (!far.has(k)) { const d = km(a, b); far.set(k, d >= MIN_KM ? d : false); }
          if (!far.get(k)) continue;
          const arr = nearest(visits[j].stops.filter((s) => s.alight && central(s.id)));
          if (!arr || arr.min <= dep.min || arr.min - dep.min > MAX_HOURS * 60) continue;
          const prev = seen.get(k);
          // A loop that passes a town twice: the shorter ride is the one anyone would take.
          if (!prev || arr.min - dep.min < prev[1] - prev[0]) seen.set(k, [dep.min, arr.min, t.route_id, dep.id, arr.id]);
        }
      }
      for (const [k, j] of seen) { if (!out.has(k)) out.set(k, []); out.get(k).push(j); }
    }
    byWeekday.set(w, out);
  }

  // Per pair: every departure, with the weekdays it runs on. A departure is its time, route and
  // stops, so a trip that arrives three minutes earlier on Fridays is still one row (with the
  // arrival of the first day it runs), not three rows that differ by a minute.
  const pairs = new Map();
  for (const w of weekdays) {
    for (const [k, list] of byWeekday.get(w)) {
      if (!pairs.has(k)) pairs.set(k, new Map());
      const rows = pairs.get(k);
      for (const j of list) {
        const id = `${j[0]}|${j[2]}|${j[3]}|${j[4]}`;
        if (!rows.has(id)) rows.set(id, { j, days: new Set() });
        rows.get(id).days.add(w);
      }
    }
  }

  const placeById = new Map([...placeOf.values()].filter(Boolean).map((p) => [String(p.id), p]));
  const scored = [];
  for (const [k, rows] of pairs) {
    const weekly = [...rows.values()].reduce((n, r) => n + r.days.size, 0);
    if (weekly < MIN_WEEKLY) continue;
    const [a, b] = k.split('>').map((id) => placeById.get(id));
    // Bigger places, more service and longer rides are searched more. Service counts only a
    // little: a bus every ten minutes is caught without a timetable, a bus four times a day is not.
    const score = Math.log10(Math.max(a.pop, 500) * Math.max(b.pop, 500)) * Math.log10(weekly + 1) * (1 + Math.log10(far.get(k)) / 2);
    scored.push({ k, a, b, rows: [...rows.values()], weekly, score });
  }
  scored.sort((x, y) => y.score - x.score || x.k.localeCompare(y.k));
  const cap = maxPairs(routeCount, new Set(scored.flatMap((x) => [x.a, x.b])).size);
  // Each town's main link out and main link in: most service, then the bigger place at the other end.
  const pull = (x, other) => x.weekly ** 0.7 * Math.log10(Math.max(other.pop, 500));
  const mainOut = new Map(), mainIn = new Map();
  for (const x of scored) {
    if (!mainOut.has(x.a) || pull(x, x.b) > pull(mainOut.get(x.a), mainOut.get(x.a).b)) mainOut.set(x.a, x);
    if (!mainIn.has(x.b) || pull(x, x.a) > pull(mainIn.get(x.b), mainIn.get(x.b).a)) mainIn.set(x.b, x);
  }
  const must = new Set([...new Set([...mainOut.values(), ...mainIn.values()])].sort((x, y) => y.score - x.score).slice(0, cap));
  const kept = [...must, ...scored.filter((x) => !must.has(x)).slice(0, cap - must.size)].sort((x, y) => y.score - x.score || x.k.localeCompare(y.k));

  // Names riders use (see localName), from the stops in each place and where its buses go.
  const texts = new Map();
  for (const [id, p] of placeOf) {
    if (!p) continue;
    if (!texts.has(p.id)) texts.set(p.id, []);
    texts.get(p.id).push(stops.get(id)?.stop_name || '');
  }
  for (const t of trips.values()) {
    const last = t.stops.at(-1);
    const p = last && at(last.id);
    if (p && t.trip_headsign) texts.get(p.id)?.push(t.trip_headsign);
  }
  const used = [...new Set(kept.flatMap((x) => [x.a, x.b]))];
  const named = used.map((p) => ({ p, name: localName(p, texts.get(p.id) || []) }));
  // Two places with one name in one system (two Newports): the one with more journeys keeps it.
  const journeysOf = (p) => kept.filter((x) => x.a === p || x.b === p).length;
  const bySlug = new Map();
  for (const n of named.sort((x, y) => journeysOf(y.p) - journeysOf(x.p) || y.p.pop - x.p.pop)) {
    const slug = slugify(n.name);
    if (!slug || bySlug.has(slug)) continue;
    bySlug.set(slug, { ...n, slug });
  }
  const placeIdx = new Map([...bySlug.values()].map((n, i) => [n.p.id, i]));
  const places = [...bySlug.values()].map((n) => ({ slug: n.slug, name: n.name, lat: n.p.lat, lon: n.p.lon, pop: n.p.pop }));

  const stopCode = (id) => stops.get(id)?.stop_code || id;
  const stopNames = {};
  const out = [];
  for (const x of kept) {
    if (!placeIdx.has(x.a.id) || !placeIdx.has(x.b.id)) continue;
    const routes = [...new Set(x.rows.map((r) => slugOf.get(r.j[2])))];
    const days = groupDays(x.rows).map((g) => ({ key: dayKey(g.days), label: dayLabel(g.days), days: g.days, rows: g.rows }));
    const trips = {};
    for (const d of days) {
      trips[d.key] = d.rows.map(({ j: [dep, arr, rid, from, to], on }) => {
        const fc = stopCode(from), tc = stopCode(to);
        stopNames[fc] = stops.get(from)?.stop_name || fc;
        stopNames[tc] = stops.get(to)?.stop_name || tc;
        // The weekdays a departure runs on are given only when it is not every day of its tab.
        return [dep, arr, routes.indexOf(slugOf.get(rid)), fc, tc, ...(on.length < d.days.length ? [on] : [])];
      });
      delete d.rows;
    }
    out.push({ a: placeIdx.get(x.a.id), b: placeIdx.get(x.b.id), km: Math.round(km(x.a, x.b) * 10) / 10, weekly: x.weekly, routes, days, trips });
  }
  return { places, pairs: out, stops: stopNames, candidates: scored.length };
}

/**
 * The tabs a pair's departures are shown in: weekdays, Saturday and Sunday, as riders think of
 * them, each labelled with the days it really has service ("Monday, Wednesday and Friday" on a
 * market-day route), and merged when they are the same ("Monday to Saturday", "Every day").
 */
function groupDays(rows) {
  const tabs = [[0, 1, 2, 3, 4], [5], [6]].map((base) => {
    const inTab = rows.map((r) => ({ j: r.j, on: base.filter((w) => r.days.has(w)) })).filter((r) => r.on.length);
    const days = base.filter((w) => inTab.some((r) => r.on.includes(w)));
    return { days, rows: inTab.sort((a, b) => a.j[0] - b.j[0] || a.j[1] - b.j[1]) };
  }).filter((g) => g.rows.length);
  const whole = (g) => g.rows.every((r) => r.on.length === g.days.length);
  const same = (g, h) => whole(g) && whole(h) && g.rows.length === h.rows.length && g.rows.every((r, i) => r.j[0] === h.rows[i].j[0] && r.j[2] === h.rows[i].j[2]);
  const merged = [];
  for (const g of tabs) {
    const last = merged.at(-1);
    if (last && same(last, g)) {
      last.days = [...last.days, ...g.days];
      last.rows = last.rows.map((r) => ({ ...r, on: [...r.on, ...g.days] }));
    } else merged.push(g);
  }
  return merged;
}
