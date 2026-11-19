/**
 * Stopwatch client script: everything that needs the rider's clock, location or browser.
 * The pages are complete without it (every timetable is in the HTML); this adds the next bus,
 * departure boards, search, near me, saved stops, maps and offline support on top.
 */

import { now, dayKey, clockText, waitText, upcoming as soon } from './clock.js';

/** Route badge colours: the route colour darkened until white or navy text reads at 4.5:1 (mirrors badgeBg/inkFor in format.js). */
const lumOf = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const NAVY_L = 0.0164;
function safeBg(hex) {
  if (lumOf(hex) == null) return '#14233B';
  let h = `#${String(hex).replace('#', '')}`;
  for (let k = 0; k < 12; k++) {
    const L = lumOf(h);
    if (1.05 / (L + 0.05) >= 4.5 || (L + 0.05) / (NAVY_L + 0.05) >= 4.5) break;
    h = '#' + [1, 3, 5].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * 0.88).toString(16).padStart(2, '0')).join('');
  }
  return h;
}
function ink(hex) {
  const L = lumOf(safeBg(hex));
  return 1.05 / (L + 0.05) >= (L + 0.05) / (NAVY_L + 0.05) ? '#FFFFFF' : '#14233B';
}
function badgeEl(r, size = '') {
  const b = document.createElement('span');
  b.className = `badge${size ? ` ${size}` : ''}${lumOf(safeBg(r.color)) > 0.8 ? ' light' : ''}`;
  b.textContent = r.short || '•';
  b.style.background = safeBg(r.color);
  b.style.color = ink(r.color);
  return b;
}
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/** 24-hour clocks where the page says so (data-h24), 12-hour elsewhere. */
const H24 = document.documentElement.hasAttribute('data-h24');
const fmt = (m, h24 = H24) => clockText(m, h24);
const ampm = (m, h24 = H24) => (h24 ? '' : ((m % 1440) + 1440) % 1440 >= 720 ? 'pm' : 'am');
const tm = (m, h24 = H24) => `${fmt(m, h24)} ${ampm(m, h24)}`.trim();
/** Countdown: "N min" (at least 1), "Due" only in the last half minute. */
const inText = (w, secs = 60) => (w <= 0 && secs < 30 ? 'Due' : w < 60 ? `${Math.max(1, w)} min` : `${Math.floor(w / 60)} h ${w % 60 ? `${w % 60} min` : ''}`.trim());

const cfgEl = document.getElementById('cfg');
const CFG = cfgEl ? JSON.parse(cfgEl.textContent) : null;
const isPhone = () => matchMedia('(max-width: 640px)').matches;

/* ---------- day tabs, next departure, past and next marks (route, stop, hub, journey pages) ---------- */
function markHours(panel, t) {
  const spans = [...panel.querySelectorAll('span[data-m]')];
  let next = null;
  spans.forEach((s) => {
    const m = Number(s.dataset.m);
    s.classList.toggle('past', m < t.min);
    s.classList.remove('next');
    if (next == null && m >= t.min) next = s;
  });
  if (next) next.classList.add('next');
  panel.querySelectorAll('tr[data-h]').forEach((tr) => {
    const h = Number(tr.dataset.h);
    tr.classList.toggle('now', h === Math.floor(t.min / 60));
    tr.classList.toggle('gone', h < Math.floor(t.min / 60));
  });
  return next;
}

