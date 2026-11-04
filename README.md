# Stopwatch

Free, phone-friendly timetables at **[transit.shivrajsinh.in](https://transit.shivrajsinh.in)**: 123 bus, tram, train and
ferry networks in Canada, the UK, Ireland, Australia, New Zealand and the US, generated from the
operators' open GTFS data (about 8,900 routes and 298,000 stops, November 2026). It is a static
[Astro](https://astro.build) site of about 235,000 pages, rebuilt weekly, served by nginx on one
small server with Cloudflare in front, and paid for by AdSense.

What a rider gets that operator PDFs and app-gated pages do not: the whole day on one screen with
the next departure first, departure boards worked out from the schedule in the browser, search
across every route and stop, "stops near me" (location never leaves the browser), route and system
maps, town-to-town pages, saved stops, print/PDF, an embeddable next-departures widget, and offline
use for any page already opened. These are scheduled times, not live vehicle positions.

## Refresh the timetables

```bash
npm run refresh:server   # fetch feeds -> data -> share images -> build -> deploy -> IndexNow -> sitemaps
```

Or step by step: `npm run fetch` (GTFS into `data/raw/`), `npm run data` (GTFS to `src/data/` and
map lines in `public/geo/`), `node scripts/make-images.mjs` (icons, share cards),
`npm run release:server` (build, check and deploy), `npm run indexnow`. `npm run dev` runs the site
locally once the data step has been run.

The Mac runs this every Monday at 04:00 through launchd (`scripts/weekly-refresh.sh`), from the
working tree as it stands, with a log in `data/logs/`.

- Feeds come from the Mobility Database mirror, or from the publisher where the mirror lacks or
  keeps them stale (`FEED_URLS` in `data/systems.mjs`). Operators split across the UK's regional
  Bus Open Data files are merged into one feed (`merge`, `scripts/merge-feeds.mjs`).
- A failed download keeps last week's file. A feed that ended within the last four weeks is built
  from its final weeks and says so on its pages, rather than the network turning into 404s.
- Each page's sitemap `lastmod` and `Last-Modified` move only when its content changes
  (`scripts/lastmod.mjs`, which keeps its record in `data/lastmod.json`).

## Hosting

`--server` copies each built shard into one new release over SSH; the release goes live all at once
after the last shard, then Cloudflare's copy is purged (`scripts/deploy-server.mjs`). Pages are
stored gzipped, so a release is about 2 GB. Setup, DNS and rollback are in
[`deploy/README.md`](deploy/README.md).

The site is still built in shards (`scripts/shards.mjs`, `scripts/build-all.mjs`) because that keeps
memory and disk use low on the build machine. It began on Cloudflare Workers static assets; that
route (`npm run refresh`, `worker/router.js`) still exists but is no longer used, because every page
view counted toward the Workers request limit.

## What Google may index

Every page stays live for riders, but only some are offered to search engines:

- Country and system pages are always indexable.
- Route, stop, hub, town and town-to-town pages are indexable only if they are in
  `data/index-keep.txt`, built from Search Console demand by `scripts/index-keep.mjs` (about 2,450
  pages). The rest carry `noindex` and stay out of the sitemaps.
- `scripts/sitemaps.mjs` groups the sitemaps by page type. Pages that have just turned `noindex` are
  listed for a while in `data/noindexed.txt`, so that search engines recrawl them and see the change.

Why: on 28 Oct 2026 Google dropped nearly every page of the site from its results, then at about
220,000 generated pages. There was no manual action. The recovery plan is a small site of pages with
proven demand.

## Brand

Name, mark and palette live in `src/components/Logo.astro`, `scripts/make-images.mjs` (icons and
share cards) and the tokens at the top of `src/styles/global.css`: graphite neutrals, one signal
amber accent, system fonts. Route badges use the operator's colours with text picked by contrast
(`inkFor` in `src/lib/format.js`), so every badge clears WCAG AA.

## Ads

`src/components/Ad.astro` places a labelled responsive unit between sections, never inside a
timetable. AdSense Auto ads are also on for the account and can add units elsewhere on a page. The
embed widget (`src/pages/embed.astro`) carries no ads, because AdSense does not allow them in frames
on other people's sites.

## How a timetable is decided

All in `scripts/build-data.mjs`, documented at the top of that file:

- Day types come from what actually runs: for each weekday the most common set of trips over the
  next four weeks, grouped per route (so one route's Wednesday quirk doesn't split another's
  Monday-to-Friday table).
- Holidays and one-off dates in the next 60 days are listed per route as "runs the Sunday
  timetable" / "no service"; a lasting change (a new season) is shown as a change date.
- Columns are the feed's own timepoints, at most 7 so a table fits a phone.

## Town-to-town pages

People search between places ("cork to macroom bus", "stawell to horsham", "bus from bovingdon
to hemel hempstead") far more than a route page can answer. `scripts/journeys.mjs`, run inside
`npm run data`, finds every pair of places a system links directly and writes
`src/data/journeys/<cc>/<system>.json`; each pair gets `/<cc>/<system>/from/<a>/to/<b>` (every
departure, journey time, where to catch it, next departure) and each place
`/<cc>/<system>/from/<a>` (every direct destination). System and route pages link to them.

- Which town a stop is in comes from GeoNames' populated places (`data/raw/geonames-cities500.zip`,
  CC BY 4.0, fetched by `npm run fetch`; `scripts/places.mjs`). Without that file the data step
  simply builds no journeys.
- Pairs must be 3 km apart with 5 departures a week, and each system keeps its best pairs only
  (`maxPairs`, at most ~42,000 in all; each town's main link each way first): a city network links hundreds of suburbs to each other, and
  Google crawls a young site only a couple of thousand pages a day.
- They need a full data step: deploy with `npm run refresh:server`, not `release:server` on old data.

Town-to-town pages are subject to [What Google may index](#what-google-may-index) like the rest.

## Licences and attribution

Every network's data has its own licence. A network is added only if its licence allows this use,
and the Mobility Database catalogue (`urls.license`) is the place to start checking. Each network's
source and licence are in `data/systems.mjs`; each timetable page names them, and
[the About page](https://transit.shivrajsinh.in/about) lists them all. Stopwatch is independent:
operators' marks are not used, and every page says it is not affiliated with them. For example,
BC Transit's [terms](https://www.bctransit.com/open-data/terms-of-use) require naming it as the
source and forbid using its marks, so titles use city names, not its brand.
