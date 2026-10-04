#!/usr/bin/env node
/**
 * Tells IndexNow (Bing, Yandex, Seznam, Naver; Google does not take part) about every URL in
 * the live sitemap, so new and changed pages are crawled in days rather than weeks.
 * The key is a public verification token, not a secret: it is served at /<key>.txt.
 */
import fs from 'node:fs';

const HOST = 'transit.shivrajsinh.in';
const key = fs.readFileSync('data/indexnow-key.txt', 'utf8').trim();
const index = await (await fetch(`https://${HOST}/sitemap-index.xml`)).text();
const urls = [];
for (const sm of [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])) {
  const xml = await (await fetch(sm)).text();
  urls.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
}
for (let i = 0; i < urls.length; i += 10000) {
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${key}.txt`, urlList: urls.slice(i, i + 10000) }),
  });
  console.log(`IndexNow: ${urls.slice(i, i + 10000).length} URLs -> HTTP ${res.status}`);
}
