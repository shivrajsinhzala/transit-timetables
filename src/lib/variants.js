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
