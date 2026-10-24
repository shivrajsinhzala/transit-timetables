/**
 * Stopwatch client script: everything that needs the rider's clock, location or browser.
 * The pages are complete without it (every timetable is in the HTML); this adds the next bus,
 * departure boards, search, near me, saved stops, maps and offline support on top.
 */

import { now, dayKey, clockText, waitText, upcoming as soon } from './clock.js';

/** White or graphite text, whichever reads better on a route colour (mirrors inkFor in format.js). */
function ink(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.0535 ? '#ffffff' : '#0b0c0d';
}

/** 24-hour clocks in the UK and Ireland (the page says so with data-h24), 12-hour elsewhere. */
const H24 = document.documentElement.hasAttribute('data-h24');
const fmt = (m, h24 = H24) => clockText(m, h24);
const ampm = (m, h24 = H24) => (h24 ? '' : ((m % 1440) + 1440) % 1440 >= 720 ? 'pm' : 'am');
const tm = (m, h24 = H24) => `${fmt(m, h24)} ${ampm(m, h24)}`.trim();

const cfgEl = document.getElementById('cfg');
const CFG = cfgEl ? JSON.parse(cfgEl.textContent) : null;

/* ---------- tabs + next bus (route, stop and hub pages) ---------- */
function setupSections() {
  if (!CFG) return;
  const t = now(CFG.tz);
  document.querySelectorAll('[data-section]').forEach((sec) => {
    const route = CFG.routes[sec.dataset.route];
    const tabs = [...sec.querySelectorAll('[role=tab]')];
    const show = (key) => {
      tabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.day === key)));
      sec.querySelectorAll('.panel').forEach((p) => p.classList.toggle('on', p.dataset.day === key));
    };
    tabs.forEach((b) => b.addEventListener('click', () => show(b.dataset.day)));
    if (!route) return;
    const key = dayKey(route, t.iso, t.wd);
    const line = sec.querySelector('.next-line');
    const panel = key && sec.querySelector(`.panel[data-day="${key}"]`);
    if (!panel) {
      const ex = (route.exceptions || []).find((e) => e.date === t.iso);
      if (line) line.textContent = ex && ex.runs === 'special' ? 'Today runs a special timetable. Check the operator before you travel.' : 'No service here today.';
      return;
    }
    show(key);
    // A journey page's weekday tab can hold a departure that runs on some weekdays only (data-w).
    const runsToday = (el) => !el.dataset.w || el.dataset.w.split(',').includes(String(t.wd));
    const marks = [...panel.querySelectorAll('[data-m]')].filter((el) => el.dataset.m !== '' && runsToday(el));
    const next = marks.find((el) => Number(el.dataset.m) >= t.min);
    if (!line) return;
    if (!next) { line.textContent = 'No more departures today.'; return; }
    next.classList.add('next');
    const b = document.createElement('b');
    const m = Number(next.dataset.m);
    b.textContent = tm(m, CFG.h24 ?? H24);
    line.replaceChildren(`Next scheduled departure${sec.dataset.from ? ` from ${sec.dataset.from}` : ''}: `, b, ` (${waitText(m - t.min)})`);
  });
}

/* ---------- departure boards ---------- */
/**
 * Rows come from embedded JSON (home page) or are read off the hour grids on the page
 * (stop and hub pages), so a board never shows anything the timetable below it does not.
 */
function boardRows(board) {
  if (board._data) return board._data;
  const src = board.querySelector('script[type="application/json"]');
  if (src) return JSON.parse(src.textContent);
  if (!CFG) return null;
  const { wd } = now(CFG.tz);
  return {
    tz: CFG.tz,
    h24: CFG.h24,
    rows: [...document.querySelectorAll('[data-section]')].flatMap((sec) => {
      const route = CFG.routes[sec.dataset.route];
      // A journey table mixes routes: each row names its route (data-r) in the section's data-badges.
      const badges = sec.dataset.badges ? JSON.parse(sec.dataset.badges) : null;
      const groups = new Map();
      sec.querySelectorAll('.panel').forEach((p) => p.querySelectorAll('[data-m]').forEach((el) => {
        // A trip starting past the first column has no time there; a weekdays-only one (data-w) may not run today.
        if (el.dataset.m === '' || (el.dataset.w && !el.dataset.w.split(',').includes(String(wd)))) return;
        const g = badges ? Number(el.dataset.r) : 0;
        if (!groups.has(g)) groups.set(g, {});
        (groups.get(g)[p.dataset.day] ??= []).push(Number(el.dataset.m));
      }));
      return [...groups].map(([g, times]) => ({ ...route, short: sec.dataset.short, color: sec.dataset.color, text: sec.dataset.text, ...(badges ? badges[g] : {}), to: sec.dataset.to, at: sec.dataset.at, url: sec.dataset.url, times }));
    }),
  };
}

