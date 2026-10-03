# Bus Times — transit.shivrajsinh.in

Phone-friendly bus timetables for 33 BC Transit systems (429 routes, ~5,300 stop pages), generated
from BC Transit's open GTFS data. Static Astro site, served as a Cloudflare Workers static-assets
deployment on the `transit.shivrajsinh.in` custom domain. Monetised with AdSense Auto Ads.

## Refresh the timetables

```bash
npm run refresh     # fetch feeds -> build data -> build site -> deploy
```

Or step by step: `npm run fetch` (GTFS into `data/raw/`, from the Mobility Database mirror),
`npm run data` (GTFS -> `src/data/*.json`), `npm run build` (Astro + `scripts/verify-build.mjs`),
`npm run deploy` (`wrangler deploy`). Feeds change every few months and each build only looks
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
