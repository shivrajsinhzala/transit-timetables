/**
 * Deploys the built site to our own server over SSH, as an alternative to Cloudflare Workers
 * (whose free plan allows 100,000 requests a day; a plain web server has no such limit).
 * Used by scripts/build-all.mjs when it is run with `--server`.
 *
 * The server is set in deploy/server.env (not committed; see deploy/server.env.example):
 *   DEPLOY_SSH=user@host       how `ssh` reaches the server (a Host alias from ~/.ssh/config works)
 *   DEPLOY_PATH=/var/www/stopwatch
 *
 * Layout on the server, served by nginx (deploy/nginx.conf):
 *   <DEPLOY_PATH>/releases/<stamp>/   one complete copy of the site per refresh
 *   <DEPLOY_PATH>/current             symlink to the live release
 * Each shard is copied into the new release as soon as it is built (the shards hold different
 * files, so together they make the whole site), and `current` moves to it only once every shard
 * is there: visitors never see a half-deployed site. rsync compares contents (-c) and hardlinks
 * unchanged files from the live release (--link-dest), so a rebuild of the same data sends only
 * what changed. A weekly refresh, though, changes nearly every page (each says when it was
 * updated), so its release is a whole new copy of the site (~11 GB, more with the journey
 * pages), and the 45 GB disk the site shares with other sites does not hold three: while a
 * release uploads only the live one is kept, and afterwards the live one and the one before it
 * (for rollback).
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

function config() {
  const env = {};
  if (fs.existsSync('deploy/server.env')) {
    for (const line of fs.readFileSync('deploy/server.env', 'utf8').split('\n')) {
      const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  const host = process.env.DEPLOY_SSH || env.DEPLOY_SSH;
  const root = (process.env.DEPLOY_PATH || env.DEPLOY_PATH || '/var/www/stopwatch').replace(/\/$/, '');
  if (!host) throw new Error('no server: set DEPLOY_SSH in deploy/server.env (see deploy/server.env.example)');
  if (!/^\/[\w./-]+$/.test(root)) throw new Error(`DEPLOY_PATH must be an absolute path, not ${root}`);
  return { host, root };
}

const sh = (host, script) => execFileSync('ssh', ['-o', 'BatchMode=yes', host, script], { stdio: 'inherit' });

/**
 * Starts a release. `partial` (rebuilding one shard) starts from a hardlinked copy of the live
 * release, so the shards not rebuilt stay; a full build starts empty, so removed pages go away.
 */
export function startRelease({ partial = false } = {}) {
  const { host, root } = config();
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
  const dir = `${root}/releases/${stamp}`;
  sh(host, [
    'set -e',
    // A release newer than the live one is left from a refresh that failed halfway: drop it.
    `mkdir -p ${root}/releases`,
    `live=$(basename "$(readlink ${root}/current 2>/dev/null)" 2>/dev/null || true)`,
    `cd ${root}/releases && ls -1 | awk -v live="$live" '$0 > live' | xargs -r rm -rf`,
    // Room for the new release: drop the ones before the live one (see above).
    ...(partial ? [] : [`if [ -n "$live" ]; then ls -1 | awk -v live="$live" '$0 < live' | xargs -r rm -rf; fi`]),
    `mkdir -p ${dir}`,
    ...(partial ? [`if [ -d ${root}/current/ ]; then cp -al ${root}/current/. ${dir}/; fi`] : []),
  ].join('; '));
  console.log(`server: release ${stamp} started on ${host}`);
  return { host, root, dir };
}

/** Copies one built shard into the release. */
export function syncShard(release, localDir) {
  execFileSync('rsync', [
    // Flags macOS's own rsync (openrsync) also takes.
    '-rlcz', '--partial',
    '--link-dest', `${release.root}/current/`,
    `${localDir}/`, `${release.host}:${release.dir}/`,
  ], { stdio: 'inherit' });
}

/** Makes the release live (an atomic symlink swap), then deletes all but it and the one before. */
export function finishRelease(release) {
  const { host, root, dir } = release;
  sh(host, [
    'set -e',
    `test -f ${dir}/index.html || { echo "release has no index.html, not switching"; exit 1; }`,
    `ln -sfn ${dir} ${root}/current.new`,
    `mv -T ${root}/current.new ${root}/current`,
    `cd ${root}/releases && ls -1 | sort | head -n -2 | xargs -r rm -rf`,
  ].join('; '));
  console.log(`server: ${dir} is live`);
}