function setupSections() {
  if (!CFG) return;
  const t = now(CFG.tz);
  document.querySelectorAll('[data-section]').forEach((sec) => {
    const route = CFG.routes[sec.dataset.route];
    const tabs = [...sec.querySelectorAll('[role=tab]')];
    sec._show = (key) => {
      if (!sec.querySelector(`.panel[data-day="${key}"]`)) return false;
      tabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.day === key)));
      sec.querySelectorAll('.panel').forEach((p) => p.classList.toggle('on', p.dataset.day === key));
      sec._day = key;
      if (sec._byStop) sec._byStop();
      return true;
    };
    tabs.forEach((b) => b.addEventListener('click', () => sec._show(b.dataset.day)));
    if (!route) return;
    const key = dayKey(route, t.iso, t.wd);
    sec._today = key;
    const line = sec.querySelector('.next-line');
    const chip = sec.querySelector('[data-nextchip]');
    const panel = key && sec.querySelector(`.panel[data-day="${key}"]`);
    if (!panel) {
      const ex = (route.exceptions || []).find((e) => e.date === t.iso);
      if (line) line.textContent = ex && ex.runs === 'special' ? 'Today runs a special timetable. Check the operator before you travel.' : 'No service here today.';
      if (chip) chip.textContent = 'Not today';
      sec._next = Infinity;
      return;
    }
    sec._show(key);
    // A journey page's weekday tab can hold a departure that runs on some weekdays only (data-w).
    const runsToday = (e) => !e.dataset.w || e.dataset.w.split(',').includes(String(t.wd));
    const rows = [...panel.querySelectorAll('tr[data-m]')].filter((e) => e.dataset.m !== '' && runsToday(e));
    let next = null;
    if (rows.length) {
      rows.forEach((r) => { const m = Number(r.dataset.m); r.classList.toggle('past', m < t.min); if (!next && m >= t.min) next = r; });
      if (next) {
        next.classList.add('next');
        // Scroll the timetable box (not the page) so the next trip is the third row down.
        const box = next.closest('.tt-wrap');
        if (box) requestAnimationFrame(() => { box.scrollTop = Math.max(0, next.offsetTop - box.querySelector('thead').offsetHeight - next.offsetHeight * 2); });
      }
    } else {
      next = markHours(panel, t);
      // Stop pages: each route's hour grid opens at the current hour, not at the first bus.
      const row = next?.closest('tr');
      if (row && panel.scrollHeight > panel.clientHeight + 8) requestAnimationFrame(() => { panel.scrollTop += row.getBoundingClientRect().top - panel.getBoundingClientRect().top - 4; });
    }
    sec._next = next ? Number(next.dataset.m) - t.min : Infinity;
    if (chip) chip.textContent = next ? (sec._next < 60 ? `in ${Math.max(1, sec._next)} min` : tm(Number(next.dataset.m), CFG.h24 ?? H24)) : 'Done today';
    if (!line) return;
    if (!next) { line.textContent = 'No more departures today.'; return; }
    const b = document.createElement('b');
    const m = Number(next.dataset.m);
    b.textContent = tm(m, CFG.h24 ?? H24);
    line.replaceChildren(`Next scheduled departure${sec.dataset.from ? ` from ${sec.dataset.from}` : ''}: `, b, ` (${waitText(m - t.min)})`);
  });
  // Stop pages: the route leaving soonest comes first.
  document.querySelectorAll('[data-sortable]').forEach((box) => {
    [...box.children].sort((a, b) => (a._next ?? Infinity) - (b._next ?? Infinity)).forEach((c) => box.append(c));
  });
}

