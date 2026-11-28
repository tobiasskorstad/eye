// Alle aksjeselskaper på Oslo Børs, Euronext Expand og Euronext Growth – ikke bare dem med nylige innsidehandler.
//
// Kilder:
// - Oslo Børs NewsWeb: hvilke utstedere som har sendt meldinger. NewsWeb blander aksjer og obligasjoner, så et selskap
//   regnes som aksjeselskap på børsen når det har meldt innsidehandel (kategori 1102) eller flagging (1006, gjelder bare
//   aksjer) det siste året, eller er notert på Euronext Growth (MERK) eller Expand (XOAX).
// - Selskapets egen beskrivelse («About …») fra nyeste halvårs- eller årsrapportmelding.
// - Wikidata (CC0): nettsted, stiftelsesår og bransje for selskaper med notering på Oslo Børs.
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { getJson, allowHosts } from './http.js';
import { about } from './insider-parse.js';

const API = config.osloBorsApi, WIKIDATA = config.wikidataUrl;
allowHosts([API, WIKIDATA]);
const DAY = 864e5, sleep = ms => new Promise(r => setTimeout(r, ms));
const MARKET = { XOSL: 'Oslo Børs', XOAX: 'Euronext Expand', MERK: 'Euronext Growth' };
const iso = x => x.toISOString().slice(0, 10);

/** Henter meldingslisten måned for måned (NewsWeb gir maks ~600 meldinger per kall). */
async function monthly(cat, months, to = new Date()) {
  const out = [];
  for (let i = 0; i < months; i++) {
    const t = new Date(to - i * 30 * DAY), f = new Date(to - (i + 1) * 30 * DAY);
    const d = await getJson(`${API}/list?category=${cat}&fromDate=${iso(f)}&toDate=${iso(t)}`, { method: 'POST' }).catch(() => null);
    out.push(...(d?.data?.messages || []));
    await sleep(config.delayMs);
  }
  return out;
}

/** Ren logikk: velger aksjeselskapene ut fra meldingslister. */
export function pickIssuers({ insider = [], flagging = [], reports = [] }) {
  const eq = new Map();
  const add = (m, why) => {
    const tick = m.issuerSign; if (!tick) return;
    const mk = (m.markets || []).find(x => MARKET[x]);
    const e = eq.get(tick) || { tick, navn: m.issuerName, marked: mk ? MARKET[mk] : null, grunn: new Set() };
    if (!e.marked && mk) e.marked = MARKET[mk];
    e.grunn.add(why); eq.set(tick, e);
  };
  for (const m of insider) add(m, 'innside');
  for (const m of flagging) add(m, 'flagg');
  for (const m of reports) if ((m.markets || []).some(x => x === 'MERK' || x === 'XOAX')) add(m, 'marked');
  // Nyeste rapportmelding per selskap: kilde til «About»-teksten
  const latest = new Map();
  for (const m of [...reports].sort((a, b) => String(b.publishedTime).localeCompare(String(a.publishedTime)))) if (!latest.has(m.issuerSign)) latest.set(m.issuerSign, m);
  return [...eq.values()].filter(e => e.marked).map(e => ({ tick: e.tick, navn: e.navn, marked: e.marked, rapport: latest.get(e.tick)?.messageId || null }));
}

