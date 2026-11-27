// Automatiske nyhetsoverskrifter fra RSS. Bare tittel, kilde, dato og lenke lagres.
import { config } from './config.js';
import { allowHosts } from './http.js';
import { getText } from './http.js';

// Verifisert 24.11.2026. Bredt spekter: riksmedier, regionale og alternative medier fra både høyre og venstre.
const DEFAULT_FEEDS = [
  'https://www.nrk.no/toppsaker.rss',
  'https://www.nrk.no/norge/toppsaker.rss',
  'https://www.vg.no/rss/feed',
  'https://www.aftenposten.no/rss',
  'https://www.dagbladet.no/?lab_viewport=rss',
  'https://www.dagsavisen.no/rss',
  'https://www.tv2.no/rss/nyheter',
  'https://e24.no/rss2/',
  'https://www.document.no/feed/',
  'https://inyheter.no/feed/',
  'https://steigan.no/feed/',
];
export const feeds = () => (process.env.NEWS_FEEDS ? process.env.NEWS_FEEDS.split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_FEEDS);

// Søkeord per parti. Lederens navn legges til automatisk fra content/partier.json.
const PATTERNS = {
  A: ['Arbeiderpartiet', '\\bAp\\b', 'Ap-'], FrP: ['Frp', 'Fremskrittspartiet'], H: ['Høyre-', 'Høyres', '\\(H\\)', 'Høyre-leder'],
  SV: ['\\bSV\\b', 'Sosialistisk Venstreparti'], Sp: ['Senterpartiet', '\\bSp\\b'], R: ['\\bRødt\\b'],
  MDG: ['\\bMDG\\b', 'Miljøpartiet'], KrF: ['\\bKrF\\b', 'Kristelig Folkeparti'], V: ['\\bVenstre\\b(?!side)', 'Venstre-leder'],
};

// Fjern tagger først (gjentatt til ingenting er igjen), dekod så entiteter i én omgang – ingen dobbel dekoding.
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' };
const decode = s => {
  let t = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'), prev;
  do { prev = t; t = t.replace(/<[^<>]*>/g, ''); } while (t !== prev);
  return t.replace(/[<>]/g, '').replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(parseInt(e[1] === 'x' || e[1] === 'X' ? e.slice(2) : e.slice(1), e[1] === 'x' || e[1] === 'X' ? 16 : 10) || 32) : ENT[e.toLowerCase()] ?? m).trim();
};

const NAMES = { 'nrk.no': 'NRK', 'vg.no': 'VG', 'aftenposten.no': 'Aftenposten', 'dagbladet.no': 'Dagbladet', 'dagsavisen.no': 'Dagsavisen', 'tv2.no': 'TV 2',
  'e24.no': 'E24', 'document.no': 'Document', 'inyheter.no': 'iNyheter', 'steigan.no': 'Steigan', 'faktisk.no': 'Faktisk.no', 'example.no': 'Testnytt' };
export const sourceName = (link, fallback) => { try { const h = new URL(link).hostname.replace(/^www\./, ''); const k = Object.keys(NAMES).find(d => h === d || h.endsWith('.' + d)); return k ? NAMES[k] : fallback; } catch { return fallback; } };

export function parseRss(xml, source) {
  const out = [];
  const channel = decode((xml.match(/<channel>[\s\S]*?<title>([\s\S]*?)<\/title>/) || [])[1] || source);
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/g)) {
    const it = m[0];
    const tag = t => decode((it.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1] || '');
    const link = tag('link') || (it.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '';
    const date = new Date(tag('pubDate') || tag('published') || tag('updated') || tag('dc:date'));
    const title = tag('title');
    if (title && /^https?:\/\//.test(link)) out.push({ tittel: title, sammendrag: tag('description').slice(0, 400), url: link, dato: isNaN(date) ? '' : date.toISOString().slice(0, 10), kilde: sourceName(link, channel) });
  }
  return out;
}

export function matchParties(items, leaders = {}) {
  const res = {};
  for (const [p, pats] of Object.entries(PATTERNS)) {
    const extra = (leaders[p] || '').split(/[,(]/)[0].trim().split(' ').filter(w => w.length > 3).slice(-1); // etternavn
    const re = new RegExp([...pats, ...extra.map(w => `\\b${w}\\b`)].join('|'));
    res[p] = items.filter(i => re.test(i.tittel) || re.test(i.sammendrag));
  }
  return res;
}

export async function fetchNews(leaders, days = 30, perParty = 12) {
  const all = [];
  allowHosts(feeds());
  for (const f of feeds()) {
    try { const xml = await getText(f); if (xml) all.push(...parseRss(xml, new URL(f).hostname)); } catch { /* én feed kan feile uten å stoppe resten */ }
  }
  const cutoff = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const uniq = [...new Map(all.filter(i => !i.dato || i.dato >= cutoff).map(i => [i.url, i])).values()]
    .sort((a, b) => b.dato.localeCompare(a.dato));
  const byParty = matchParties(uniq, leaders);
  return Object.fromEntries(Object.entries(byParty).map(([p, list]) => [p, list.slice(0, perParty).map(({ sammendrag, ...i }) => i)]));
}

/**
 * Faktasjekker og verifiseringsartikler fra Faktisk.no (har ikke RSS – leser tag-siden og forsiden). Best effort.
 * Hver sak står i sin egen <article>-blokk med lenke, overskrift og <time datetime>. Faktisk.no publiserer i 2026
 * mest «artikkel» (avsløringer av desinformasjon) og sjelden «faktasjekk», så begge tas med og merkes med type.
 */
export function parseFaktisk(html = '') {
  const out = new Map();
  for (const seg of String(html).split(/<article\b/).slice(1)) {
    const m = seg.match(/href="((?:https:\/\/www\.faktisk\.no)?\/(faktasjekk|artikkel)\/[a-z0-9-]+\/\d+)"/);
    if (!m) continue;
    const u = m[1].startsWith('http') ? m[1] : 'https://www.faktisk.no' + m[1];
    const raw = (seg.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/) || seg.match(/<a[^>]+href="[^"]*\/\d+"[^>]*>([\s\S]*?)<\/a>/) || [])[1] || '';
    const t = decode(raw.replace(/<[^>]+>/g, ' ')).replace(/^\s*faktasjekk[:\s]*/i, '').replace(/\s+/g, ' ').trim();
    const d = (seg.match(/datetime="(\d{4}-\d{2}-\d{2})/) || [])[1] || '';
    if (t.length > 15 && !out.has(u)) out.set(u, { t, u, d, type: m[2] });
  }
  return [...out.values()];
}
export async function fetchFactchecks() {
  const pages = await Promise.all([config.faktiskUrl, config.faktiskFront].map(u => getText(u).catch(() => '')));
  const all = new Map();
  for (const x of pages.flatMap(parseFaktisk)) if (!all.has(x.u) || (!all.get(x.u).d && x.d)) all.set(x.u, x);
  return [...all.values()];
}

export function tagParties(items, leaders = {}, field = 't') {
  return items.map(i => ({ ...i, p: Object.keys(matchParties([{ tittel: i[field], sammendrag: '' }], leaders)).filter(p => matchParties([{ tittel: i[field], sammendrag: '' }], leaders)[p].length) }));
}
