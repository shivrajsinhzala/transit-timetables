# Stopwatch: transit.shivrajsinh.in

Phone-friendly bus timetables for 33 BC Transit systems: 429 route pages, ~5,300 stop pages and
56 exchange (hub) pages, generated from BC Transit's open GTFS data. Static Astro site, served as a
Cloudflare Workers static-assets deployment on `transit.shivrajsinh.in`. Monetised with AdSense.

What a rider gets that the operator PDFs and app-gated pages do not: the whole day on one screen
with the next bus highlighted, live departure boards (from the schedule), search across every
route and stop, "stops near me" (location never leaves the browser), route and system maps,
saved stops, print/PDF, and offline use for any page already opened.

## Brand

Name, mark and palette live in `src/components/Logo.astro`, `scripts/make-images.mjs` (icons and
share cards) and the tokens at the top of `src/styles/global.css`: graphite neutrals, one signal
amber accent, Overpass type. Route badges use the operator's colours with text picked by contrast
(`inkFor` in `src/lib/format.js`), so every badge clears WCAG AA.

## Ads

`src/components/Ad.astro` places a labelled responsive unit between sections (never inside a
timetable). The AdSense library loads after first paint or first scroll, and each slot is filled
only when it nears the viewport (`src/scripts/app.js`): that took the homepage's largest paint
from 5.1 s to 2.3 s on Lighthouse mobile, and unseen impressions are what dragged RPM down on the
GSRTC sites. The unit id is the account's existing in-content unit; give the site its own units
in AdSense and swap `SLOT`.

## Refresh the timetables

```bash
npm run refresh     # fetch feeds -> data -> icons/share cards -> build -> deploy -> IndexNow
```

Or step by step: `npm run fetch` (GTFS into `data/raw/`, from the Mobility Database mirror),
`npm run data` (GTFS -> `src/data/*.json` and map lines in `public/geo/`),
`node scripts/make-images.mjs` (icons, share cards), `npm run build` (copies MapLibre to
`public/vendor/`, Astro, then `scripts/verify-build.mjs`), `npm run deploy` (`wrangler deploy`),
`npm run indexnow` (tells Bing and other IndexNow engines about every URL). Feeds change every few months and each build only looks
four weeks ahead, so refresh at least weekly.

## How a timetable is decided

All in `scripts/build-data.mjs`, documented at the top of that file:

- Day types come from what actually runs: for each weekday the most common set of trips over the
  next four weeks, grouped per route (so one route's Wednesday quirk doesn't split another's
  Monday-to-Friday table).
- Holidays and one-off dates in the next 60 days are listed per route as "runs the Sunday
  timetable" / "no service"; a lasting change (a new season) is shown as a change date.
- Columns are the feed's own timepoints, at most 7 so a table fits a phone.

## Licence and attribution

BC Transit's [open data terms](https://www.bctransit.com/open-data/terms-of-use) allow use,
reproduction and redistribution, require BC Transit to be named as the source, and forbid using
its marks. So: city names in titles, never the BC Transit brand or logo; attribution and an
"independent, not affiliated" notice in every page footer. Adding another agency means checking
its licence first — the Mobility Database catalogue (`urls.license`) is the place to start.