/** Wikidata: selskaper notert på Oslo Børs eller Euronext Growth Oslo, med nettsted, stiftelsesår, bransje og org.nr. */
export function parseWikidata(d) {
  const out = {};
  for (const b of d?.results?.bindings || []) {
    const v = k => b[k]?.value;
    const tick = v('tick'), nr = v('org');
    const k = tick ? tick.toUpperCase() : nr ? '#' + nr : null; if (!k) continue;
    const x = out[k] ||= { navn: v('cLabel'), bransje: [] };
    if (nr && /^\d{9}$/.test(nr)) x.nr = nr;
    if (v('web') && /^https?:\/\//.test(v('web'))) x.web = v('web');
    if (v('inc')) x.stiftet = Number(v('inc').slice(0, 4)) || undefined;
    if (v('desc') && !x.desc) x.desc = v('desc');
    const ind = v('indLabel'); if (ind && !/^Q\d+$/.test(ind) && !x.bransje.includes(ind)) x.bransje.push(ind);
    x.wd = v('c');
  }
  return out;
}
export async function fetchWikidataListed() {
  const q = `SELECT ?c ?cLabel ?desc ?tick ?org ?web ?inc ?indLabel WHERE {
    VALUES ?ex { wd:Q909158 wd:Q107190302 } ?c p:P414 ?st . ?st ps:P414 ?ex . FILTER NOT EXISTS { ?st pq:P582 ?end }
    OPTIONAL { ?st pq:P249 ?tick } OPTIONAL { ?c wdt:P2333 ?org } OPTIONAL { ?c wdt:P856 ?web } OPTIONAL { ?c wdt:P571 ?inc }
    OPTIONAL { ?c wdt:P452 ?ind } OPTIONAL { ?c schema:description ?desc FILTER(LANG(?desc)="nb") }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "nb,en". } }`;
  return parseWikidata(await getJson(`${WIKIDATA}?format=json&query=${encodeURIComponent(q)}`, { accept: 'application/sparql-results+json' }));
}

/**
 * Liste over alle aksjeselskaper på børsen, med beskrivelse. Listen bygges på nytt en gang i uken;
 * beskrivelsene hentes bare for selskaper vi ikke har lest før (eller hvert kvartal).
 */
export async function fetchListed({ warnings = [], maxAbout = 120 } = {}) {
  const file = path.join(config.dataDir, 'borsen-cache.json');
  let cache = {}; try { cache = JSON.parse(await fs.readFile(file, 'utf8')); } catch { }
  const now = Date.now();
  if (!cache.liste || now - cache.t > 7 * DAY) {
    const [insider, flagging, r1, r2] = [await monthly(1102, 12), await monthly(1006, 12), await monthly(1002, 12), await monthly(1001, 12)];
    const liste = pickIssuers({ insider, flagging, reports: [...r1, ...r2] });
    // Ny liste godtas bare hvis den ikke har krympet mye (f.eks. hvis NewsWeb svarte halvveis)
    if (liste.length && liste.length >= (cache.liste?.length || 0) * 0.6) Object.assign(cache, { t: now, liste });
    else warnings.push(`Børslisten ga bare ${liste.length} selskaper – bruker forrige`);
  }
  try { if (!cache.wd || now - cache.wdT > 7 * DAY) { cache.wd = await fetchWikidataListed(); cache.wdT = now; } }
  catch (e) { warnings.push('Wikidata (børsselskaper) feilet: ' + e.message); }
  cache.om ||= {};
  let n = 0;
  for (const s of cache.liste || []) {
    const o = cache.om[s.tick];
    if (!s.rapport || (o && (o.id === s.rapport || now - o.t < 90 * DAY)) || n >= maxAbout) continue;
    const r = await getJson(`${API}/message?messageId=${encodeURIComponent(s.rapport)}`).catch(() => null);
    const body = r?.data?.message?.body;
    cache.om[s.tick] = { t: now, id: s.rapport, om: body ? about(body) : null, d: (r?.data?.message?.publishedTime || '').slice(0, 10) };
    n++; await sleep(config.delayMs * 2);
  }
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(file, JSON.stringify(cache));
  return (cache.liste || []).map(s => {
    const o = cache.om[s.tick], w = cache.wd?.[s.tick.toUpperCase()];
    return { ...s, ...(o?.om ? { om: o.om, omDato: o.d, omU: `https://newsweb.oslobors.no/message/${o.id}` } : {}),
      ...(w ? { web: w.web, stiftet: w.stiftet, bransje: w.bransje?.slice(0, 2), nr: w.nr, wdesc: w.desc } : {}) };
  });
}
