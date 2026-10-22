/**
 * The embeddable board (/embed?s=<cc>/<system>/stop/<code>): the next departures at one stop, for
 * other websites to show in an iframe. It reads the stop page itself, the same timetable riders
 * see there, so the two can never disagree, and works it out again every 30 seconds.
 */
import { clockText, waitText, upcoming } from './clock.js';

const q = new URLSearchParams(location.search);
const path = q.get('s') || '';
const max = Math.min(10, Math.max(1, Number(q.get('rows')) || 5));
const box = document.getElementById('board');
const list = box.querySelector('ol');
const fail = (text) => { list.innerHTML = ''; const li = document.createElement('li'); li.className = 'empty'; li.textContent = text; list.append(li); };
if (q.get('theme') === 'light' || q.get('theme') === 'dark') document.documentElement.dataset.theme = q.get('theme');

async function load() {
  if (!/^[a-z]{2}\/[a-z0-9-]+\/stop\/[A-Za-z0-9._~%-]+$/.test(path)) throw new Error('bad stop');
  const res = await fetch(`/${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const cfg = JSON.parse(doc.getElementById('cfg').textContent);
  return {
    name: doc.querySelector('h1')?.textContent.trim() || 'This stop',
    tz: cfg.tz,
    h24: cfg.h24 ?? doc.documentElement.hasAttribute('data-h24'),
    rows: [...doc.querySelectorAll('[data-section]')].map((sec) => {
      const times = {};
      sec.querySelectorAll('.panel').forEach((p) => { times[p.dataset.day] = [...p.querySelectorAll('[data-m]')].map((el) => Number(el.dataset.m)); });
      return { ...cfg.routes[sec.dataset.route], short: sec.dataset.short, color: sec.dataset.color, text: sec.dataset.text, to: sec.dataset.to, times };
    }).filter((r) => r.days),
  };
}

function render(data) {
  const { t, list: next } = upcoming(data.rows, data.tz);
  box.querySelector('[data-clock]').textContent = clockText(t.min, data.h24) + (data.h24 ? '' : t.min >= 720 ? ' pm' : ' am');
  if (!next.length) { fail('No scheduled departures in the next three hours.'); return; }
  list.replaceChildren(...next.slice(0, max).map(({ r, m, w }) => {
    const li = document.createElement('li');
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = r.short || '•';
    if (r.color) { badge.style.background = r.color; badge.style.color = r.text || '#fff'; }
    const to = document.createElement('span');
    to.className = 'to';
    to.textContent = `To ${r.to}`;
    const time = document.createElement('time');
    time.textContent = clockText(m, data.h24);
    const small = document.createElement('small');
    small.textContent = waitText(w);
    time.append(small);
    li.append(badge, to, time);
    return li;
  }));
}

try {
  const data = await load();
  const link = box.querySelector('[data-name]');
  link.textContent = data.name;
  link.href = `/${path}`;
  box.querySelector('[data-full]').href = `/${path}`;
  render(data);
  setInterval(() => render(data), 30_000);
} catch {
  fail('This stop could not be loaded. Check the embed code.');
}
