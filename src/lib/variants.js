/**
 * Minor route variants: "7S" next to "7", a school or works trip or two a day on part of a main
 * route. Google ranked Phoenix 7S and 61S (one bus a day each) for "7th street bus schedule"
 * while the all-day routes 7 and 61 sat "Discovered – currently not indexed": 464 impressions in
 * 28 days and 4 clicks, because the snippet promised one bus (Search Console, to 22 Oct 2026).
 * A minor variant's page names its main route as canonical, links to it at the top and stays out
 * of the sitemaps. Real letter routes (Dublin Bus 15A, 15B) run all day and are not minor.
 *
 * No imports: astro.config.mjs uses this for the sitemap filter, outside the page build.
 */
export const MAX_VARIANT_TRIPS = 4;

const busiest = (r) => Math.max(0, ...Object.values(r.summary || {}).map((s) => s.trips || 0));

/** Map of a system's minor variant slugs to their main route: same number plus one or two letters, at most 4 trips on its busiest day, and a third or less of the main route's. */
export function minorVariants(routes) {
  const byShort = new Map(routes.filter((r) => r.short).map((r) => [r.short.toUpperCase(), r]));
  const out = new Map();
  for (const r of routes) {
    const m = /^(.*\d)[A-Za-z]{1,2}$/.exec(r.short || '');
    const main = m && byShort.get(m[1].toUpperCase());
    if (main && busiest(r) <= MAX_VARIANT_TRIPS && busiest(main) >= 3 * busiest(r)) out.set(r.slug, main);
  }
  return out;
}

/**
 * Routes the feed lists twice: same number, same days and the same end stops each way (Oxford Bus
 * has two "8"s, Cardiff Bus two "30"s, with one stop's difference at most). Two indexable pages
 * with one title and one timetable compete with each other, so the later one names the first as
 * canonical and stays out of the sitemaps, as a minor variant does.
 */
export function duplicateRoutes(routes) {
  const sig = (r) => [
    String(r.short).toUpperCase(),
    (r.days || []).map((d) => d.key).join(','),
    (r.directions || []).map((d) => `${d.stops[0]?.name}>${d.stops.at(-1)?.name}`).sort().join('|'),
  ].join('#');
  const first = new Map();
  const out = new Map();
  for (const r of routes) {
    if (!r.short) continue;
    const k = sig(r);
    if (first.has(k)) out.set(r.slug, first.get(k));
    else first.set(k, r);
  }
  return out;
}

/** Every route whose page defers to another: minor variants and duplicates, slug -> the route it names as canonical. */
export function deferredRoutes(routes) {
  return new Map([...duplicateRoutes(routes), ...minorVariants(routes)]);
}
