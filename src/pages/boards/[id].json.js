/** /boards/<cc>-<system>.json: one homepage live board, fetched only for the city a visitor sees. */
import { isMain, COUNTRIES } from '../../lib/data.js';
import { FEATURED, boardFor } from '../../lib/featured.js';

export function getStaticPaths() {
  return isMain ? FEATURED.map((f) => ({ params: { id: f.key.replace('/', '-') }, props: { f } })) : [];
}

export function GET({ props }) {
  const b = boardFor(props.f.key);
  return new Response(JSON.stringify({ ...b, h24: COUNTRIES[props.f.key.split('/')[0]].h24 }), { headers: { 'Content-Type': 'application/json' } });
}
