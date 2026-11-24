import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { config } from './config.js';
import { TtlCache } from './http.js';
import { buildData, files } from './build.js';
import * as br from './brreg.js';
import { validOrgnr } from './register.js';

// Kontrolltegn fjernes så ingen kan forfalske linjer i loggen via adressen.
const log = (...a) => console.log(new Date().toISOString(), '[server]', ...a.map(x => String(x).replace(/[\x00-\x1f\x7f]/g, '?').slice(0, 300)));

/* ---------- datatilstand ---------- */
const state = { pub: null, pubRaw: null, pubGz: null, etag: '', internal: null, idx: new Map(), cosByNr: new Map(), building: false, lastBuildDay: '', lastError: '' };

export async function loadData() {
  try {
    state.pubRaw = await fs.readFile(files.public());
    state.pub = JSON.parse(state.pubRaw);
    state.pubGz = zlib.gzipSync(state.pubRaw, { level: 9 });
    state.etag = `"${state.pub.hentet}"`;
    state.internal = JSON.parse(await fs.readFile(files.internal(), 'utf8'));
    state.idx = br.repIndex(state.internal.reps);
    state.cosByNr = new Map(state.pub.cos.map(c => [c.nr, c]));
    log('data lastet, hentet', state.pub.hentet);
  } catch { log('ingen data ennå'); }
}

const osloDay = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(new Date());
const osloHour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));

async function rebuild(reason) {
  if (state.building) return;
  state.building = true; log('starter bygg:', reason);
  try { await buildData(); await loadData(); state.lastError = ''; state.lastBuildDay = osloDay(); }
  catch (e) { state.lastError = e.message; log('bygg feilet:', e.message); }
  finally { state.building = false; }
}

function schedule() {
  if (config.refreshHour < 0) return;
  setInterval(() => {
    if (osloHour() === config.refreshHour && state.lastBuildDay !== osloDay()) rebuild('nattlig');
  }, 10 * 60 * 1000).unref();
}

/* ---------- hjelpere ---------- */
const wantsGzip = req => /\bgzip\b/.test(req.headers['accept-encoding'] || '');
function send(req, res, code, body, headers = {}, gz) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  if (wantsGzip(req) && buf.length > 1024) {
    res.writeHead(code, { ...headers, 'content-encoding': 'gzip', vary: 'accept-encoding' });
    return res.end(gz || zlib.gzipSync(buf));
  }
  res.writeHead(code, headers);
  res.end(buf);
}
const json = (res, code, body, headers = {}) =>
  send(res.req, res, code, JSON.stringify(body), { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...BASE_HEADERS, ...headers });
const hits = new Map();
let globalWindow = [];
// X-Forwarded-For kan forfalskes; brukes bare når TRUST_PROXY=1 (bak egen proxy), og da siste hopp.
const clientIp = req => config.trustProxy ? (req.headers['x-forwarded-for'] || '').split(',').at(-1).trim() || req.socket.remoteAddress : req.socket.remoteAddress || '';
function rateLimited(req, max = 60) {
  const ip = clientIp(req);
  const now = Date.now(), w = hits.get(ip) || [];
  globalWindow = globalWindow.filter(t => now - t < 60_000); globalWindow.push(now);
  if (globalWindow.length > config.globalPerMinute) return true; // vern for Brønnøysund og oss selv ved angrep fra mange adresser
  const recent = w.filter(t => now - t < 60_000); recent.push(now); hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > max;
}
const repRef = id => { const r = state.internal?.reps.find(x => x.id === id); return r ? { id: r.id, navn: r.navn, parti: r.parti } : null; };

/* ---------- live-oppslag mot Brreg ---------- */
const searchCache = new TtlCache(60 * 60 * 1000);
const enhetCache = new TtlCache(6 * 60 * 60 * 1000);

async function apiSearch(q) {
  const key = q.toLowerCase();
  let hit = searchCache.get(key);
  if (!hit) {
    const list = /^\d{9}$/.test(q.replace(/\s/g, '')) ? [await br.getEnhet(q.replace(/\s/g, ''))].filter(Boolean) : await br.searchByName(q, 15);
    hit = list.map(br.summarize);
    searchCache.set(key, hit);
  }
  return hit.map(c => {
    const known = state.cosByNr.get(c.nr);
    const ids = known ? [...new Set([...known.decl, ...Object.keys(known.roles)])] : [];
    return { ...c, politikere: ids.map(repRef).filter(Boolean) };
  });
}

