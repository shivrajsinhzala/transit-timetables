/**
 * The date each page's content last changed, kept across builds in data/lastmod.json.
 *
 * Every weekly refresh rebuilds every page, and each one says when its data was refreshed, so
 * the build date used to be every page's sitemap <lastmod> and file time. Google learns that a
 * lastmod which moves for all 70,000 URLs every week means nothing, and spends its crawl
 * re-fetching pages that have not changed (37% of its requests in Oct 2026) instead of the ones
 * it has never seen. Here a page's date moves only when what it says changes: its title,
 * description and <main>, without the refresh dates and script names that change every build.
 *
 * stampPages(dir) records a built shard's pages and sets each file's time to its date, which
 * nginx sends as Last-Modified, so a recrawl of an unchanged page can be a 304.
 * scripts/sitemaps.mjs reads the dates for <lastmod>.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const FILE = 'data/lastmod.json';
const SITE = 'https://transit.shivrajsinh.in';
const today = () => new Date().toISOString().slice(0, 10);

let store; // url -> [fingerprint, yyyy-mm-dd]
function load() {
  store ??= fs.existsSync(FILE) ? new Map(Object.entries(JSON.parse(fs.readFileSync(FILE, 'utf8')))) : new Map();
  return store;
}

const DATE = String.raw`(?:\d{1,2} [A-Z][a-z]+ \d{4}|[A-Z][a-z]+ \d{1,2}, \d{4})`;
const VOLATILE = [
  new RegExp(String.raw`\b([Uu]pdated|[Rr]efreshed) ${DATE}`, 'g'),
  /"dateModified":"[^"]*"/g,
  /\/_a\/[^"' )]+/g,
];

/** What a page says, without what changes on every build. */
export function fingerprint(html) {
  const title = /<title>[^<]*<\/title>/.exec(html)?.[0] ?? '';
  const desc = /<meta name="description"[^>]*>/.exec(html)?.[0] ?? '';
  const start = html.indexOf('<main');
  const end = html.indexOf('</main>');
  let text = title + desc + (start >= 0 && end > start ? html.slice(start, end) : html);
  for (const re of VOLATILE) text = text.replace(re, '');
  return createHash('sha1').update(text).digest('base64url').slice(0, 16);
}

/** `dist/s3/uk/x/route-8.html` -> https://transit.shivrajsinh.in/uk/x/route-8 */
function urlOf(rel) {
  const p = rel.replace(/\\/g, '/').replace(/\.html$/, '');
  return p === 'index' ? `${SITE}/` : `${SITE}/${p}`;
}

/** Records every page in a built shard and sets its file time to the date its content last changed. */
export function stampPages(dir) {
  const map = load();
  const day = today();
  let changed = 0, same = 0;
  (function walk(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) { walk(p); continue; }
      if (!f.name.endsWith('.html') || f.name === '404.html') continue;
      const url = urlOf(path.relative(dir, p));
      const fp = fingerprint(fs.readFileSync(p, 'utf8'));
      const prev = map.get(url);
      let date = day;
      if (prev?.[0] === fp) { date = prev[1]; same++; } else { map.set(url, [fp, day]); changed++; }
      const t = new Date(`${date}T00:00:00Z`);
      fs.utimesSync(p, t, t);
    }
  })(dir);
  fs.writeFileSync(FILE, JSON.stringify(Object.fromEntries(map)));
  console.log(`${dir}: ${changed} pages changed, ${same} unchanged since their last build`);
}

/** The date a page last changed, or undefined for a page no build has stamped. */
export function lastmodOf(url) {
  return load().get(url)?.[1];
}
