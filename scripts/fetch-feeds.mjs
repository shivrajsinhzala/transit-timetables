#!/usr/bin/env node
/**
 * Downloads the latest GTFS for every system in data/systems.mjs into data/raw/.
 *
 * From the Mobility Database's mirror (files.mobilitydatabase.org), not BC Transit's own export
 * server: the mirror holds the same file, and a weekly refresh of 33 feeds should not be load on
 * the operator. A failed download keeps the previous file, so one bad night cannot empty a town.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SYSTEMS } from '../data/systems.mjs';

const RAW = 'data/raw';
fs.mkdirSync(RAW, { recursive: true });
let failed = 0;
const FEEDS = [...new Set(SYSTEMS.map((s) => s.feed))];
await Promise.all(FEEDS.map(async (id) => {
  const url = `https://files.mobilitydatabase.org/${id}/latest.zip`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000 || buf.subarray(0, 2).toString() !== 'PK') throw new Error('not a zip');
    fs.writeFileSync(path.join(RAW, `${id}.zip`), buf);
  } catch (e) {
    failed++;
    console.warn(`! ${id}: ${e.message}, keeping the previous file`);
  }
}));
console.log(`${FEEDS.length - failed}/${FEEDS.length} feeds downloaded`);