function renderBoard(board) {
  const data = boardRows(board);
  if (!data) return;
  const { t, list: upcoming } = soon(data.rows, data.tz);
  const list = board.querySelector('ol');
  const clock = board.querySelector('[data-clock]');
  const h24 = data.h24 ?? H24;
  if (clock) clock.textContent = tm(t.min, h24);
  const max = Number(board.dataset.rows || 5);
  if (!upcoming.length) {
    list.innerHTML = '';
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No scheduled departures in the next three hours.';
    list.append(li);
    return;
  }
  list.replaceChildren(...upcoming.slice(0, max).map(({ r, m, w }, i) => {
    const li = document.createElement('li');
    li.style.setProperty('--i', i);
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = r.short || '•';
    if (r.color) { badge.style.background = r.color; badge.style.color = r.text || '#fff'; }
    const to = document.createElement(r.url ? 'a' : 'span');
    to.className = 'to';
    if (r.url) { to.href = r.url; to.style.textDecoration = 'none'; }
    const dest = document.createElement('span');
    dest.className = 'dest';
    dest.textContent = `To ${r.to}`;
    to.append(dest);
    if (r.at) { const s = document.createElement('small'); s.textContent = r.at; to.append(s); }
    const time = document.createElement('time');
    time.textContent = fmt(m, h24);
    const s = document.createElement('small');
    s.textContent = waitText(w);
    time.append(s);
    li.append(badge, to, time);
    return li;
  }));
}

/**
 * The homepage board shows the featured city nearest the visitor (by timezone) and can switch
 * between cities. Each city's data is a small JSON file fetched on demand.
 */
function setupCityBoard(board) {
  const options = JSON.parse(board.dataset.boards);
  let zone = '';
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* old browser */ }
  const match = (o) => o.tz.some((z) => (z.endsWith('/') ? zone.startsWith(z) : zone === z));
  const chips = [...document.querySelectorAll('[data-city]')];
  const show = async (o) => {
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.city === o.key)));
    try {
      const data = await fetch(o.src).then((r) => r.json());
      board._data = data;
      const name = board.querySelector('[data-board-name]');
      if (name) { name.textContent = `${o.city}: ${data.name}`; name.href = data.url; }
      const foot = board.querySelector('[data-board-foot]');
      if (foot) foot.textContent = `Scheduled departures from ${data.system}, from the published timetable. Times are local to ${o.city}.`;
      renderBoard(board);
    } catch { /* offline: keep what is shown */ }
  };
  chips.forEach((c) => c.addEventListener('click', () => show(options.find((o) => o.key === c.dataset.city))));
  show(options.find(match) || options[0]);
}

function setupBoards() {
  const boards = document.querySelectorAll('[data-board]');
  if (!boards.length) return;
  boards.forEach((b) => { if (b.dataset.boards) setupCityBoard(b); });
  const tick = () => boards.forEach((b) => { if (!b.dataset.boards || b._data) renderBoard(b); });
  tick();
  setInterval(tick, 30_000);
}

/* ---------- saved stops and routes (this browser only) ---------- */
const FAV_KEY = 'stopwatch:saved';
const readFavs = () => { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; } };
const writeFavs = (v) => { try { localStorage.setItem(FAV_KEY, JSON.stringify(v.slice(0, 30))); } catch { /* private mode */ } };

