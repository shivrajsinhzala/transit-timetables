#!/usr/bin/env node
/** Post-build checks on dist/: every page has a title, a description and a self canonical (a minor
 * route variant's names its main route in the same system, src/lib/variants.js), and
 * no route page shipped without a timetable. Fails the build rather than publishing a broken page. */
import fs from 'node:fs';
import path from 'node:path';

const DIST = process.argv[2] || 'dist';
import { SITE, OLD_HOSTS } from '../src/lib/site.js';
const files = [];
const textFiles = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (f.name.endsWith('.html')) files.push(p);
    else if (/\.(xml|txt|json|js|mjs|webmanifest|css)$/.test(f.name)) textFiles.push(p);
  }
})(DIST);

const problems = [];
const warnings = [];
const titles = new Map(); // title -> first indexable page with it
const counts = {}; // country -> { index, noindex }
// The move to SITE_URL: no page, sitemap, robots, llms, manifest or script may still name an old host.
const oldHost = new RegExp(OLD_HOSTS.map((h) => h.replace(/\./g, '\\.')).join('|'));
for (const f of [...files, ...textFiles]) {
  const m = oldHost.exec(fs.readFileSync(f, 'utf8'));
  if (m) problems.push(`${path.relative(DIST, f)}: still names ${m[0]}`);
}
let routePages = 0;
let journeyPages = 0;
for (const f of files) {
  const html = fs.readFileSync(f, 'utf8');
  const rel = path.relative(DIST, f).replace(/\.html$/, '').replace(/(^|\/)index$/, '');
  // Not pages for search: the error and offline pages, and the iframe board for other sites.
  if (rel === '404' || rel === 'offline' || rel === 'embed') continue;
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1];
  // One robots meta per page, and it decides (src/lib/indexing.js): no page may say index twice
  // or carry a separate googlebot line again.
  const robots = [...html.matchAll(/<meta name="(robots|googlebot)" content="([^"]*)"/g)];
  if (robots.length !== 1 || robots[0][1] !== 'robots') problems.push(`${rel}: ${robots.length} robots metas`);
  const noindex = /noindex/.test(robots[0]?.[2] || '');
  const cc = /^([a-z]{2})(\/|$)/.exec(rel)?.[1] || 'site';
  counts[cc] ??= { index: 0, noindex: 0 };
  counts[cc][noindex ? 'noindex' : 'index']++;
  if (noindex && /class="adsbygoogle"/.test(html)) problems.push(`${rel}: ad on a noindex page`);
  if ((html.match(/<h1[\s>]/g) || []).length !== 1) problems.push(`${rel}: not exactly one <h1>`);
  if (!noindex && title) {
    const t = title.replace(/&amp;/g, '&');
    if (t.length > 65) warnings.push(`${rel}: title ${t.length} chars`);
    const canonicalTo = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
    // A minor variant shares its main route's title on purpose: it names that page as canonical.
    if (canonicalTo === (rel ? `${SITE}/${rel}` : `${SITE}/`)) {
      if (titles.has(t)) warnings.push(`${rel}: same title as ${titles.get(t)}: ${t}`);
      else titles.set(t, rel);
    }
    const d = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] || '';
    if (d.replace(/&amp;/g, '&').length > 160) warnings.push(`${rel}: description ${d.length} chars`);
  }
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
  if (!title) problems.push(`${rel}: no <title>`);
  if (!/<meta name="description" content="[^"]{50,}"/.test(html)) problems.push(`${rel}: missing or short description`);
  const self = rel ? `${SITE}/${rel}` : `${SITE}/`;
  const toMain = /class="notice variant-of"/.test(html) && canonical?.startsWith(`${SITE}/${path.dirname(rel)}/route-`);
  if (canonical !== self && !toMain) problems.push(`${rel}: canonical ${canonical}`);
  if (/^[a-z]{2}\/[^/]+\/stop\/[^/]+$/.test(rel) && !/<table class="hours"/.test(html)) problems.push(`${rel}: stop page without times`);
  if (/^[a-z]{2}\/[^/]+\/hub\/[^/]+$/.test(rel) && !/data-board/.test(html)) problems.push(`${rel}: hub page without a board`);
  if (/^[a-z]{2}\/[^/]+\/from\/[^/]+\/to\/[^/]+$/.test(rel)) {
    journeyPages++;
    if (!/<table class="tt jt"/.test(html) || !/<tr data-m=/.test(html)) problems.push(`${rel}: journey page without departures`);
  }
  if (/^[a-z]{2}\/[^/]+\/from\/[^/]+$/.test(rel) && !/href="\/[a-z]{2}\/[^"]+\/from\/[^"]+\/to\/[^"]+"/.test(html)) problems.push(`${rel}: town page without journeys`);
  // Visible text only: strip scripts, styles and tags before looking for long dashes.
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
  if (/[\u2013\u2014]/.test(text)) problems.push(`${rel}: long dash in visible text (${/.{0,30}[\u2013\u2014].{0,30}/.exec(text)[0].trim()})`);
  if (/^[a-z]{2}\/[^/]+\/[^/]+$/.test(rel)) {
    routePages++;
    if (!/<table class="tt"/.test(html)) problems.push(`${rel}: route page without a timetable`);
  }
}
fs.mkdirSync('reports/release', { recursive: true });
fs.writeFileSync('reports/release/index-counts.json', JSON.stringify({ dist: DIST, at: new Date().toISOString(), counts, warnings: warnings.length }, null, 2));
if (warnings.length) {
  fs.writeFileSync('reports/release/seo-warnings.txt', `${warnings.length} warnings\n${warnings.join('\n')}\n`);
  console.warn(`! ${warnings.length} SEO warnings (long titles or descriptions, shared titles): reports/release/seo-warnings.txt`);
}
if (problems.length) {
  console.error(`✗ ${problems.length} problem(s):\n  ${problems.slice(0, 40).join('\n  ')}`);
  process.exit(1);
}
console.log(`✓ ${DIST}: ${files.length} pages, ${routePages} route pages, ${journeyPages} journey pages: titles, descriptions, canonicals and timetables all present`);
