/**
 * /llms.txt: a plain-language map of the site for AI assistants and answer engines
 * (https://llmstxt.org). Generated from the same data as the pages, so it never goes stale.
 */
import { SYSTEM_INDEX, countries, isMain, META } from '../lib/data.js';
import { plain } from '../lib/format.js';

export function GET() {
  if (!isMain) return new Response('');
  const routes = SYSTEM_INDEX.reduce((a, s) => a + s.routes, 0);
  const site = 'https://transit.shivrajsinh.in';
  const all = countries();
  const builtOn = SYSTEM_INDEX.map((s) => s.builtOn).sort().at(-1);
  const lines = [
    '# Stopwatch',
    '',
    `> Free, independent bus, tram, train and ferry timetables for ${SYSTEM_INDEX.length} transit systems in ${all.map((c) => c.name).join(', ')}: ${routes.toLocaleString('en')} routes, every stop, with the next scheduled departure highlighted. Built from each operator's open data (GTFS), refreshed weekly; last refresh ${builtOn}. Scheduled times only, not live arrivals. Not affiliated with any operator.`,
    '',
    'Pages follow a fixed pattern:',
    `- Country: ${site}/<country code> (every system in that country), e.g. ${site}/uk`,
    `- System: ${site}/<country>/<system> (all routes, map, holidays), e.g. ${site}/ie/dublin-bus`,
    `- Route: ${site}/<country>/<system>/<route> (full timetable both directions, first/last departure, frequency), e.g. ${site}/ca/kelowna/route-8`,
    `- Stop: ${site}/<country>/<system>/stop/<stop number> (every departure at that stop by day), e.g. ${site}/ca/kelowna/stop/103075`,
    `- Interchange: ${site}/<country>/<system>/hub/<name> (departures from every bay), e.g. ${site}/ca/kelowna/hub/orchard-park-exchange`,
    '',
    'Times are written as riders in each country write them: 24-hour in the UK and Ireland, 12-hour elsewhere.',
    '',
    ...all.flatMap((c) => [`## ${c.name}`, '', ...[...c.systems].sort((a, b) => b.routes - a.routes).map((s) => `- [${s.name}](${site}/${s.key}): ${s.routes} routes, ${s.area}. Data: ${plain(META[s.key]?.attribution?.text)} (${plain(META[s.key]?.attribution?.license)})`), '']),
    '## About',
    `- [About Stopwatch](${site}/about): who makes it, every data source and licence, update schedule`,
    '',
  ];
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
