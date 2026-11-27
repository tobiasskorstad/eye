// Meldepliktig handel for primærinnsidere på Oslo Børs (MAR art. 19): styremedlemmer, toppledere og deres nærstående
// i alle børsnoterte selskaper. Kilde: Oslo Børs NewsWeb, kategori 1102. Oppdateres hver gang bygget kjører.
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { getJson, allowHosts } from './http.js';

const API = config.osloBorsApi;
allowHosts([API]);
const PARSER_V = 3; // 3: ny tolker (insider-parse.js) med flere navnemønstre, valuta, flaggeeier fra tittel og selskapsbeskrivelse
const sleep = ms => new Promise(r => setTimeout(r, ms));
export { who, cleanName, parseInsider, parseFlagging, about } from './insider-parse.js';
import { cleanName, parseInsider, parseFlagging } from './insider-parse.js';

export async function fetchInsider(days = 60, maxNew = 400) { return fetchCategory(1102, 'insider-cache.json', parseInsider, days, maxNew); }
export async function fetchFlagging(days = 90, maxNew = 400) { return fetchCategory(1006, 'flagging-cache.json', parseFlagging, days, maxNew); }

async function fetchCategory(cat, cacheName, parser, days, maxNew) {
  const cacheFile = path.join(config.dataDir, cacheName);
  let cache = {}; try { cache = JSON.parse(await fs.readFile(cacheFile, 'utf8')); } catch { }
  const to = new Date(), from = new Date(Date.now() - days * 864e5), d = x => x.toISOString().slice(0, 10);
  const list = await getJson(`${API}/list?category=${cat}&fromDate=${d(from)}&toDate=${d(to)}`, { method: 'POST' });
  const msgs = list?.data?.messages || [];
  if (!msgs.length) throw new Error('fant ingen meldinger');
  let fetched = 0;
  for (const m of msgs) {
    if (cache[m.messageId]?.v === PARSER_V || fetched >= maxNew) continue; // ny tolker → les meldingen på nytt
    const r = await getJson(`${API}/message?messageId=${encodeURIComponent(m.messageId)}`).catch(() => null);
    const body = r?.data?.message?.body; if (body == null) continue;
    cache[m.messageId] = { ...parser(body, m.title, m.issuerName), v: PARSER_V }; fetched++;
    await sleep(250);
  }
  const keep = new Set(msgs.map(m => String(m.messageId)));
  for (const k of Object.keys(cache)) if (!keep.has(k)) delete cache[k];
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify(cache));
  return msgs.filter(m => cache[m.messageId] && !m.correctedByMessageId).map(m => {
    const { v, ...p } = cache[m.messageId];
    if (p.navn) p.navn = cleanName(p.navn); // også for meldinger tolket før navnevasken
    const bel = p.ant && p.kurs ? Math.round(p.ant * p.kurs) : undefined, nok = !p.cur || p.cur === 'NOK';
    // ver er alltid i kroner (brukes til sortering); handler i annen valuta får bel + cur i stedet
    return { id: m.messageId, d: m.publishedTime.slice(0, 10), sel: m.issuerName, tick: m.issuerSign, tittel: m.title, ...p,
      ver: nok ? bel : undefined, ...(nok || !bel ? {} : { bel }), u: `https://newsweb.oslobors.no/message/${m.messageId}` };
  });
}

/** Markerer meldinger som nevner en politiker ved fullt navn. */
export function tagPoliticians(items, people) {
  const idx = people.filter(p => p.navn && p.navn.split(' ').length >= 2).map(p => ({ ...p, re: new RegExp(`\\b${p.navn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}\\b`, 'i') }));
  return items.map(i => { const pol = idx.filter(p => p.re.test(i.tekst + ' ' + i.tittel)).map(({ re, ...p }) => p); return pol.length ? { ...i, pol } : i; });
}