function setupFavs() {
  const favs = readFavs();
  document.querySelectorAll('[data-fav]').forEach((btn) => {
    const id = btn.dataset.fav;
    const label = btn.querySelector('[data-fav-label]');
    const sync = () => {
      const on = readFavs().some((f) => f.id === id);
      btn.setAttribute('aria-pressed', String(on));
      if (label) label.textContent = on ? 'Saved' : 'Save';
    };
    sync();
    btn.addEventListener('click', () => {
      const list = readFavs();
      const i = list.findIndex((f) => f.id === id);
      if (i >= 0) list.splice(i, 1); else list.unshift({ id, name: btn.dataset.name, sub: btn.dataset.sub, url: location.pathname });
      writeFavs(list);
      sync();
    });
  });
  document.querySelectorAll('[data-saved]').forEach((box) => {
    const scope = box.dataset.saved;
    const items = favs.filter((f) => !scope || f.url.startsWith(scope));
    if (!items.length) return;
    const ul = box.querySelector('ul');
    ul.replaceChildren(...items.slice(0, 8).map((f) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = f.url;
      const span = document.createElement('span');
      span.textContent = f.name;
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = f.sub || '';
      span.append(meta);
      a.append(span);
      li.append(a);
      return li;
    }));
    box.hidden = false;
  });
}

/* ---------- search + near me ---------- */
/*
 * Search is split so no one downloads 100,000 stops: one index of every system, route and hub,
 * plus the stops of the system the rider is looking at. "Near me" reads small map tiles.
 */
let INDEX = null;
let GLOBAL = null;
const here = /^\/([a-z]{2})\/([a-z0-9-]+)/.exec(location.pathname);
function loadGlobal() {
  if (!GLOBAL) GLOBAL = fetch('/search/index.json').then((r) => r.json());
  return GLOBAL;
}
async function loadIndex() {
  if (!INDEX) {
    INDEX = loadGlobal().then(async (g) => {
      const items = g.items;
      if (here && g.systems.includes(`${here[1]}/${here[2]}`)) {
        try { items.push(...(await fetch(`/search/${here[1]}/${here[2]}.json`).then((r) => r.json()))); } catch { /* offline */ }
      }
      return items;
    });
  }
  return INDEX;
}
const TILE = 4; // tiles are a quarter of a degree
async function loadNear(la, lo) {
  const g = await loadGlobal();
  const have = new Set(g.tiles);
  const y = Math.floor(la * TILE), x = Math.floor(lo * TILE);
  const keys = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (have.has(`${y + i}_${x + j}`)) keys.push(`${y + i}_${x + j}`);
  const parts = await Promise.all(keys.map((k) => fetch(`/near/${k}.json`).then((r) => r.json()).catch(() => [])));
  return parts.flat();
}
const norm = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const KIND = ['Town', 'Route', 'Hub', 'Stop'];

function score(item, q, tokens) {
  const [type, name, sub, , , , , short] = item;
  const hay = item._h || (item._h = ` ${norm(`${name} ${sub}`)} `);
  for (const t of tokens) if (!hay.includes(` ${t}`)) return -1;
  let s = [40, 30, 25, 10][type];
  if (type === 1 && short && tokens.includes(norm(short))) s += 50;
  if (norm(name).startsWith(q)) s += 15;
  if (type === 3 && /^[a-z0-9]{3,}$/.test(q) && /\d/.test(q) && hay.includes(` ${q} `)) s += 100;
  return s;
}

function renderResults(items, empty) {
  const ul = document.getElementById('search-results');
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'search-empty';
    li.textContent = empty;
    ul.replaceChildren(li);
    return;
  }
  ul.replaceChildren(...items.map((it, i) => {
    const [type, name, sub, url, , , color, short, dist] = it;
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('role', 'option');
    a.setAttribute('aria-selected', String(i === 0));
    const kind = document.createElement('span');
    kind.className = 'kind';
    if (type === 1) {
      const b = document.createElement('span');
      b.className = 'badge';
      b.textContent = short || '•';
      if (color) { b.style.background = color; b.style.color = ink(color); }
      kind.append(b);
    } else kind.textContent = KIND[type];
    const text = document.createElement('span');
    text.textContent = name;
    const small = document.createElement('small');
    small.textContent = dist != null ? `${sub} · ${dist < 1000 ? `${Math.round(dist / 10) * 10} m` : `${(dist / 1000).toFixed(1)} km`} away` : sub;
    text.append(small);
    a.append(kind, text);
    li.append(a);
    return li;
  }));
}