/* ---------- route pages: day, direction and view controls; the by-stop hour grid ---------- */
function parseCell(td, h24) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(td.textContent.trim());
  if (!m) return null;
  let h = Number(m[1]);
  if (!h24) { h %= 12; if (td.classList.contains('pm')) h += 12; }
  return h * 60 + Number(m[2]);
}
function setupRouteControls() {
  const ctl = document.querySelector('[data-controls]');
  if (!ctl || !CFG) return;
  const h24 = CFG.h24 ?? H24;
  const secs = [...document.querySelectorAll('section.direction[data-section]')];
  const press = (attr, val) => ctl.querySelectorAll(`[${attr}]`).forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(val))));
  let view = isPhone() ? 'stop' : 'grid';

  secs.forEach((sec) => {
    const box = sec.querySelector('[data-bystop]');
    const sel = box?.querySelector('select');
    if (!box || !sel) return;
    sec._byStop = () => {
      if (view !== 'stop') return;
      const panel = sec.querySelector('.panel.on');
      if (!panel) return;
      const ci = Number(sel.value);
      const times = [];
      let prev = -1, add = 0;
      panel.querySelectorAll('tbody tr').forEach((tr) => {
        const td = tr.children[ci];
        if (!td || td.classList.contains('no')) return;
        let m = parseCell(td, h24);
        if (m == null) return;
        m += add;
        if (prev >= 0 && m < prev - 720) { add += 1440; m += 1440; }
        prev = m;
        times.push(m);
      });
      times.sort((a, b) => a - b);
      const body = box.querySelector('tbody');
      const groups = new Map();
      times.forEach((m) => { const h = Math.floor(m / 60); if (!groups.has(h)) groups.set(h, []); groups.get(h).push(m); });
      body.replaceChildren(...[...groups].map(([h, ms]) => {
        const tr = el('tr'); tr.dataset.h = h;
        const hh = h % 24;
        tr.append(el('th', '', h24 ? `${String(hh).padStart(2, '0')}${h >= 24 ? '+' : ''}` : `${hh % 12 || 12} ${hh < 12 ? 'am' : 'pm'}${h >= 24 ? '+' : ''}`));
        const td = el('td');
        ms.forEach((m) => { const s = el('span', '', String(m % 60).padStart(2, '0')); s.dataset.m = m; td.append(s); });
        tr.append(td);
        return tr;
      }));
      if (sec._day && sec._day === sec._today) {
        const t = now(CFG.tz);
        const nx = markHours(box, t);
        const grid = box.querySelector('.hgrid');
        const row = nx?.closest('tr');
        if (row && grid) requestAnimationFrame(() => { grid.scrollTop = Math.max(0, row.offsetTop - 8); });
      }
    };
    sel.addEventListener('change', () => sec._byStop());
  });

  const setView = (v) => {
    view = v;
    press('data-ctl-view', v);
    secs.forEach((sec) => {
      const box = sec.querySelector('[data-bystop]');
      if (!box) return;
      box.hidden = v !== 'stop';
      sec.querySelectorAll('.panel').forEach((p) => { p.style.display = v === 'stop' ? 'none' : ''; });
      sec.querySelector('.next-line').hidden = v === 'stop';
      if (v === 'stop') sec._byStop();
    });
  };
  const setDir = (di) => {
    press('data-ctl-dir', di);
    secs.forEach((sec) => { sec.hidden = sec.dataset.dir !== String(di); });
    document.querySelectorAll('[data-dir-stops]').forEach((d) => { d.hidden = d.dataset.dirStops !== String(di); });
  };
  const setDay = (key) => {
    press('data-ctl-day', key);
    secs.forEach((sec) => sec._show && sec._show(key));
  };
  ctl.querySelectorAll('[data-ctl-day]').forEach((b) => b.addEventListener('click', () => setDay(b.dataset.ctlDay)));
  ctl.querySelectorAll('[data-ctl-dir]').forEach((b) => b.addEventListener('click', () => setDir(b.dataset.ctlDir)));
  ctl.querySelectorAll('[data-ctl-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.ctlView)));
  // Start on today's timetable, the first direction, and the view that suits the screen.
  const today = secs.map((s) => s._today).find(Boolean);
  if (today) press('data-ctl-day', today);
  if (ctl.querySelector('[data-ctl-dir]')) setDir(0);
  setView(view);
  // A link to a direction (#to-...) opens that direction.
  const hashDir = () => { const s = secs.find((x) => `#${x.id}` === location.hash); if (s) setDir(s.dataset.dir); };
  hashDir();
  addEventListener('hashchange', hashDir);
  document.querySelectorAll('.nx-dir-head a').forEach((a) => a.addEventListener('click', () => setTimeout(hashDir)));
}

/* ---------- next departures ---------- */
/**
 * Rows come from embedded JSON (home page) or are read off the timetables on the page (route,
 * stop and hub pages), so a board never shows anything the timetable below it does not.
 */
function sectionRows(secs) {
  const { wd } = now(CFG.tz);
  return secs.flatMap((sec) => {
    const route = CFG.routes[sec.dataset.route];
    // A journey table mixes routes: each row names its route (data-r) in the section's data-badges.
    const badges = sec.dataset.badges ? JSON.parse(sec.dataset.badges) : null;
    const groups = new Map();
    sec.querySelectorAll('.panel').forEach((p) => p.querySelectorAll('[data-m]').forEach((e) => {
      // A trip starting past the first column has no time there; a weekdays-only one (data-w) may not run today.
      if (e.dataset.m === '' || (e.dataset.w && !e.dataset.w.split(',').includes(String(wd)))) return;
      const g = badges ? Number(e.dataset.r) : 0;
      if (!groups.has(g)) groups.set(g, {});
      (groups.get(g)[p.dataset.day] ??= []).push(Number(e.dataset.m));
    }));
    return [...groups].map(([g, times]) => ({ ...route, short: sec.dataset.short, color: sec.dataset.color, ...(badges ? badges[g] : {}), to: sec.dataset.to, at: sec.dataset.at, url: sec.dataset.url, times }));
  });
}
function boardRows(board) {
  if (board._data) return board._data;
  const src = board.querySelector('script[type="application/json"]');
  if (src) return JSON.parse(src.textContent);
  if (!CFG) return null;
  return { tz: CFG.tz, h24: CFG.h24, rows: sectionRows([...document.querySelectorAll('[data-section]')]) };
}

