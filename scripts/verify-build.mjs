#!/usr/bin/env node
/** Post-build checks on dist/: every page has a title, a description and a self canonical, and
 * no route page shipped without a timetable. Fails the build rather than publishing a broken page. */
import fs from 'node:fs';
import path from 'node:path';

const DIST = 'dist';
const SITE = 'https://transit.shivrajsinh.in';
const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p); else if (f.name.endsWith('.html')) files.push(p);
  }
})(DIST);

const problems = [];
let routePages = 0;
for (const f of files) {
  const html = fs.readFileSync(f, 'utf8');
  const rel = path.relative(DIST, f).replace(/\.html$/, '').replace(/(^|\/)index$/, '');
  if (rel === '404') continue;
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1];
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
  if (!title) problems.push(`${rel}: no <title>`);
  if (!/<meta name="description" content="[^"]{50,}"/.test(html)) problems.push(`${rel}: missing or short description`);
  if (canonical !== (rel ? `${SITE}/${rel}` : SITE)) problems.push(`${rel}: canonical ${canonical}`);
  if (/^bc\/[^/]+\/stop\/[^/]+$/.test(rel) && !/<table class="hours"/.test(html)) problems.push(`${rel}: stop page without times`);
  if (/^bc\/[^/]+\/[^/]+$/.test(rel)) {
    routePages++;
    if (!/<table class="tt"/.test(html)) problems.push(`${rel}: route page without a timetable`);
  }
}
if (problems.length) {
  console.error(`✗ ${problems.length} problem(s):\n  ${problems.slice(0, 40).join('\n  ')}`);
  process.exit(1);
}
console.log(`✓ ${files.length} pages, ${routePages} route pages: titles, descriptions, canonicals and timetables all present`);
