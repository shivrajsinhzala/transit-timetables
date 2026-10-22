/**
 * /<cc>/<system>/places.json: the towns of one network and where each goes direct, for the
 * From/To picker (components/JourneyPicker.astro). Fetched only when a rider starts typing.
 * { p: [[slug, name], …], d: [[index of each direct destination], …] }, both in place order.
 */
import { shardSystems, getJourneys } from '../../../lib/data.js';

export function getStaticPaths() {
  return shardSystems().filter((s) => getJourneys(s.key)?.pairs.length).map((system) => ({ params: { cc: system.cc, system: system.slug }, props: { system } }));
}

export function GET({ props }) {
  const j = getJourneys(props.system.key);
  const body = { p: j.places.map((p) => [p.slug, p.name]), d: j.from.map((list) => list.map((p) => p.b)) };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
}
