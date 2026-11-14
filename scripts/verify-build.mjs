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
if (problems.length) {
  console.error(`✗ ${problems.length} problem(s):\n  ${problems.slice(0, 40).join('\n  ')}`);
  process.exit(1);
}
console.log(`✓ ${DIST}: ${files.length} pages, ${routePages} route pages, ${journeyPages} journey pages: titles, descriptions, canonicals and timetables all present`);
