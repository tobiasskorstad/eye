// Meldepliktig handel for primærinnsidere på Oslo Børs (MAR art. 19): styremedlemmer, toppledere og deres nærstående
// i alle børsnoterte selskaper. Kilde: Oslo Børs NewsWeb, kategori 1102. Oppdateres hver gang bygget kjører.
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { getJson, allowHosts } from './http.js';

const API = 'https://api3.oslo.oslobors.no/v1/newsreader';
allowHosts([API]);
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Antall aksjer: alle skilletegn er tusenskille. Kurs: siste skilletegn er desimaltegn.
const int = s => { if (!s) return null; const n = Number(String(s).replace(/[\s.,]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
const dec = s => { if (!s) return null; let t = String(s).replace(/\s/g, '').replace(/[.,]$/, ''); const i = Math.max(t.lastIndexOf('.'), t.lastIndexOf(',')); if (i >= 0) t = t.slice(0, i).replace(/[.,]/g, '') + '.' + t.slice(i + 1); const n = Number(t); return Number.isFinite(n) && n > 0 ? n : null; };

/** Plukker ut kjøp/salg, antall og kurs fra meldingsteksten (best effort – teksten vises alltid). */
export function parseInsider(body = '', title = '') {
  const first = body.replace(/\r/g, '').split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim()).find(p => p.length > 40) || '';
  const t = (title + ' ' + first).toLowerCase();
  const k = /\b(sold|sale of|disposed|solgt|selger|salg av)\b/.test(t) ? 'S' : /\b(bought|purchased|acquired|buys|buy|subscribed|kjøpt|kjøper|kjøp av|tegnet)\b/.test(t) ? 'K' : /\b(allocated|granted|tildelt|awarded|exercised|innløst)\b/.test(t) ? 'T' : 'U';
  const ant = int(first.match(/([\d][\d\s.,]*)\s+(?:shares|aksjer|ordinary shares)/i)?.[1]);
  const kurs = dec(first.match(/(?:NOK|kr\.?)\s*([\d][\d\s.,]*)\s*(?:per|pr\.?)\s*(?:share|aksje)/i)?.[1] || first.match(/(?:price|kurs)\s+(?:of\s+)?(?:NOK|kr\.?)\s*([\d][\d\s.,]*)/i)?.[1]);
  return { k, ant: ant && ant < 1e10 ? ant : null, kurs: kurs && kurs < 1e6 ? kurs : null, tekst: first.slice(0, 450) };
}

export async function fetchInsider(days = 60, maxNew = 400) {
  const cacheFile = path.join(config.dataDir, 'insider-cache.json');
  let cache = {}; try { cache = JSON.parse(await fs.readFile(cacheFile, 'utf8')); } catch { }
  const to = new Date(), from = new Date(Date.now() - days * 864e5), d = x => x.toISOString().slice(0, 10);
  const list = await getJson(`${API}/list?category=1102&fromDate=${d(from)}&toDate=${d(to)}`, { method: 'POST' });
  const msgs = list?.data?.messages || [];
  if (!msgs.length) throw new Error('fant ingen meldinger');
  let fetched = 0;
  for (const m of msgs) {
    if (cache[m.messageId] || fetched >= maxNew) continue;
    const r = await getJson(`${API}/message?messageId=${encodeURIComponent(m.messageId)}`).catch(() => null);
    const body = r?.data?.message?.body; if (body == null) continue;
    cache[m.messageId] = parseInsider(body, m.title); fetched++;
    await sleep(250);
  }
  const keep = new Set(msgs.map(m => String(m.messageId)));
  for (const k of Object.keys(cache)) if (!keep.has(k)) delete cache[k];
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify(cache));
  return msgs.filter(m => cache[m.messageId] && !m.correctedByMessageId).map(m => {
    const p = cache[m.messageId];
    return { id: m.messageId, d: m.publishedTime.slice(0, 10), sel: m.issuerName, tick: m.issuerSign, tittel: m.title, ...p,
      ver: p.ant && p.kurs ? Math.round(p.ant * p.kurs) : null, u: `https://newsweb.oslobors.no/message/${m.messageId}` };
  });
}

/** Markerer meldinger som nevner en politiker ved fullt navn. */
export function tagPoliticians(items, people) {
  const idx = people.filter(p => p.navn && p.navn.split(' ').length >= 2).map(p => ({ ...p, re: new RegExp(`\\b${p.navn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}\\b`, 'i') }));
  return items.map(i => { const pol = idx.filter(p => p.re.test(i.tekst + ' ' + i.tittel)).map(({ re, ...p }) => p); return pol.length ? { ...i, pol } : i; });
}