async function apiEnhet(nr) {
  let hit = enhetCache.get(nr);
  if (!hit) {
    const e = await br.getEnhet(nr);
    if (!e) return null;
    const persons = await br.getPersonRoles(e.organisasjonsnummer);
    hit = { ...br.summarize(e), persons };
    enhetCache.set(nr, hit);
  }
  // Matcher mot representantene ved hvert oppslag (indeksen kan ha blitt oppdatert)
  const { roles, nRoller } = br.matchRoles(hit.persons, state.idx);
  const known = state.cosByNr.get(hit.nr);
  const ids = [...new Set([...(known?.decl || []), ...Object.keys(roles)])];
  const { persons, ...pub } = hit;
  return { ...pub, nRoller, personer: br.publicPersons(persons, state.idx), politikere: ids.map(id => ({ ...repRef(id), roller: roles[id] || [], oppgitt: !!known?.decl.includes(id) })).filter(p => p.id) };
}

/* ---------- statiske filer ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };
const BASE_HEADERS = {
  'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-frame-options': 'DENY',
  'strict-transport-security': 'max-age=31536000; includeSubDomains', 'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin', 'permissions-policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
};
const SECURITY = {
  ...BASE_HEADERS,
  'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};
const staticCache = new Map();
async function readStatic(file) {
  if (!staticCache.has(file)) { const b = await fs.readFile(file); staticCache.set(file, { b, gz: zlib.gzipSync(b, { level: 9 }) }); }
  return staticCache.get(file);
}
async function serveStatic(req, res, pathname) {
  let rel = 'index.html';
  try { if (pathname !== '/') rel = decodeURIComponent(pathname).replace(/^\/+/, ''); } catch { }
  if (rel.includes('\0') || rel.split('/').some(x => x.startsWith('.'))) rel = 'index.html'; // ingen skjulte filer eller ..
  let file = path.resolve(config.publicDir, rel);
  if (!file.startsWith(path.resolve(config.publicDir) + path.sep)) file = path.join(config.publicDir, 'index.html');
  let f;
  try { f = await readStatic(file); } catch { file = path.join(config.publicDir, 'index.html'); f = await readStatic(file); }
  const isHtml = file.endsWith('.html');
  send(req, res, 200, f.b, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': isHtml ? 'no-cache' : 'public, max-age=3600', ...SECURITY }, f.gz);
}

/* ---------- ruter ---------- */
export function createServer() {
  return http.createServer(async (req, res) => {
    if (req.url.length > 2048) return json(res, 414, { feil: 'for lang adresse' });
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { feil: 'kun GET' });
      if (p === '/api/data') {
        if (!state.pubRaw) return json(res, 503, { feil: 'Data bygges – prøv igjen om noen minutter', bygger: state.building });
        if (req.headers['if-none-match'] === state.etag) { res.writeHead(304); return res.end(); }
        return send(req, res, 200, state.pubRaw, { 'content-type': 'application/json; charset=utf-8', etag: state.etag, 'cache-control': 'public, max-age=300', ...BASE_HEADERS }, state.pubGz);
      }
      if (p === '/api/status') {
        return json(res, 200, { hentet: state.pub?.hentet || null, regDato: state.pub?.regDato || null, bygger: state.building, advarsler: state.pub?.warnings || [], sisteFeil: state.lastError || null });
      }
      if (p === '/api/sok') {
        if (rateLimited(req)) return json(res, 429, { feil: 'For mange søk – vent litt' });
        const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
        if (q.length < 2) return json(res, 400, { feil: 'Skriv minst to tegn' });
        return json(res, 200, { treff: await apiSearch(q) }, { 'cache-control': 'public, max-age=600' });
      }
      const m = p.match(/^\/api\/enhet\/(\d{9})$/);
      if (m) {
        if (rateLimited(req)) return json(res, 429, { feil: 'For mange oppslag – vent litt' });
        if (!validOrgnr(m[1])) return json(res, 400, { feil: 'Ugyldig organisasjonsnummer' });
        const e = await apiEnhet(m[1]);
        return e ? json(res, 200, e, { 'cache-control': 'public, max-age=3600' }) : json(res, 404, { feil: 'Fant ikke enheten' });
      }
      if (p.startsWith('/api/')) return json(res, 404, { feil: 'ukjent endepunkt' });
      return serveStatic(req, res, p);
    } catch (e) {
      log('feil', p, e.message);
      if (!res.headersSent) return json(res, 502, { feil: 'Kilden svarte ikke – prøv igjen' });
      res.destroy();
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await loadData();
  const srv = createServer();
  srv.headersTimeout = 10_000; srv.requestTimeout = 15_000; srv.keepAliveTimeout = 5_000; srv.maxHeadersCount = 50; // vern mot slowloris
  srv.listen(config.port, () => log(`lytter på :${config.port}`));
  schedule();
  if (!state.pub && config.buildOnStart) rebuild('første oppstart');
  process.on('SIGTERM', () => process.exit(0));
}
