// Meldepliktig handel for primærinnsidere på Oslo Børs (MAR art. 19): styremedlemmer, toppledere og deres nærstående
// i alle børsnoterte selskaper. Kilde: Oslo Børs NewsWeb, kategori 1102. Oppdateres hver gang bygget kjører.
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { getJson, allowHosts } from './http.js';

const API = config.osloBorsApi;
allowHosts([API]);
const PARSER_V = 2;
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Antall aksjer: alle skilletegn er tusenskille. Kurs: siste skilletegn er desimaltegn.
const int = s => { if (!s) return null; const n = Number(String(s).replace(/[\s.,]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
const dec = s => { if (!s) return null; let t = String(s).replace(/\s/g, '').replace(/[.,]$/, ''); const i = Math.max(t.lastIndexOf('.'), t.lastIndexOf(',')); if (i >= 0) t = t.slice(0, i).replace(/[.,]/g, '') + '.' + t.slice(i + 1); const n = Number(t); return Number.isFinite(n) && n > 0 ? n : null; };

// Hvem handlet, og hvilken rolle har de? (best effort fra fritekst på norsk og engelsk)
const NAME = "[A-ZÆØÅÉ][\\p{L}'\\-]+\\.?(?:\\s+[A-ZÆØÅÉ][\\p{L}'\\-]*\\.?){1,3}";
const ROLE = "(?:(?:Deputy|Vice|Executive|Chief|Group|Senior|Acting|Interim)\\s+)*(?:Chair(?:man|person|woman)?(?: of the [Bb]oard)?|CEO|CFO|COO|CTO|CCO|CIO|EVP|SVP|President|Managing Director|Director|[Bb]oard [Mm]ember|member of the [Bb]oard(?: of [Dd]irectors)?|[A-Z][\\w ]{0,25}Officer(?: \\(\\w+\\))?|employee representative[\\w ]{0,20}|[Ss]tyreleder|[Ss]tyremedlem|[Nn]estleder|[Kk]onsernsjef|[Dd]aglig leder|[Ff]inansdirektør|[Aa]dministrerende direktør|[Aa]nsatterepresentant)";
const WHO1 = new RegExp(`(${NAME}),\\s+(?:a |an |the )?(${ROLE})`, 'u');
const WHO2 = new RegExp(`(${ROLE})[,]?\\s+(${NAME})\\s+(?:in|of|i|has|have|bought|sold|har|kjøpte|solgte)\\b`, 'u');
// Titler og etiketter som ikke er en del av navnet («Primary Insider Vegard Wollan», «Mr. Artem Volynets»)
export const cleanName = n => String(n || '').replace(/^(?:(?:Mr|Mrs|Ms|Miss|Dr|Sir|Herr|Fru)\.?\s+|(?:Primary\s+)?Insider\s+|PDMR\s+|Primærinnsider\s+)+/i, '').trim();
export function who(t = '') {
  let m = t.match(WHO1); if (m) return { navn: cleanName(m[1]), rolle: m[2].trim() };
  m = t.match(WHO2); if (m) return { navn: cleanName(m[2]), rolle: m[1].trim() };
  return null;
}

/** Plukker ut kjøp/salg, antall og kurs fra meldingsteksten (best effort – teksten vises alltid). */
export function parseInsider(body = '', title = '') {
  const first = body.replace(/\r/g, '').split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim()).find(p => p.length > 40) || '';
  const t = (title + ' ' + first).toLowerCase();
  const k = /\b(sold|sale of|disposed|solgt|selger|salg av)\b/.test(t) ? 'S' : /\b(bought|purchased|acquired|buys|buy|subscribed|kjøpt|kjøper|kjøp av|tegnet)\b/.test(t) ? 'K' : /\b(allocated|granted|tildelt|awarded|exercised|innløst)\b/.test(t) ? 'T' : 'U';
  const ant = int(first.match(/([\d][\d\s.,]*)\s+(?:shares|aksjer|ordinary shares)/i)?.[1]);
  const kurs = dec(first.match(/(?:NOK|kr\.?)\s*([\d][\d\s.,]*)\s*(?:per|pr\.?)\s*(?:share|aksje)/i)?.[1] || first.match(/(?:price|kurs)\s+(?:of\s+)?(?:NOK|kr\.?)\s*([\d][\d\s.,]*)/i)?.[1]);
  const w = who(first);
  return { k, ant: ant && ant < 1e10 ? ant : null, kurs: kurs && kurs < 1e6 ? kurs : null, tekst: first.slice(0, 450), ...(w ? { navn: w.navn, rolle: w.rolle } : {}) };
}

export async function fetchInsider(days = 60, maxNew = 400) { return fetchCategory(1102, 'insider-cache.json', parseInsider, days, maxNew); }
export async function fetchFlagging(days = 90, maxNew = 400) { return fetchCategory(1006, 'flagging-cache.json', parseFlagging, days, maxNew); }

/** Flaggemeldinger: hvem passerte en eierandelsgrense (5, 10, 15, 20, 25, 1/3, 50, 2/3, 90 %), og i hvilken retning. */
export function parseFlagging(body = '', title = '', issuer = '') {
  const first = body.replace(/\r/g, '').split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim()).filter(p => p.length > 30).slice(0, 2).join(' ').slice(0, 600);
  const t = first.toLowerCase();
  const retning = /\b(upward|above|exceed\w*|increase\w*|acquired|bought|purchased|kjøpte|over\s+\d)/.test(t) ? 'opp' : /\b(downward|below|fallen|decrease\w*|reduc\w*|sold|disposed|solgte|under\s+\d)/.test(t) ? 'ned' : '';
  const pcts = [...first.matchAll(/(\d{1,2}(?:[.,]\d{1,4})?)\s?(?:%|per\s?cent|prosent)/gi)].map(m => Number(m[1].replace(',', '.'))).filter(n => n > 0 && n <= 100);
  const norm = x => x.toLowerCase().replace(/[^\p{L}\d]/gu, '');
  const cands = [...first.matchAll(/((?:[A-ZÆØÅ][\p{L}&.'\-]*\s){1,5}(?:AS|ASA|AB|ApS|A\/S|Ltd|Limited|LLC|LP|Inc|plc|PLC|GmbH|SE|AG|N\.V\.|S\.A\.))(?=[\s,.)"'(]|$)/gu)].map(m => m[1].trim())
    .filter(c => !issuer || norm(c) !== norm(issuer));
  const holder = cands[0];
  return { retning, pst: pcts.length ? pcts[pcts.length - 1] : null, eier: holder || null, tekst: first.slice(0, 450) };
}

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
    return { id: m.messageId, d: m.publishedTime.slice(0, 10), sel: m.issuerName, tick: m.issuerSign, tittel: m.title, ...p,
      ver: p.ant && p.kurs ? Math.round(p.ant * p.kurs) : undefined, u: `https://newsweb.oslobors.no/message/${m.messageId}` };
  });
}

/** Markerer meldinger som nevner en politiker ved fullt navn. */
export function tagPoliticians(items, people) {
  const idx = people.filter(p => p.navn && p.navn.split(' ').length >= 2).map(p => ({ ...p, re: new RegExp(`\\b${p.navn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}\\b`, 'i') }));
  return items.map(i => { const pol = idx.filter(p => p.re.test(i.tekst + ' ' + i.tittel)).map(({ re, ...p }) => p); return pol.length ? { ...i, pol } : i; });
}
