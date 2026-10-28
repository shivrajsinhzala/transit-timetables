#!/usr/bin/env node
/**
 * Downloads the latest GTFS for every feed in data/systems.mjs into data/raw/.
 *
 * From the Mobility Database's mirror (files.mobilitydatabase.org), not the operators' own
 * servers: the mirror holds the same files, and a weekly refresh should not be load on them.
 * Feeds the mirror lacks or keeps stale (FEED_URLS in data/systems.mjs: the UK's regional Bus
 * Open Data files, Translink SEQ) come from the publisher.
 * - Six downloads at a time, each written to a temporary file and renamed only when complete,
 *   so a failed or cut-off download keeps the previous file: one bad night cannot empty a town.
 * - An unchanged feed is not downloaded again (If-None-Match with the last ETag).
 *
 * Also fetched: GeoNames' list of populated places (cities500.zip, CC BY 4.0), which names the
 * town each stop is in for the town-to-town pages (scripts/places.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { SYSTEMS, FEED_URLS } from '../data/systems.mjs';

const RAW = 'data/raw';
fs.mkdirSync(RAW, { recursive: true });
// A merged system (`merge`) is built from its source feeds by scripts/merge-feeds.mjs, not downloaded.
const FEEDS = [...new Set(SYSTEMS.flatMap((s) => s.merge ?? [s.feed]))];
const stats = { new: 0, same: 0, failed: 0 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Network errors and 5xx are tried three times: Translink's server drops the odd connection
// mid-download ("terminated", "fetch failed"), which kept Brisbane a fortnight stale in Oct 2026.
async function fetchFeed(id, url = FEED_URLS[id] || `https://files.mobilitydatabase.org/${id}/latest.zip`) {
  for (let attempt = 1; ; attempt++) {
    const err = await fetchOnce(id, url);
    if (!err) return;
    if (attempt === 3 || /^HTTP 4/.test(err)) {
      stats.failed++;
      console.warn(`! ${id}: ${err}, keeping the previous file`);
      return;
    }
    console.warn(`  ${id}: ${err}, retrying`);
    await sleep(attempt * 30_000);
  }
}

async function fetchOnce(id, url) {
  const file = path.join(RAW, `${id}.zip`);
  const etagFile = path.join(RAW, `${id}.etag`);
  const tmp = `${file}.part`;
  const headers = fs.existsSync(file) && fs.existsSync(etagFile) ? { 'If-None-Match': fs.readFileSync(etagFile, 'utf8').trim() } : {};
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15 * 60_000) });
    if (res.status === 304) { stats.same++; return; }
    if (!res.ok) return `HTTP ${res.status}`;
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
    const fd = fs.openSync(tmp, 'r');
    const head = Buffer.alloc(2);
    fs.readSync(fd, head, 0, 2, 0);
    fs.closeSync(fd);
    if (fs.statSync(tmp).size < 1000 || head.toString() !== 'PK') throw new Error('not a zip');
    fs.renameSync(tmp, file);
    const etag = res.headers.get('etag');
    if (etag) fs.writeFileSync(etagFile, etag); else fs.rmSync(etagFile, { force: true });
    stats.new++;
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    return e.message;
  }
}

const queue = [...FEEDS];
await Promise.all(Array.from({ length: 6 }, async () => { while (queue.length) await fetchFeed(queue.shift()); }));
console.log(`${FEEDS.length} feeds: ${stats.new} downloaded, ${stats.same} unchanged, ${stats.failed} failed`);
// Every feed failing means the network or the mirror is down: stop rather than rebuild stale data.
if (stats.failed === FEEDS.length) process.exit(1);
// A failed place-list download keeps last week's file; with none at all, journeys are skipped.
await fetchFeed('geonames-cities500', 'https://download.geonames.org/export/dump/cities500.zip');