function renderClock(box, min, h24) {
  if (!box) return;
  const text = tm(min, h24);
  if (!box.classList.contains('led-clock')) { box.textContent = text; return; }
  box.setAttribute('aria-label', `Current time ${text}`);
  box.replaceChildren(...text.split('').map((ch) => el('span', ch === ':' || ch === ' ' ? 'sep' : '', ch)));
}

function moreButton(box, onToggle) {
  const btn = box.querySelector(':scope > .nx-more');
  if (!btn || btn._wired) return btn;
  btn._wired = true;
  btn.addEventListener('click', () => { box._more = !box._more; onToggle(); });
  return btn;
}

function renderBoard(board) {
  const data = boardRows(board);
  if (!data) return;
  const merged = board.hasAttribute('data-merged');
  const { t, list: upcoming } = soon(data.rows, data.tz, merged ? 720 : 180);
  const list = board.querySelector('ol');
  const h24 = data.h24 ?? H24;
  renderClock(board.querySelector('[data-clock]'), t.min, h24);
  const base = Math.min(Number(board.dataset.rows || 5), merged && isPhone() ? 5 : 99);
  const max = board._more ? base * 2 : base;
  const btn = moreButton(board, () => renderBoard(board));
  list.classList.remove('static');
  if (!upcoming.length) {
    list.replaceChildren(el('li', 'empty', merged ? 'No more scheduled departures today. The timetables below show tomorrow’s times.' : 'No scheduled departures in the next three hours.'));
    if (btn) btn.hidden = true;
    return;
  }
  list.replaceChildren(...upcoming.slice(0, max).map(({ r, m, w }, i) => {
    const li = el('li');
    li.style.setProperty('--i', i);
    if (merged) {
      const note = el(r.url ? 'a' : 'span', 'note');
      if (r.url) note.href = r.url;
      note.append(el('b', '', `To ${r.to}`));
      if (r.at) note.append(r.at);
      li.append(badgeEl(r), note, el('span', 'in-chip', inText(w)), el('span', 'tm', tm(m, h24)));
    } else {
      const to = el(r.url ? 'a' : 'span', 'to');
      if (r.url) to.href = r.url;
      to.append(el('span', 'dest', `To ${r.to}`));
      if (r.at) to.append(el('small', '', r.at));
      const when = el('span', 'when');
      when.append(el('span', `due${i === 0 ? ' now' : ''}`, inText(w)), el('small', '', tm(m, h24)));
      li.append(badgeEl(r, 'md'), to, when);
    }
    return li;
  }));
  if (btn) { btn.hidden = upcoming.length <= base; btn.firstChild.textContent = board._more ? 'Show fewer ' : 'Show more '; }
}

