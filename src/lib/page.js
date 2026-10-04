/**
 * What every system page needs to speak the local language of timetables: the country's clock
 * (24-hour in the UK and Ireland), its word ("timetable" or "schedule"), the mode riders wait for
 * and the URL base. One place, so the five page templates cannot drift apart.
 */
import { COUNTRIES } from './data.js';
import { clockText, sharedMode, sharedVehicle, cap, plural } from './format.js';

export const LANG = { ca: 'en-CA', uk: 'en-GB', ie: 'en-IE', au: 'en-AU', nz: 'en-NZ', us: 'en-US' };

export function ctxFor(system) {
  const c = { cc: system.cc, ...COUNTRIES[system.cc] };
  const mode = sharedMode(system.routes, system);
  const veh = sharedVehicle(system.routes, system);
  return {
    c,
    h24: c.h24,
    word: c.word,
    Word: cap(c.word),
    lang: LANG[system.cc] || 'en',
    base: `/${system.cc}/${system.slug}`,
    /** "bus", "tram", "transit" (a mix) */
    mode,
    /** "bus", "train", "departure" (a mix) */
    veh,
    vehs: veh === 'departure' ? 'departures' : plural(veh),
    t: (m) => clockText(m, c.h24),
  };
}

/** Dates as the country writes them: "October 12, 2026" in North America, "12 October 2026" elsewhere. */
export function dateFor(iso, cc) {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(cc === 'us' || cc === 'ca' ? 'en-US' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
