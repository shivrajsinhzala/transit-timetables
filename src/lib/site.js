/**
 * The one place the site's address is decided. Pages, layouts, astro.config.mjs and every script
 * import it, so canonicals, og:url, og:image, JSON-LD, sitemaps, robots.txt and the llms files
 * all follow one value.
 *
 *   SITE_URL             the public origin, no trailing slash. Default: https://stopwatchtimetables.com
 *   MIGRATION_REDIRECTS  "on" makes deploy/make-migration.mjs write the 301 server block that sends
 *                        every request on the old host to the same path and query on SITE_URL.
 *                        Default: off (the old host keeps serving the site as before).
 *
 * scripts/verify-build.mjs fails a build that still contains any OLD_HOSTS address.
 */
const fromEnv = (globalThis.process?.env?.SITE_URL || '').trim().replace(/\/+$/, '');

export const SITE = fromEnv || 'https://stopwatchtimetables.com';
export const SITE_HOST = new URL(SITE).host;

/** Hosts the site used to live on. Requests there 301 to SITE once MIGRATION_REDIRECTS is on. */
export const OLD_HOSTS = ['transit.shivrajsinh.in'];

export const MIGRATION_REDIRECTS = (globalThis.process?.env?.MIGRATION_REDIRECTS || 'off').toLowerCase() === 'on';

/** Absolute URL on this site for a path with or without a leading slash. */
export const abs = (path = '') => `${SITE}/${String(path).replace(/^\/+/, '')}`;
