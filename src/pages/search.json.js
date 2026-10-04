/**
 * The search and "near me" index, fetched by the browser only when a rider opens search.
 * Rows are arrays to keep it small: [type, name, sub, url, lat, lon, color, routeNumber]
 * with type 0 town, 1 route, 2 hub, 3 stop.
 */
import { allSystems, pageStops, hubs, REGION } from '../lib/data.js';
import { plain } from '../lib/format.js';

const r4 = (n) => (n ? Math.round(n * 1e4) / 1e4 : 0);

export function GET() {
  const items = [];
  for (const s of allSystems()) {
    const base = `/${REGION.slug}/${s.slug}`;
    items.push([0, s.name, `${s.routes.length} routes · ${s.area}`, base]);
    for (const r of s.routes) items.push([1, plain(r.short ? `${r.short} ${r.name}` : r.name), s.name, `${base}/${r.slug}`, 0, 0, r.color || '', r.short]);
    for (const h of hubs(s.slug)) items.push([2, plain(h.name), `${s.name} exchange`, `${base}/hub/${h.slug}`, r4(h.stops[0].lat), r4(h.stops[0].lon)]);
    for (const st of pageStops(s.slug)) items.push([3, plain(st.name), `${s.name} · #${st.code}`, `${base}/stop/${st.code}`, r4(st.lat), r4(st.lon)]);
  }
  return new Response(JSON.stringify({ v: 1, items }), { headers: { 'Content-Type': 'application/json' } });
}
