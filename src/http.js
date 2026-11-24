import { config } from './config.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Vern mot SSRF: serveren henter bare fra kjente kilder, over https (http kun mot lokal testserver), og følger
// bare omdirigeringer til de samme kildene.
const ALLOWED = new Map(); // host -> fast opprinnelse; URL-en som hentes bygges på denne, ikke på inndata
export function allowHosts(urls) { for (const u of urls) { try { const x = new URL(u); ALLOWED.set(x.host, x.origin); } catch { } } }
allowHosts([config.stortingetApi, config.registerPage, config.brregApi, config.faktiskUrl, 'https://www.stortinget.no/', 'https://stortinget.no/']);
export function checkUrl(url) {
  const u = new URL(url);
  const local = /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(u.host);
  if (!(u.protocol === 'https:' || (u.protocol === 'http:' && local))) throw Object.assign(new Error('ulovlig protokoll'), { fatal: true });
  const origin = ALLOWED.get(u.host);
  if (!origin || origin !== u.origin) throw Object.assign(new Error('ukjent kilde: ' + u.host), { fatal: true });
  return new URL(u.pathname + u.search, origin).href;
}
async function safeFetch(url, init, hops = 4) {
  const res = await fetch(checkUrl(url), { ...init, redirect: 'manual' });
  if (res.status >= 300 && res.status < 400 && res.headers.get('location') && hops > 0) return safeFetch(new URL(res.headers.get('location'), url).href, init, hops - 1);
  return res;
}

/** Henter URL med retry og eksponentiell backoff. Returnerer null ved 404/410. */
export async function fetchRaw(url, { retries = 3, accept = 'application/json' } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await safeFetch(url, { headers: { accept, 'user-agent': config.userAgent } });
      if (res.status === 404 || res.status === 410) return null;
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status} ${url}`);
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} ${url}`), { fatal: true });
      return res;
    } catch (e) {
      lastErr = e;
      if (e.fatal) break;
      await sleep(500 * 2 ** i);
    }
  }
  throw lastErr;
}

export async function getJson(url, opts) {
  const res = await fetchRaw(url, opts);
  return res ? res.json() : null;
}

export async function getText(url, opts) {
  const res = await fetchRaw(url, { accept: 'text/html,*/*', ...opts });
  return res ? res.text() : null;
}

export async function getBuffer(url, opts) {
  const res = await fetchRaw(url, { accept: 'application/pdf,*/*', ...opts });
  return res ? new Uint8Array(await res.arrayBuffer()) : null;
}

/** Kjører fn over items med begrenset samtidighet og litt pause mellom kall. */
export async function mapLimit(items, fn, limit = config.concurrency) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
      if (config.delayMs) await sleep(config.delayMs);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Enkel minnecache med TTL, brukt av live-oppslag mot Brreg. */
export class TtlCache {
  constructor(ttlMs, max = 2000) { this.ttl = ttlMs; this.max = max; this.map = new Map(); }
  get(k) {
    const e = this.map.get(k);
    if (!e) return undefined;
    if (Date.now() > e.t) { this.map.delete(k); return undefined; }
    return e.v;
  }
  set(k, v) {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value);
    this.map.set(k, { v, t: Date.now() + this.ttl });
  }
}
