# Keywords, competitors and crawl: research, 24 Oct 2026

Run with the survey skills of the `aaron-marketing-skills` SEO/GEO bundle (keyword-research,
competitor-analysis, serp-analysis, content-gap-analysis), after the tune/implement pass in
`seo-geo-audit-2026-10-24.md`. Evidence is labelled **Measured** (Search Console, the server log or
a live fetch, with its window) or **Estimated**. No paid SEO tool is connected, so search volume,
keyword difficulty and competitor traffic are not available; where a skill asks for them the
table says so instead of guessing.

## 1. The finding that matters most: Google barely crawls the route pages

**Measured, Search Console page indexing (report dated ~11 Oct, the latest it shows):**

| Sitemap | Indexed | Not indexed |
|---|---|---|
| All transit sitemaps | 11.4k | 141k (140,062 "Discovered – currently not indexed") |
| `core.xml` (routes, networks, countries) | **1.02k** | 4.41k |
| `journeys-1.xml` | still processing | |

**Measured, nginx log, Googlebot user agent, transit URLs, 1–24 Oct (41,454 fetches):**

| Page type | Share of Googlebot fetches |
|---|---|
| Journey / from pages | 55.0% (18,282 of them on 19 Oct, the day after the journey sitemaps) |
| Stop pages with `noindex` | 31.2% |
| Indexable stop pages | 7.7% |
| Route pages | **2.4%** |

After `noindex` went live on quiet stop pages (22 Oct), Googlebot still fetched **320–350 noindex
stop pages a day and 25–47 route pages a day** (22–24 Oct). Noindex keeps a page out of results,
not out of the crawl, and every route page linked its quiet stops: route 201 (Leeds) carried 103
links to noindex stop pages, route 848 (Melbourne) 182 out of 182 (**Measured**, live HTML).

At 25–47 route fetches a day, Google needs over half a year to see ~9,000 route pages once. Route
pages are what people search for (route numbers are the largest query group below), so this is
the bottleneck for "more users": pages that are not indexed cannot rank at any position.

**Fixed in this branch:** pages link a stop only if its page is indexable (`linkedStopCodes`).
Quiet stops keep their pages, reachable from search and "Stops near me"; elsewhere their names
show as plain text. Applies to route timetables and diagrams, journey pages, hub bays (list and
board) and "Stops nearby". Expected effect (**Estimated**): the ~40% of Googlebot's daily fetches
that went to noindex stops moves to linked pages, routes and journeys first. Check the per-type
split again ~7 Nov with `seo/googlebot-crawl-split.py` on the server log.

## 2. Keyword research (Search Console queries, 28 days to 22 Oct)

**Measured.** The 1,000 queries Search Console lists add up to 6,648 of the 53.9k impressions and
13 of the 199 clicks: almost all demand is a long tail of one-off route, stop and town queries.

| Cluster | Queries | Impressions | Clicks | Avg position | Examples |
|---|---|---|---|---|---|
| Route number | 401 | 2,793 | 4 | 20.5 | "f4 bus route", "813 bus timetable", "151 bus", "bc5", "306" |
| Town to town | 363 | 2,175 | 3 | 25.8 | "anglesea to geelong", "stawell to horsham", "bus from bovingdon to hemel hempstead" |
| Network / generic | 76 | 450 | 2 | 33.7 | "bus eireann timetable", "warrington buses" |
| Stop / street | 43 | 324 | 2 | 19.2 | "7th street bus schedule", "stop 17 main north road" |
| Other | 117 | 906 | 2 | 27.5 | |

| Position | Queries | Impressions | Clicks |
|---|---|---|---|
| 1–3 | 2 | 4 | 1 |
| 4–6 | 47 | 213 | 2 |
| 7–10 | 338 | 2,271 | 7 |
| 11–20 | 110 | 875 | 2 |
| 21–40 | 306 | 2,041 | 0 |
| 41+ | 197 | 1,244 | 1 |