const HINT = here ? 'Type a route number, a stop name or a stop number, or a town anywhere.' : 'Type a town, an operator or a route number. Open a town to search its stops.';
function setupSearch() {
  const dialog = document.getElementById('search');
  const input = document.getElementById('search-input');
  if (!dialog || !input) return;
  const open = () => { if (!dialog.open) dialog.showModal(); input.focus(); loadIndex(); };
  document.querySelectorAll('[data-search-open]').forEach((b) => b.addEventListener('click', open));
  document.querySelector('[data-search-close]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !dialog.open && !/input|textarea|select/i.test(document.activeElement?.tagName || '')) { e.preventDefault(); open(); }
  });
  let seq = 0;
  input.addEventListener('input', async () => {
    const q = norm(input.value);
    const mine = ++seq;
    if (!q) { renderResults([], HINT); return; }
    const items = await loadIndex();
    if (mine !== seq) return;
    const tokens = q.split(' ');
    const hits = [];
    for (const it of items) { const s = score(it, q, tokens); if (s >= 0) hits.push([s, it]); }
    hits.sort((a, b) => b[0] - a[0]);
    renderResults(hits.slice(0, 30).map((h) => h[1]), here ? 'Nothing matches. Try fewer words, or the town name.' : 'Nothing matches. Try the town or operator name, or open a town to search its stops.');
  });
  input.addEventListener('keydown', (e) => {
    const links = [...document.querySelectorAll('#search-results a')];
    if (!links.length) return;
    let i = links.findIndex((a) => a.getAttribute('aria-selected') === 'true');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      i = (i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
      links.forEach((a, j) => a.setAttribute('aria-selected', String(j === i)));
      links[i].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && i >= 0) {
      e.preventDefault();
      location.href = links[i].href;
    }
  });
  renderResults([], HINT);

  document.querySelectorAll('[data-near-me]').forEach((btn) => btn.addEventListener('click', () => {
    open();
    if (!('geolocation' in navigator)) { renderResults([], 'This browser cannot share a location.'); return; }
    renderResults([], 'Finding stops near you…');
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: la, longitude: lo } = pos.coords;
      const items = await loadNear(la, lo);
      const rad = Math.PI / 180;
      const near = items.filter((it) => it[4]).map((it) => {
        const dLat = (it[4] - la) * rad, dLon = (it[5] - lo) * rad;
        const x = Math.sin(dLat / 2) ** 2 + Math.cos(la * rad) * Math.cos(it[4] * rad) * Math.sin(dLon / 2) ** 2;
        const d = 2 * 6371000 * Math.asin(Math.sqrt(x));
        return [...it.slice(0, 8), d];
      }).sort((a, b) => a[8] - b[8]).slice(0, 12);
      renderResults(near[0] && near[0][8] < 50_000 ? near : [], 'No covered stops near you yet. Stopwatch covers towns in Canada, the UK, Ireland, Australia, New Zealand and the US: pick a country from the home page.');
    }, () => renderResults([], 'Location is off. Search by stop name or number instead.'), { enableHighAccuracy: false, timeout: 10_000, maximumAge: 120_000 });
  }));
}

