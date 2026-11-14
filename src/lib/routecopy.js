/**
 * The words at the top of a route page, written from its timetable. Every number here is read
 * from the route's own data; nothing is filled in. The sentence shape follows what kind of service
 * the route is, so a turn-up-and-go tram, an hourly country bus and a two-trip school run do not
 * read as the same paragraph with the numbers swapped:
 *
 *   frequent  (daytime gap <= 12 min)  "turn up and go"
 *   regular   (<= 20 min)              "every N min most of the day"
 *   half-hour (<= 35 min)              "about every half hour"
 *   hourly    (<= 75 min)              "roughly hourly, so plan around the times"
 *   sparse    (no gap, or longer)      the trips are listed: "N buses: 7:05 am, ..."
 */
import { every, plural } from './format.js';

export function serviceClass(summary) {
  const gap = summary?.gap;
  if (!gap) return 'sparse';
  if (gap <= 12) return 'frequent';
  if (gap <= 20) return 'regular';
  if (gap <= 35) return 'halfhour';
  if (gap <= 75) return 'hourly';
  return 'sparse';
}

/** Typical end-to-end minutes of a direction on a day: the median of first-to-last-column times. */
export function endToEnd(dir, dayKey) {
  const rows = dir?.schedules?.[dayKey] || [];
  const d = rows
    .map((r) => (r[0] != null && r.at(-1) != null ? r.at(-1) - r[0] : null))
    .filter((x) => x != null && x > 0)
    .sort((a, b) => a - b);
  return d.length ? d[Math.floor(d.length / 2)] : null;
}

export function minutesText(m) {
  if (m == null) return '';
  if (m < 60) return `${m} minutes`;
  const h = Math.floor(m / 60), r = m % 60;
  return `${h} hour${h > 1 ? 's' : ''}${r ? ` ${r} minutes` : ''}`;
}

const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

/**
 * The intro sentences after the first one (which names the route and where it goes).
 * ctx: { route, t (clock), v (vehicle word), stopW, longest (direction), mainDay, mainSummary }
 */
export function routeIntro({ route, t, v, stopW, longest, mainDay, mainSummary }) {
  const vs = plural(v);
  const out = [];
  const cls = serviceClass(mainSummary);
  const once = mainSummary.first === mainSummary.last;
  const day = mainDay.label;

  if (once) {
    out.push(`${day}, it runs once, at ${t(mainSummary.first)}.`);
  } else if (cls === 'frequent') {
    out.push(`${day}, it is a turn-up-and-go service: ${every(mainSummary.gap)} through the day, from ${t(mainSummary.first)} until the last ${v} at ${t(mainSummary.last)}, ${mainSummary.trips} ${vs} in all.`);
  } else if (cls === 'regular') {
    out.push(`${day}, there is a ${v} ${every(mainSummary.gap)} for most of the day, ${mainSummary.trips} in all between ${t(mainSummary.first)} and ${t(mainSummary.last)}.`);
  } else if (cls === 'halfhour') {
    out.push(`${day}, ${vs} come about every half hour (${every(mainSummary.gap)} at midday): ${mainSummary.trips} between ${t(mainSummary.first)} and ${t(mainSummary.last)}.`);
  } else if (cls === 'hourly') {
    out.push(`${day}, the service is roughly hourly (${every(mainSummary.gap)}), so it is worth planning around the times: the first leaves at ${t(mainSummary.first)} and the last at ${t(mainSummary.last)}.`);
  } else {
    out.push(`${day}, there ${mainSummary.trips === 1 ? 'is 1 trip' : `are ${mainSummary.trips} trips`}, the first at ${t(mainSummary.first)} and the last at ${t(mainSummary.last)}.`);
  }

  // Weekends, measured against the main day's trips.
  const sat = route.days.find((d) => d.days?.includes(5));
  const sun = route.days.find((d) => d.days?.includes(6));
  const satS = sat && route.summary[sat.key];
  const sunS = sun && route.summary[sun.key];
  if (sat === mainDay || sun === mainDay) {
    // A route whose main timetable covers the weekend too says nothing more about it.
  } else if (!satS && !sunS) {
    out.push(`There is no weekend service.`);
  } else {
    // Trip counts only: with night services a weekend "first" and "last" (2:28 am to 3:28 am) misleads.
    const weekdayMain = [0, 1, 2, 3, 4].every((i) => mainDay.days?.includes(i));
    const base = weekdayMain ? 'weekdays' : day;
    const share = (s) => pct(s.trips, mainSummary.trips);
    if (satS && sunS && sat === sun) {
      out.push(share(satS) >= 90
        ? `Weekends are much the same, ${satS.trips} trips a day.`
        : `At weekends it runs ${satS.trips} ${satS.trips === 1 ? 'trip' : 'trips'} a day, about ${share(satS)}% of ${base}.`);
    } else if (satS && sunS && share(satS) >= 90 && share(sunS) >= 90) {
      out.push(`Weekends are much the same: ${satS.trips} trips on Saturday and ${sunS.trips} on Sunday.`);
    } else {
      const parts = [satS ? `${satS.trips} on Saturday` : 'none on Saturday', sunS ? `${sunS.trips} on Sunday` : 'none on Sunday'];
      out.push(`Weekend ${vs}: ${parts.join(' and ')}${satS || sunS ? `, against ${mainSummary.trips} on ${base}` : ''}.`);
    }
  }

  const e2e = endToEnd(longest, mainDay.key);
  const stopsText = `${longest.stops.length} ${stopW}s`;
  if (e2e) out.push(`End to end it takes about ${minutesText(e2e)} and calls at ${stopsText}.`);
  else out.push(`The longest direction calls at ${stopsText}.`);
  return out.join(' ');
}