Intent: navigational/transactional for a timetable ("when is the next one"), local. Word choice
differs by market: "schedule" in the US ("118 bus schedule", "7th street bus schedule"),
"timetable" elsewhere; titles already follow this per country. Bare route numbers ("306", "412",
"bc5") rank 8–15: Google localises them, so the network and city in the title and the first
sentence matter more than the word "timetable".

GEO-friendly query shapes (questions AI answers pick up): "first/last bus", "how often", "does it
run on Sunday", "where to catch it". Every route, journey and stop page already answers these in
a visible FAQ with FAQPage markup.

Volume and difficulty per keyword: **N/A** (no keyword tool). Priority instead comes from
measured impressions and position: clusters with impressions at positions 7–20 (route numbers,
then town to town) are the quickest wins once their pages are crawled and indexed.

## 3. Competitors and SERPs

Live searches on 24 Oct (web search API, US-based, so local results in AU/UK/IE differ; treat
positions as **Estimated**), plus fetched competitor pages (**Measured** where fetched).

| Competitor | Where it shows | Page model | Notes |
|---|---|---|---|
| Transit (transitapp.com) | 813 Melbourne, 201 Leeds, 7 Phoenix | "PTV 813 bus - Melbourne": next departures, stops, FAQ, ItemList schema; 1,100–1,600 words | Real-time and an app; strong domain |
| bustimes.org | 201 Leeds, 233 Cork–Macroom | "201 Heckmondwike - Leeds": full timetable from open data | UK/IE leader, old and widely linked; blocks automated fetches (Cloudflare check), not analysed further |
| Moovit | stop pages (7th St & Roeser Rd) | stop schedules by day | App-led; blocks automated fetches |
| Rome2Rio | stawell to horsham, cork to macroom | "There are N ways to get from A to B": duration, price, frequency | Owns town-to-town; shows fares |
| RideSchedules, Omio, MetroEasy | town to town, US networks | thin schedule pages, booking | |
| Operators (PTV, Yarra Trams, Valley Metro, Bus Éireann) | everywhere | official timetables, disruptions | Highest trust; often PDFs or planners |

**Measured, page comparison** (our live pages vs Transit for the same routes):

| | Stopwatch route 96 / 848 | Transit 813 / 7 / 201 |
|---|---|---|
| Words | 3,154–8,220 | 1,139–1,557 |
| Structured data | WebPage, BreadcrumbList, FAQPage (+BusStop on stops) | ItemList |
| Full timetable in HTML | yes, every day type and direction | next departures only |
| Real-time | no (scheduled) | yes |
| Fares | no | no |

Our pages are more complete than the page that outranks them; the gap is domain authority and
crawl/index coverage, not content. Strengths to learn from: Transit and bustimes put the
operator/network and the route's ends in the title; Rome2Rio answers duration, frequency and
price for town pairs. Weaknesses to exploit: Transit shows only near-term departures (no full day,
no holidays), and bustimes has no AU/US coverage.

## 4. Content gaps

| Gap | Who has it | Bucket |
|---|---|---|
| Fares on journey pages ("how much is the bus from A to B") | Rome2Rio, Omio | Strategic: needs fare data per feed (GTFS fares are patchy) |
| Real-time departures | Transit, Moovit, operators | Long-term: per-operator APIs and keys |
| Disruptions / service changes | operators, local news | Long-term; link to the operator instead (already done) |
| Route ends and network in every title | Transit, bustimes | Done for numbered routes (`[route].astro`) |

## 5. What will move rankings next

1. **Crawl and index** (this branch): send Google's crawl to route and journey pages. Then
   request indexing in Search Console for the busiest route pages still "unknown to Google".
2. **Authority** (off-site, needs you): links from local sites to the pages that already rank
   7–12, as in `seo/backlink-kit.md`; the stop-board embed carries a followed link. One market
   first (Melbourne / Victoria).
3. **CTR at positions 7–10**: 338 queries, 2,271 impressions, 7 clicks. Re-check after the
   PR #13 snippet fixes have been live two weeks.

Check on ~7 Nov: Search Console `core.xml` indexed count (baseline 1.02k), route-page impressions,
and the Googlebot split from the server log (baseline: routes 25–47 fetches a day).