/** Route pages: the next trips in each direction, from that direction's own timetable. */
function renderRouteNext(panel) {
  const secs = [...document.querySelectorAll('section.direction[data-section]')];
  const t = now(CFG.tz);
  const h24 = CFG.h24 ?? H24;
  renderClock(panel.querySelector('[data-clock]'), t.min, h24);
  // Phones: three trips a direction keep the timetable within reach; "Show more" opens the rest.
  const base = isPhone() ? 3 : Number(panel.dataset.rows || 5);
  panel.querySelectorAll('[data-nx-dir]').forEach((box) => {
    const sec = secs.find((s) => s.dataset.dir === box.dataset.nxDir);
    if (!sec) return;
    const { list } = soon(sectionRows([sec]), CFG.tz, 720);
    const ol = box.querySelector('ol');
    const btn = moreButton(box, () => renderRouteNext(panel));
    if (!list.length) {
      ol.classList.remove('static');
      ol.replaceChildren(el('li', '', 'No more departures this way today.'));
      if (btn) btn.hidden = true;
      return;
    }
    const max = box._more ? base * 2 : base;
    ol.classList.remove('static');
    ol.replaceChildren(...list.slice(0, max).map(({ m, w }, i) => {
      const li = el('li');
      li.style.setProperty('--i', i);
      li.append(el('span', 'in-chip', w < 1 ? 'Due' : `in ${inText(w)}`), el('span', 'note', ''), el('span', 'tm', tm(m, h24)));
      return li;
    }));
    if (btn) { btn.hidden = list.length <= base; btn.firstChild.textContent = box._more ? 'Show fewer ' : 'Show more '; }
  });
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
  const chips = [...board.querySelectorAll('[data-city]')];
  const show = async (o, picked) => {
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.city === o.key)));
    try {
      const data = await fetch(o.src).then((r) => r.json());
      board._data = data;
      const name = board.querySelector('[data-board-name]');
      if (name) { name.textContent = o.city; name.href = data.url; }
      const hint = board.querySelector('[data-board-hint]');
      if (hint) hint.textContent = picked ? `${data.name}, ${data.system}` : `${data.name}, ${data.system} · picked from your time zone`;
      renderBoard(board);
    } catch { /* offline: keep what is shown */ }
  };
  chips.forEach((c) => c.addEventListener('click', () => show(options.find((o) => o.key === c.dataset.city), true)));
  const local = options.find(match);
  show(local || options[0], !local);
}

function setupBoards() {
  const boards = [...document.querySelectorAll('[data-board]')];
  const routeNext = CFG && document.querySelector('[data-nx]');
  boards.forEach((b) => { if (b.dataset.boards) setupCityBoard(b); });
  const tick = () => {
    boards.forEach((b) => { if (!b.dataset.boards || b._data) renderBoard(b); });
    if (routeNext) renderRouteNext(routeNext);
  };
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
  document.querySelectorAll('[data-saved-count]').forEach((e) => { if (favs.length) e.textContent = `${favs.length} on this phone`; });
  document.querySelectorAll('[data-saved]').forEach((box) => {
    const scope = box.dataset.saved;
    const items = favs.filter((f) => !scope || f.url.startsWith(scope));
    if (!items.length) return;
    const ul = box.querySelector('ul');
    ul.replaceChildren(...items.slice(0, 12).map((f) => {
      const li = el('li');
      const a = el('a');
      a.href = f.url;
      a.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.6l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" fill="#F5B700" stroke="#F5B700" stroke-width="2" stroke-linejoin="round"/></svg>';
      const span = el('span', '', f.name);
      span.append(el('span', 'meta', f.sub || ''));
      a.append(span);
      li.append(a);
      return li;
    }));
    ul.hidden = false;
    box.hidden = false;
    const empty = box.querySelector('[data-saved-empty]');
    if (empty) {
      empty.hidden = true;
      const h = el('h2', '', 'Your saved stops');
      h.style.cssText = 'font-size:28px;margin:0 0 14px';
      box.prepend(h);
    }
  });
}

