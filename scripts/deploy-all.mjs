#!/usr/bin/env node
/** Deploys every shard Worker, then the router (which needs the shards to bind to). */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const plan = JSON.parse(fs.readFileSync('src/data/shards.json', 'utf8'));
for (const shard of plan.shards) {
  console.log(`\n→ stopwatch-${shard}`);
  execFileSync('npx', ['wrangler', 'deploy', '-c', `wrangler/${shard}.jsonc`], { stdio: 'inherit' });
}
console.log('\n→ router (transit-timetables)');
execFileSync('npx', ['wrangler', 'deploy'], { stdio: 'inherit' });
