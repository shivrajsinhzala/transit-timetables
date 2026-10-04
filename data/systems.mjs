/**
 * The BC Transit systems this site covers, keyed by Mobility Database feed id.
 *
 * Every feed here is published by BC Transit under its open data terms
 * (https://www.bctransit.com/open-data/terms-of-use): use, reproduction and redistribution are
 * allowed provided BC Transit is named as the source, and its logos and marks are not used. So
 * pages name the city, not the brand, and every page carries the attribution in the footer.
 *
 * `name` is what riders search for — the city or valley, not BC Transit's system name.
 * `slug` is the URL segment and must never change once published.
 */
/** Regions group the towns on the home and BC pages: how a rider thinks about the province. */
export const REGIONS = [
  { slug: 'island', name: 'Vancouver Island and the Gulf Islands' },
  { slug: 'okanagan', name: 'Okanagan and Thompson' },
  { slug: 'coast', name: 'Fraser Valley, Sea to Sky and Sunshine Coast' },
  { slug: 'kootenay', name: 'Kootenays and Columbia' },
  { slug: 'north', name: 'North and Cariboo' },
];

export const SYSTEMS = {
  'mdb-2571': { slug: 'victoria', region: 'island', name: 'Victoria', area: 'Greater Victoria, Vancouver Island' },
  'mdb-2555': { slug: 'kelowna', region: 'okanagan', name: 'Kelowna', area: 'Kelowna, West Kelowna and Lake Country' },
  'mdb-2551': { slug: 'kamloops', region: 'okanagan', name: 'Kamloops', area: 'Kamloops' },
  'mdb-2473': { slug: 'nanaimo', region: 'island', name: 'Nanaimo', area: 'Nanaimo and the Regional District of Nanaimo' },
  'mdb-1991': { slug: 'fraser-valley', region: 'coast', name: 'Fraser Valley', area: 'Abbotsford, Mission, Chilliwack, Agassiz-Harrison and Hope' },
  'mdb-2510': { slug: 'prince-george', region: 'north', name: 'Prince George', area: 'Prince George' },
  'mdb-2508': { slug: 'vernon', region: 'okanagan', name: 'Vernon', area: 'Vernon, Coldstream and the Shuswap' },
  'mdb-2532': { slug: 'penticton', region: 'okanagan', name: 'Penticton', area: 'Penticton and the South Okanagan-Similkameen' },
  'mdb-2579': { slug: 'west-kootenay', region: 'kootenay', name: 'West Kootenay', area: 'Nelson, Castlegar, Trail and Rossland' },
  'mdb-2528': { slug: 'cowichan-valley', region: 'island', name: 'Cowichan Valley', area: 'Duncan and the Cowichan Valley' },
  'mdb-2524': { slug: 'comox-valley', region: 'island', name: 'Comox Valley', area: 'Courtenay, Comox and Cumberland' },
  'mdb-2520': { slug: 'east-kootenay', region: 'kootenay', name: 'East Kootenay', area: 'Cranbrook, Kimberley, the Elk Valley and Columbia Valley' },
  'mdb-2462': { slug: 'terrace-kitimat', region: 'north', name: 'Terrace and Kitimat', area: 'Terrace, Kitimat and the Hazeltons' },
  'mdb-2514': { slug: 'campbell-river', region: 'island', name: 'Campbell River', area: 'Campbell River' },
  'mdb-2563': { slug: 'squamish', region: 'coast', name: 'Squamish', area: 'Squamish' },
  'mdb-2583': { slug: 'whistler', region: 'coast', name: 'Whistler', area: 'Whistler' },
  'mdb-2567': { slug: 'sunshine-coast', region: 'coast', name: 'Sunshine Coast', area: 'Sechelt, Gibsons and the Langdale ferry' },
  'mdb-2529': { slug: 'powell-river', region: 'coast', name: 'Powell River', area: 'Powell River (qathet)' },
  'mdb-2543': { slug: 'prince-rupert', region: 'north', name: 'Prince Rupert', area: 'Prince Rupert and Port Edward' },
  'mdb-2463': { slug: 'quesnel', region: 'north', name: 'Quesnel', area: 'Quesnel' },
  'mdb-2547': { slug: 'fort-st-john', region: 'north', name: 'Fort St. John', area: 'Fort St. John' },
  'mdb-2587': { slug: 'williams-lake', region: 'north', name: 'Williams Lake', area: 'Williams Lake' },
  'mdb-710': { slug: 'dawson-creek', region: 'north', name: 'Dawson Creek', area: 'Dawson Creek' },
  'mdb-2467': { slug: 'mount-waddington', region: 'island', name: 'Port Hardy and Port McNeill', area: 'Mount Waddington: Port Hardy, Port McNeill and Fort Rupert' },
  'mdb-2466': { slug: 'salt-spring-island', region: 'island', name: 'Salt Spring Island', area: 'Salt Spring Island' },
  'mdb-2471': { slug: 'merritt', region: 'okanagan', name: 'Merritt', area: 'Merritt' },
  'mdb-2575': { slug: 'tofino-ucluelet', region: 'island', name: 'Tofino and Ucluelet', area: 'Tofino and Ucluelet' },
  'mdb-2464': { slug: 'revelstoke', region: 'kootenay', name: 'Revelstoke', area: 'Revelstoke' },
  'mdb-2515': { slug: 'clearwater', region: 'okanagan', name: 'Clearwater', area: 'Clearwater and Wells Gray Country' },
  'mdb-2470': { slug: 'pemberton', region: 'coast', name: 'Pemberton', area: 'Pemberton Valley' },
  'mdb-2536': { slug: 'creston-valley', region: 'kootenay', name: 'Creston Valley', area: 'Creston Valley' },
  'mdb-2469': { slug: '100-mile-house', region: 'north', name: '100 Mile House', area: '100 Mile House and 108 Ranch' },
  'mdb-2472': { slug: 'smithers', region: 'north', name: 'Smithers', area: 'Smithers, Telkwa and Witset' },
};

/**
 * BC statutory holidays inside the windows a build looks at. GTFS says *that* a date runs a
 * different timetable, never *why*; this only supplies the name shown next to it.
 */
export const HOLIDAYS = {
  '2026-10-12': 'Thanksgiving',
  '2026-11-11': 'Remembrance Day',
  '2026-12-25': 'Christmas Day',
  '2026-12-26': 'Boxing Day',
  '2027-01-01': "New Year's Day",
  '2027-02-15': 'Family Day',
  '2027-03-26': 'Good Friday',
  '2027-03-29': 'Easter Monday',
  '2027-05-24': 'Victoria Day',
  '2027-07-01': 'Canada Day',
  '2027-08-02': 'BC Day',
  '2027-09-06': 'Labour Day',
  '2027-09-30': 'National Day for Truth and Reconciliation',
  '2027-10-11': 'Thanksgiving',
};