/* ---------- maps (loaded only when asked for) ---------- */
// MapLibre is served unbundled from /vendor (see scripts/vendor.mjs) and only fetched when a
// rider opens a map: its stylesheet alone is 65 KB, and it would otherwise sit in every page.
import vendor from '../data/vendor.json';
function loadMapCss() {
  if (document.querySelector('link[data-map-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `${vendor.maplibre}/maplibre-gl.css`;
  link.dataset.mapCss = '';
  document.head.append(link);
}

function setupMaps() {
  document.querySelectorAll('[data-map]').forEach((box) => {
    const btn = box.querySelector('.map-open');
    btn?.addEventListener('click', async () => {
      btn.textContent = 'Loading map…';
      try {
        const [{ Map: MLMap, NavigationControl, Popup }, data] = await Promise.all([
          import(/* @vite-ignore */ `${vendor.maplibre}/maplibre-gl.mjs`).then((m) => { loadMapCss(); return m; }),
          fetch(box.dataset.map).then((r) => r.json()),
        ]);
        const dark = matchMedia('(prefers-color-scheme: dark)').matches;
        btn.remove();
        const lines = data.dirs
          ? data.dirs.map((d) => ({ coords: d.line, color: data.color || '#15171a' }))
          : data.routes.map((r) => ({ coords: r.line, color: r.color || '#15171a', slug: r.slug, label: r.short ? `Route ${r.short} ${r.name}` : r.name }));
        const all = lines.flatMap((l) => l.coords);
        const lons = all.map((c) => c[0]), lats = all.map((c) => c[1]);
        // The view starts on the routes, and the routes are drawn as soon as the style is
        // parsed ('style.load'), not after every street tile and font has arrived ('load'),
        // which on a slow connection meant several seconds of an empty grey box.
        const map = new MLMap({
          container: box,
          style: `https://tiles.openfreemap.org/styles/${dark ? 'dark' : 'positron'}`,
          bounds: [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
          fitBoundsOptions: { padding: 36 },
          attributionControl: { compact: true },
          cooperativeGestures: true,
        });
        map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
        map.once('style.load', () => {
          map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: lines.map((l) => ({ type: 'Feature', properties: { color: l.color, slug: l.slug || '', label: l.label || '' }, geometry: { type: 'LineString', coordinates: l.coords } })) } });
          map.addLayer({ id: 'casing', type: 'line', source: 'routes', paint: { 'line-color': dark ? '#0f1113' : '#ffffff', 'line-width': 7 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
          map.addLayer({ id: 'routes', type: 'line', source: 'routes', paint: { 'line-color': ['get', 'color'], 'line-width': 4 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
          if (data.dirs) {
            const stops = new Map();
            for (const d of data.dirs) for (const [lon, lat, code, name, tp] of d.stops) if (lon) stops.set(code, { lon, lat, code, name, tp });
            map.addSource('stops', { type: 'geojson', data: { type: 'FeatureCollection', features: [...stops.values()].map((s) => ({ type: 'Feature', properties: { name: s.name, code: s.code, tp: s.tp }, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } })) } });
            map.addLayer({ id: 'stops', type: 'circle', source: 'stops', paint: { 'circle-radius': ['case', ['==', ['get', 'tp'], 1], 5.5, 3.5], 'circle-color': '#ffffff', 'circle-stroke-color': data.color || '#15171a', 'circle-stroke-width': 2.5 } });
            map.on('click', 'stops', (e) => {
              const f = e.features[0];
              const base = location.pathname.split('/').slice(0, 3).join('/');
              const el = document.createElement('div');
              const a = document.createElement('a');
              a.href = `${base}/stop/${f.properties.code}`;
              a.textContent = f.properties.name;
              el.append(a, document.createTextNode(` #${f.properties.code}`));
              new Popup({ closeButton: false }).setLngLat(e.lngLat).setDOMContent(el).addTo(map);
            });
          } else {
            map.on('click', 'routes', (e) => { const slug = e.features[0].properties.slug; if (slug) location.href = `${location.pathname}/${slug}`; });
            map.on('mouseenter', 'routes', () => { map.getCanvas().style.cursor = 'pointer'; });
            map.on('mouseleave', 'routes', () => { map.getCanvas().style.cursor = ''; });
          }
        });
      } catch {
        btn.textContent = 'The map could not load. Check your connection and try again.';
      }
    }, { once: true });
  });
}

/* ---------- small things ---------- */
function setupActions() {
  // Stop pages' embed code: copy it, or select it where the clipboard is not allowed.
  document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const box = b.parentElement.querySelector('textarea');
    const label = b.querySelector('[data-copy-label]');
    try { await navigator.clipboard.writeText(box.value); label.textContent = 'Copied'; } catch { box.focus(); box.select(); label.textContent = 'Press Ctrl+C to copy'; }
    setTimeout(() => { label.textContent = 'Copy code'; }, 2500);
  }));
  document.querySelectorAll('[data-print]').forEach((b) => b.addEventListener('click', () => window.print()));
  document.querySelectorAll('[data-share]').forEach((b) => b.addEventListener('click', async () => {
    const data = { title: document.title, url: location.href };
    try {
      if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(location.href); const l = b.querySelector('[data-share-label]'); if (l) { l.textContent = 'Link copied'; setTimeout(() => { l.textContent = 'Share'; }, 2000); } }
    } catch { /* cancelled */ }
  }));
}

/**
 * Each ad is requested when its slot comes within a screen of the viewport, not on load:
 * a slot with no width yet makes AdSense throw "No slot size for availableWidth=0", and an ad
 * that loads far below the fold is an impression nobody sees, which drags down what every
 * impression earns.
 */
/**
 * The AdSense library (about 230 KB of script) is fetched after the page has painted, or on the
 * rider's first scroll or tap, whichever comes first. Loaded in <head>, its parsing held the
 * homepage headline back 1.7 s on a mid-range phone. Slots queued before it arrives are filled
 * when it does, and Auto Ads still run.
 */
const AD_SRC = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7164999486301748';
function loadAdSense() {
  if (window.__stopwatchAds) return;
  window.__stopwatchAds = true;
  const s = document.createElement('script');
  s.async = true;
  s.src = AD_SRC;
  s.crossOrigin = 'anonymous';
  document.head.append(s);
}
function scheduleAdSense() {
  const go = () => loadAdSense();
  ['scroll', 'pointerdown', 'keydown'].forEach((e) => addEventListener(e, go, { once: true, passive: true }));
  const idle = () => (window.requestIdleCallback ? requestIdleCallback(go, { timeout: 3000 }) : setTimeout(go, 1500));
  if (document.readyState === 'complete') idle(); else addEventListener('load', idle, { once: true });
}

function setupAds() {
  const slots = [...document.querySelectorAll('ins.adsbygoogle:not([data-adsbygoogle-status])')];
  if (!slots.length) return;
  const fill = (ins) => {
    if (ins.dataset.requested || !ins.offsetWidth) return false;
    ins.dataset.requested = '1';
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { /* blocked */ }
    return true;
  };
  if (!('IntersectionObserver' in window)) { slots.forEach(fill); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting && fill(e.target)) io.unobserve(e.target);
  }, { rootMargin: '600px 0px' });
  slots.forEach((ins) => io.observe(ins));
}

