/**
 * Stopwatch router. The site is ~100,000 static files, more than one Workers deployment holds,
 * so it is split into shards (scripts/shards.mjs). This Worker owns transit.shivrajsinh.in:
 * its own assets (home, country pages, search, icons) are served before it ever runs; every
 * other request comes here and is passed to the shard that holds it, over a service binding.
 */
import plan from '../src/data/shards.json';

// Exchange pages removed on 2026-10-04 (the old bay-suffix rule grouped unrelated stops into
// hubs that do not exist): each goes to its town in one hop.
const GONE_HUBS = new Set([
  'nanaimo/departure-bay-rd-at', 'nanaimo/neyland-rd-at-departure', 'nanaimo/uplands-dr-at-hammond', 'nanaimo/hammond-bay-rd-at-departure',
  'sunshine-coast/hwy-101-at', 'sunshine-coast/hwy-101-at-davis',
  'victoria/bay-st-at-rock', 'victoria/cook-st-at', 'victoria/cadboro-bay-rd-at-vista', 'victoria/crescent-rd-at-foul', 'victoria/beach-dr-at-cadboro',
  'victoria/douglas-st-at', 'victoria/oak-bay-ave-at-foul', 'victoria/quadra-st-at', 'victoria/tyee-rd-at', 'victoria/richmond-rd-at',
]);

/** FNV-1a, as in src/lib/data.js: which shard holds a stop of a split system. */
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

function shardFor(pathname) {
  let m = /^\/_a\/([a-z0-9]+)\//.exec(pathname);
  if (m) return m[1];
  m = /^\/geo\/([a-z]{2})\/([a-z0-9-]+)(?:\.json$|\/)/.exec(pathname);
  if (m) return plan.systems[`${m[1]}/${m[2]}`];
  m = /^\/([a-z]{2})\/([a-z0-9-]+)(?:\/stop\/([^/]+))?/.exec(pathname);
  if (!m) return null;
  const key = `${m[1]}/${m[2]}`;
  const split = plan.split[key];
  if (m[3] && split) {
    let code = m[3].replace(/\.html$/, '');
    try { code = decodeURIComponent(code); } catch { /* leave as is */ }
    return split[fnv(code) % split.length];
  }
  return plan.systems[key] || null;
}

const moved = (url, path) => Response.redirect(`${url.origin}${path}${url.search}`, 301);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    // British Columbia moved under Canada when the site went international (October 2026).
    if (p === '/bc' || p.startsWith('/bc/')) {
      const hub = /^\/bc\/([a-z0-9-]+)\/hub\/([a-z0-9-]+)$/.exec(p);
      if (hub && GONE_HUBS.has(`${hub[1]}/${hub[2]}`)) return moved(url, `/ca/${hub[1]}`);
      return moved(url, `/ca${p.slice(3)}`);
    }
    if (p === '/search.json') return moved(url, '/search/index.json');

    const shard = shardFor(p);
    const binding = shard && env[shard.toUpperCase()];
    if (binding) return binding.fetch(request);
    return env.ASSETS.fetch(request);
  },
};
