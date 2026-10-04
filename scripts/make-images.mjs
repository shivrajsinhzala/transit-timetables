#!/usr/bin/env node
/**
 * Brand images, rendered from SVG with resvg so they never drift from the mark in the header:
 *   public/favicon.svg, favicon-48.png (Google Search wants a multiple of 48), apple-touch-icon.png,
 *   icon-192.png, icon-512.png, icon-maskable-512.png, og/default.png and og/<town>.png.
 *
 * Run after `npm run data` (town images use the built index). Text uses the system sans because
 * resvg cannot read the site's woff2 webfont; the shapes are what carry the brand.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const INK = '#15171a';
const AMBER = '#f2a516';
const BOARD = '#121416';
const DIGIT = '#ffb52e';
const PAPER = '#f4f5f6';

/** The mark: a stopwatch face in signal amber. Shared with src/components/Logo.astro. */
export const MARK = (ink = INK) => `
  <rect x="12.6" y="1.4" width="6.8" height="3.6" rx="1.3" fill="${ink}"/>
  <rect x="15" y="4.4" width="2" height="2.8" fill="${ink}"/>
  <rect x="24.2" y="6.1" width="3.2" height="2.6" rx="1" transform="rotate(42 25.8 7.4)" fill="${ink}"/>
  <circle cx="16" cy="18.6" r="11.6" fill="${AMBER}" stroke="${ink}" stroke-width="2.6"/>
  <path d="M16 18.6 L21.4 12.9" stroke="${ink}" stroke-width="2.8" stroke-linecap="round"/>
  <circle cx="16" cy="18.6" r="2.1" fill="${ink}"/>`;

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
// Three named font files rather than loadSystemFonts: loading every system font on each render
// took minutes for 34 images. Falls back to resvg's built-in handling where these do not exist.
const FONT_FILES = ['/System/Library/Fonts/Supplemental/Arial.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/System/Library/Fonts/Supplemental/Courier New Bold.ttf'].filter((f) => fs.existsSync(f));
const png = (markup, width) => new Resvg(markup, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false, fontFiles: FONT_FILES, defaultFontFamily: 'Arial' } }).render().asPng();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

fs.mkdirSync('public/og', { recursive: true });

const favicon = svg(32, 32, MARK());
fs.writeFileSync('public/favicon.svg', favicon);
fs.writeFileSync('public/favicon-48.png', png(favicon, 48));

// Home-screen icons sit on a solid tile: iOS and Android both mask transparency badly.
const tile = (pad) => svg(32, 32, `<rect width="32" height="32" fill="${PAPER}"/><g transform="translate(${pad} ${pad}) scale(${(32 - 2 * pad) / 32})">${MARK()}</g>`);
fs.writeFileSync('public/apple-touch-icon.png', png(tile(3), 180));
fs.writeFileSync('public/icon-192.png', png(tile(2.5), 192));
fs.writeFileSync('public/icon-512.png', png(tile(2.5), 512));
fs.writeFileSync('public/icon-maskable-512.png', png(tile(6.5), 512));

/** A share card: wordmark, a headline, and a departure-board strip with real-looking rows. */
function card({ title, sub, rows }) {
  const boardRows = rows.slice(0, 3).map((r, i) => `
    <g transform="translate(0 ${i * 64})">
      <rect x="0" y="0" width="96" height="46" rx="8" fill="${r.color || AMBER}"/>
      <text x="48" y="32" font-size="26" font-weight="800" fill="${r.text || INK}" text-anchor="middle">${esc(r.route)}</text>
      <text x="124" y="32" font-size="27" fill="#e6e8ea">${esc(r.to)}</text>
      <text x="560" y="32" font-size="30" font-weight="700" fill="${DIGIT}" text-anchor="end" font-family="Courier New">${esc(r.time)}</text>
    </g>`).join('');
  return svg(1200, 630, `
    <rect width="1200" height="630" fill="${INK}"/>
    <g transform="translate(72 64) scale(2.4)">${MARK('#0b0c0d')}</g>
    <text x="160" y="112" font-size="46" font-weight="800" fill="#f4f5f6">Stopwatch</text>
    <text x="72" y="250" font-size="64" font-weight="800" fill="#ffffff">${esc(title)}</text>
    <text x="72" y="318" font-size="32" fill="#b9bec4">${esc(sub)}</text>
    <rect x="560" y="378" width="600" height="212" rx="18" fill="${BOARD}" stroke="#2a2e33" stroke-width="2"/>
    <g transform="translate(584 400)">${boardRows}</g>
    <text x="72" y="560" font-size="26" fill="#8b9198">transit.shivrajsinh.in</text>`);
}

const index = JSON.parse(fs.readFileSync('src/data/index.json', 'utf8'));
const routes = index.reduce((a, s) => a + s.routes, 0);
fs.writeFileSync('public/og/default.png', png(card({
  title: 'Every BC bus timetable.',
  sub: `${routes} routes in ${index.length} towns. No app, no PDF.`,
  rows: [{ route: '4', to: 'UVic Exchange', time: '7:54' }, { route: '8', to: 'UBCO Exchange', time: '8:11' }, { route: '97', to: 'Westbank Exchange', time: '8:15' }],
}), 1200));

for (const t of index) {
  const sys = JSON.parse(fs.readFileSync(`src/data/systems/${t.slug}.json`, 'utf8'));
  const rows = sys.routes.slice(0, 3).map((r) => ({
    route: r.short || '•', color: r.color, text: r.textColor,
    to: (r.directions[0]?.stops.at(-1)?.name || r.name).replace(/\s+Bay\s+\w+$/i, '').slice(0, 26),
    time: (() => { const m = r.summary[r.days[0]?.key]?.first ?? 0; const h = Math.floor((m % 1440) / 60); return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')}`; })(),
  }));
  fs.writeFileSync(path.join('public/og', `${t.slug}.png`), png(card({
    title: `${t.name} bus schedules`,
    sub: `All ${t.routes} route${t.routes === 1 ? '' : 's'}, every stop, next bus first.`,
    rows,
  }), 1200));
}
console.log(`icons + ${index.length + 1} share images written`);
