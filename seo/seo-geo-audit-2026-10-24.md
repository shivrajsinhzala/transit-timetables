# SEO and GEO audit, 24 Oct 2026

Run with the checklists from the `aaron-marketing-skills` SEO/GEO bundle (the successor of
`seo-geo-claude-skills`): technical-seo-checker (incl. LLM crawler handling), on-page-seo-checker,
page-play-builder (programmatic mode), geo-content-optimizer and serp-markup-builder.
Numbers are labelled **Measured** (Search Console or a live fetch) or **Estimated**.

## Where the site stands

Search Console, 28 days to 22 Oct, pages on transit.shivrajsinh.in (**Measured**):
199 clicks, 53.9k impressions, CTR 0.4%, average position 13.9.

| Page type | Impressions | Clicks | Avg position |
|---|---|---|---|
| AU routes | 3,221 | 7 | 9.4 |
| CA routes | 2,946 | 20 | 8.9 |
| UK routes | 2,854 | 16 | 16.2 |
| IE routes | 2,390 | 4 | 17.6 |
| AU journeys (town to town) | 2,575 | 16 | 14.7 |
| IE stops | 1,719 | 25 | 7.6 |
| US stops | 485 | 24 | 7.6 |

(From the 1,000 pages Search Console lists; the rest is hidden long tail.)

Of the 1,000 visible queries, 338 sit at positions 7-10: 2,271 impressions, 7 clicks.
Route pages are on the bottom of page one and almost nobody clicks them there. Stop pages at the
same positions get 2-5% CTR.

## What is already right (no change needed)

- **AI crawlers**: robots.txt allows everything; a live fetch as GPTBot, OAI-SearchBot, ClaudeBot,
  Claude-SearchBot, PerplexityBot, CCBot, Googlebot and Bingbot all return 200 through Cloudflare
  (no edge bot block). **Measured**.
- `/llms.txt`, one entity graph (WebSite, Organization, founder) referenced by `@id`, BreadcrumbList,
  FAQPage built from the visible questions, speakable selectors, `dateModified` = refresh date.
- Programmatic guardrails: every page has a real per-row evidence block (the timetable itself),
  stops with no value are noindexed, sitemaps are segmented, IndexNow runs after each refresh.
- Legacy `/bc/...` URLs that still get impressions 301 to `/ca/...`.

## Fixed in this branch

1. **Route opening sentence** (it is also the snippet Google often shows, and the paragraph AI
   answers quote). It listed timepoints from both directions in a jumbled order ("serving Bargy
   Road, College Green, Castlegrange Sq") and kept tram stop numbers ("Acland St #139"). It now
   follows the longest direction in order, without the numbers. Same for the "Where does it go?" FAQ.
2. **One-trip routes** said "first bus 2:35 pm, last 2:35 pm" in the description and lede. That was
   Phoenix 61s, the page with the most impressions of all (249) and 0 clicks. Now: "one bus a day,
   at 2:35 pm".
3. **Day lists**: "Monday and Tuesday and Thursday" becomes "Monday, Tuesday and Thursday" (in
   `build-data.mjs`, so it shows after the next data rebuild).
4. **Country pages**: titles and h1 now carry the modes riders search ("Australia Bus, Train and
   Tram Timetables", "UK Bus Timetables"); descriptions fit 160 characters; "in United Kingdom"
   reads "in the United Kingdom".
5. **Homepage** description cut from 181 to 154 characters.
6. **Country lists** in the Organization schema, llms.txt, the homepage FAQ and About read "Canada,
   the United Kingdom, … and the United States".
7. **llms.txt**: a "Quoting Stopwatch" section (scheduled times, refresh date, where holidays are,
   send riders to the operator for disruptions) and the three busiest routes under every system.

## What will actually move rankings (not code)

Page-one positions 7-10 with low CTR is the classic profile of a new domain with little authority:
Google trusts the pages enough to show them, not yet enough to put them in the top three, where
most clicks go. On-page work is close to its ceiling; the next steps are off-site.

1. **Links from local sites** (biggest lever, **Estimated**). `seo/backlink-kit.md` has drafts
   ready to send. Pages to point links at first, from this data: Phoenix routes and stops, Dublin
   Bus stops, Melbourne buses 813/848/40, V/Line coach journeys (Cranbourne to Phillip Island,
   Ballarat to Maldon).
2. **Embed widget outreach**: each embedded stop board carries a followed link to its stop page.
   Cafés, hostels, libraries and councils near busy stops are the targets.
3. **One market first**, as your adviser said: Melbourne / Victoria. That is where journey pages
   already rank (Stawell to Horsham ~pos 9-13) and where the highest-impression routes are.
4. **Keep requesting indexing** in Search Console (10 a day) for pages already at positions 8-12.
5. Re-check this table around 7 Nov, once the fixes have been live for two weeks.

"Ranking first" for a head term like "bus timetable" is not realistic against operators and
national apps. Position 1-3 for long-tail queries ("848 bus timetable", "cork to macroom bus") is,
and that is where the traffic in this report comes from.