/* ---------- from/to picker ---------- */
/*
 * Two towns on one network straight to their journey page. The town list (places.json) is fetched
 * on first focus, so a rider who never touches the picker downloads nothing.
 */
function setupPickers() {
  document.querySelectorAll('[data-picker]').forEach((form) => {
    const key = form.dataset.picker;
    const [fromIn, toIn] = form.querySelectorAll('input');
    const [fromList, toList] = form.querySelectorAll('datalist');
    const msg = form.querySelector('.picker-msg');
    let data = null;
    const load = () => (data ??= fetch(`/${key}/places.json`).then((r) => r.json()).catch(() => { data = null; return null; }));
    const find = (d, v) => { const q = norm(v); return q ? d.p.findIndex((p) => norm(p[1]) === q) : -1; };
    const fill = (list, idx, d) => { list.replaceChildren(...idx.map((i) => d.p[i][1]).sort((a, b) => a.localeCompare(b)).map((n) => Object.assign(document.createElement('option'), { value: n }))); };
    const fillTo = async () => {
      const d = await load(); if (!d) return;
      const a = find(d, fromIn.value);
      fill(toList, a >= 0 ? d.d[a] : [], d);
    };
    const prime = async () => {
      const d = await load(); if (!d || fromList.children.length) return;
      fill(fromList, d.p.map((_, i) => i).filter((i) => d.d[i].length), d);
      fillTo();
    };
    fromIn.addEventListener('focus', prime);
    toIn.addEventListener('focus', prime);
    fromIn.addEventListener('change', () => { msg.textContent = ''; fillTo(); });
    form.querySelector('[data-picker-swap]').addEventListener('click', () => { [fromIn.value, toIn.value] = [toIn.value, fromIn.value]; msg.textContent = ''; fillTo(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = await load();
      if (!d) { msg.textContent = 'Could not load the list of towns. Check your connection and try again.'; return; }
      const a = find(d, fromIn.value);
      if (a < 0 || !d.d[a].length) { msg.textContent = `No direct services found from "${fromIn.value.trim()}". Pick a town from the list.`; fromIn.focus(); return; }
      const from = `/${key}/from/${d.p[a][0]}`;
      if (!toIn.value.trim()) { location.href = from; return; }
      const b = find(d, toIn.value);
      if (b >= 0 && d.d[a].includes(b)) { location.href = `${from}/to/${d.p[b][0]}`; return; }
      msg.replaceChildren(`No direct service from ${d.p[a][1]} to ${toIn.value.trim()}. `, Object.assign(document.createElement('a'), { href: from, textContent: `See everywhere you can go from ${d.p[a][1]}` }), '.');
    });
  });
}

function setupOffline() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
}

setupSections();
setupBoards();
setupFavs();
setupSearch();
setupMaps();
setupActions();
setupPickers();
scheduleAdSense();
setupAds();
setupOffline();
