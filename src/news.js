// Automatiske nyhetsoverskrifter fra RSS. Bare tittel, kilde, dato og lenke lagres.
import { config } from './config.js';
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

const decode = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/<[^>]+>/g, '').trim();

export function parseRss(xml, source) {
  const out = [];
  const channel = decode((xml.match(/<channel>[\s\S]*?<title>([\s\S]*?)<\/title>/) || [])[1] || source);
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/g)) {
    const it = m[0];
    const tag = t => decode((it.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1] || '');
    const link = tag('link') || (it.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '';
    const date = new Date(tag('pubDate') || tag('published') || tag('updated') || tag('dc:date'));
    const title = tag('title');
    if (title && /^https?:\/\//.test(link)) out.push({ tittel: title, sammendrag: tag('description').slice(0, 400), url: link, dato: isNaN(date) ? '' : date.toISOString().slice(0, 10), kilde: channel });
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
  for (const f of feeds()) {
    try { const xml = await getText(f); if (xml) all.push(...parseRss(xml, new URL(f).hostname)); } catch { /* én feed kan feile uten å stoppe resten */ }
  }
  const cutoff = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const uniq = [...new Map(all.filter(i => !i.dato || i.dato >= cutoff).map(i => [i.url, i])).values()]
    .sort((a, b) => b.dato.localeCompare(a.dato));
  const byParty = matchParties(uniq, leaders);
  return Object.fromEntries(Object.entries(byParty).map(([p, list]) => [p, list.slice(0, perParty).map(({ sammendrag, ...i }) => i)]));
}

/** Faktasjekker fra Faktisk.no (har ikke RSS – leser listesiden). Best effort. */
export async function fetchFactchecks() {
  const html = await getText(config.faktiskUrl).catch(() => null);
  if (!html) return [];
  const out = new Map();
  for (const m of html.matchAll(/<a[^>]+href="((?:https:\/\/www\.faktisk\.no)?\/faktasjekk\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const u = m[1].startsWith('http') ? m[1] : 'https://www.faktisk.no' + m[1];
    const t = decode(m[2]).replace(/^Faktasjekk\s*/, '').replace(/\s+/g, ' ').trim();
    if (t.length > 15 && !out.has(u)) out.set(u, { t, u, d: '' });
  }
  const near = [...html.matchAll(/\/faktasjekk\/[^"]+\/(\d+)"[\s\S]{0,800}?datetime="([^"]+)"/g)];
  for (const [, id, dt] of near) for (const v of out.values()) if (v.u.endsWith('/' + id) && !v.d) v.d = dt.slice(0, 10);
  return [...out.values()];
}

export function tagParties(items, leaders = {}, field = 't') {
  return items.map(i => ({ ...i, p: Object.keys(matchParties([{ tittel: i[field], sammendrag: '' }], leaders)).filter(p => matchParties([{ tittel: i[field], sammendrag: '' }], leaders)[p].length) }));
}