/* ---------- theme, menu, offline ---------- */
function setupChrome() {
  const root = document.documentElement;
  const KEY = 'stopwatch:theme';
  const sys = () => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const current = () => root.dataset.theme || 'auto';
  const sync = () => document.querySelectorAll('[data-theme-set]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeSet === current())));
  const set = (mode) => {
    if (mode === 'auto') { delete root.dataset.theme; try { localStorage.removeItem(KEY); } catch { /* private */ } } else { root.dataset.theme = mode; try { localStorage.setItem(KEY, mode); } catch { /* private */ } }
    sync();
  };
  document.querySelectorAll('[data-theme-toggle]').forEach((b) => b.addEventListener('click', () => set((root.dataset.theme || sys()) === 'dark' ? 'light' : 'dark')));
  document.querySelectorAll('[data-theme-set]').forEach((b) => b.addEventListener('click', () => set(b.dataset.themeSet)));
  sync();

  const menu = document.getElementById('menu');
  if (menu) {
    document.querySelectorAll('[data-menu-open]').forEach((b) => b.addEventListener('click', () => menu.showModal()));
    menu.querySelector('[data-menu-close]')?.addEventListener('click', () => menu.close());
    menu.addEventListener('click', (e) => { if (e.target === menu || e.target.closest('a, [data-search-open], [data-near-me]')) menu.close(); });
  }

  const offline = () => root.classList.toggle('is-offline', !navigator.onLine);
  addEventListener('online', offline);
  addEventListener('offline', offline);
  offline();
}

/* ---------- system pages: route finder; country pages: region filter ---------- */
function setupFinder() {
  const box = document.querySelector('[data-finder]');
  if (!box) return;
  const q = box.querySelector('[data-finder-q]');
  const items = [...box.querySelectorAll('li[data-q]')];
  const count = box.querySelector('[data-finder-count]');
  const none = box.querySelector('[data-finder-none]');
  const freq = box.querySelector('[data-finder-freq]');
  let mode = '';
  const apply = () => {
    const text = (q?.value || '').trim().toLowerCase();
    const onlyFreq = freq?.getAttribute('aria-checked') === 'true';
    let n = 0;
    items.forEach((li) => {
      const ok = (!text || li.dataset.q.includes(text)) && (!mode || li.dataset.mode === mode) && (!onlyFreq || li.hasAttribute('data-freq'));
      li.hidden = !ok;
      if (ok) n++;
    });
    box.querySelectorAll('.sub-h').forEach((h) => { const ul = h.nextElementSibling; h.hidden = ul && ![...ul.children].some((li) => !li.hidden); });
    if (count) count.textContent = n;
    if (none) none.hidden = n > 0;
  };
  q?.addEventListener('input', apply);
  box.querySelectorAll('[data-finder-mode]').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.finderMode;
    box.querySelectorAll('[data-finder-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    apply();
  }));
  freq?.addEventListener('click', () => { freq.setAttribute('aria-checked', String(freq.getAttribute('aria-checked') !== 'true')); apply(); });
}
function setupRegions() {
  const tabs = [...document.querySelectorAll('[data-region]')];
  if (!tabs.length) return;
  tabs.forEach((b) => b.addEventListener('click', () => {
    tabs.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    document.querySelectorAll('[data-region-box]').forEach((r) => { r.hidden = Boolean(b.dataset.region) && r.dataset.regionBox !== b.dataset.region; });
  }));
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
    if (type === 1) kind.append(badgeEl({ short, color }));
    else kind.textContent = KIND[type];
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
  if (window.__stopwatchAds || document.querySelector('script[src*="pagead2.googlesyndication.com"]')) {
    window.__stopwatchAds = true;
    return;
  }
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
  const idle = () => (window.requestIdleCallback ? requestIdleCallback(go, { timeout: 1500 }) : setTimeout(go, 800));
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
  }, { rootMargin: '800px 0px' });
  slots.forEach((ins) => io.observe(ins));
  watchUnfilled(slots);
}

/**
 * An ad AdSense leaves unfilled keeps its reserved space while any of it is on screen or above
 * it, and is folded away only while it sits wholly below the viewport. Hiding it at once (the old
 * CSS rule) pulled everything under it up by 120-250 px in front of the rider: a layout shift on
 * every unfilled slot, and a timetable row jumping away from a thumb.
 */
function watchUnfilled(slots) {
  const below = (el) => el.getBoundingClientRect().top > innerHeight;
  const fold = (box) => { if (below(box)) { box.classList.add('ad-gone'); return true; } return false; };
  const pending = new Set();
  const onScroll = () => { for (const box of pending) if (fold(box)) pending.delete(box); if (!pending.size) removeEventListener('scroll', onScroll); };
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      if (r.target.dataset.adStatus !== 'unfilled') continue;
      const box = r.target.closest('.ad');
      if (!box || fold(box)) continue;
      box.classList.add('ad-empty');
      if (!pending.size) addEventListener('scroll', onScroll, { passive: true });
      pending.add(box);
    }
  });
  slots.forEach((ins) => mo.observe(ins, { attributes: true, attributeFilter: ['data-ad-status'] }));
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

setupChrome();
setupSections();
setupRouteControls();
setupBoards();
setupFavs();
setupFinder();
setupRegions();
setupSearch();
setupMaps();
setupActions();
setupPickers();
// Only pages Google may index carry ads (src/layouts/Base.astro sets data-ads).
if (document.documentElement.hasAttribute('data-ads')) {
  scheduleAdSense();
  setupAds();
}
setupOffline();
