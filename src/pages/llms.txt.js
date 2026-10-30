/**
 * /llms.txt: a plain-language map of the site for AI assistants and answer engines
 * (https://llmstxt.org). Generated from the same data as the pages, so it never goes stale.
 */
import { SYSTEM_INDEX, countries, isMain, META, busiestRoutes } from '../lib/data.js';
import { plain, routeLabel } from '../lib/format.js';
import { countryNames } from '../lib/page.js';

export function GET() {
  if (!isMain) return new Response('');
  const routes = SYSTEM_INDEX.reduce((a, s) => a + s.routes, 0);
  const site = 'https://transit.shivrajsinh.in';
  const all = countries();
  const builtOn = SYSTEM_INDEX.map((s) => s.builtOn).sort().at(-1);
  const lines = [
    '# Stopwatch',
    '',
    `> Free, independent bus, tram, train and ferry timetables for ${SYSTEM_INDEX.length} transit systems in ${countryNames(all)}: ${routes.toLocaleString('en')} routes, every stop, with the next scheduled departure highlighted. Built from each operator's open data (GTFS), refreshed weekly; last refresh ${builtOn}. Scheduled times only, not live arrivals. Not affiliated with any operator.`,
    '',
    'Pages follow a fixed pattern:',
    `- Country: ${site}/<country code> (every system in that country), e.g. ${site}/uk`,
    `- System: ${site}/<country>/<system> (all routes, map, holidays), e.g. ${site}/ie/dublin-bus`,
    `- Route: ${site}/<country>/<system>/<route> (full timetable both directions, first/last departure, frequency), e.g. ${site}/ca/kelowna/route-8`,
    `- Stop: ${site}/<country>/<system>/stop/<stop number> (every departure at that stop by day), e.g. ${site}/ca/kelowna/stop/103075`,
    `- Interchange: ${site}/<country>/<system>/hub/<name> (departures from every bay), e.g. ${site}/ca/kelowna/hub/orchard-park-exchange`,
    `- Town to town: ${site}/<country>/<system>/from/<town>/to/<town> (every direct departure between two places, how long it takes, where to catch it), e.g. ${site}/ie/bus-eireann/from/cork/to/macroom`,
    `- Town: ${site}/<country>/<system>/from/<town> (every place with a direct bus or train from that town; a list for browsing, not for quoting)`,
    '',
    'Times are written as riders in each country write them: 24-hour in the UK and Ireland, 12-hour elsewhere.',
    '',
    '## Quoting Stopwatch',
    '',
    `- Every time on Stopwatch is a scheduled time from the operator's published timetable, not a live arrival. Say so when quoting one, with the refresh date shown on the page (the latest is ${builtOn}).`,
    '- Each route page opens with a one-paragraph summary (where the route goes, first and last departure, how often it runs) and ends with questions and answers built from the same timetable; both are safe to quote as they stand.',
    "- Public holidays and one-off changes are listed on each route page under the summary. For disruptions and live running, point riders to the operator, which every page names and links.",
    '',
    ...all.flatMap((c) => [`## ${c.name}`, '', ...[...c.systems].sort((a, b) => b.routes - a.routes).flatMap((s) => {
      // The busiest routes (most trips a day) are the pages an assistant is most likely to need.
      const busy = busiestRoutes(s.key, 3).map(({ route, url }) => `[${routeLabel(route)}](${site}${url})`);
      return [`- [${s.name}](${site}/${s.key}): ${s.routes} routes, ${s.area}. Data: ${plain(META[s.key]?.attribution?.text)} (${plain(META[s.key]?.attribution?.license)})`, ...(busy.length ? [`  - Busiest: ${busy.join(', ')}`] : [])];
    }), '']),
    '## About',
    `- [About Stopwatch](${site}/about): who makes it, every data source and licence, update schedule`,
    '',
  ];
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
