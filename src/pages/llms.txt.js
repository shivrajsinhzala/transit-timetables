/**
 * /llms.txt: a plain-language map of the site for AI assistants and answer engines
 * (https://llmstxt.org). Generated from the same data as the pages, so it never goes stale.
 */
import { SYSTEM_INDEX, REGIONS, hubs } from '../lib/data.js';

export function GET() {
  const routes = SYSTEM_INDEX.reduce((a, s) => a + s.routes, 0);
  const site = 'https://transit.shivrajsinh.in';
  const lines = [
    '# Stopwatch',
    '',
    `> Free, independent bus timetables for ${SYSTEM_INDEX.length} British Columbia (Canada) transit systems run by BC Transit: ${routes} routes, every stop, with the next scheduled bus highlighted. Built from BC Transit open data (GTFS), refreshed weekly; last refresh ${SYSTEM_INDEX[0].builtOn}. Scheduled times only, not live arrivals. Not affiliated with BC Transit.`,
    '',
    'Pages follow a fixed pattern:',
    `- Town: ${site}/bc/<town> (all routes, map, holidays), e.g. ${site}/bc/kelowna`,
    `- Route: ${site}/bc/<town>/route-<number> (full timetable both directions, first/last bus, frequency), e.g. ${site}/bc/kelowna/route-8`,
    `- Stop: ${site}/bc/<town>/stop/<stop number> (every departure at that stop by day), e.g. ${site}/bc/kelowna/stop/103075`,
    `- Exchange: ${site}/bc/<town>/hub/<name> (departures from every bay), e.g. ${site}/bc/kelowna/hub/orchard-park-exchange`,
    '',
    '## Towns',
    ...REGIONS.flatMap((r) => [``, `### ${r.name}`, ...SYSTEM_INDEX.filter((s) => s.region === r.slug).map((s) => `- [${s.name}](${site}/bc/${s.slug}): ${s.routes} routes, ${s.area}`)]),
    '',
    '## Exchanges',
    ...SYSTEM_INDEX.flatMap((s) => hubs(s.slug).slice(0, 5).map((h) => `- [${h.name}, ${s.name}](${site}/bc/${s.slug}/hub/${h.slug})`)),
    '',
    '## About',
    `- [About Stopwatch](${site}/about): who makes it, data source, update schedule`,
    `- [Data source: BC Transit open data](https://www.bctransit.com/open-data/)`,
    '',
  ];
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
