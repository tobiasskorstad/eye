// Automatisk oppdatering av det som før var håndskrevet: målinger, partiledere, «akkurat nå» og siste nytt om løftene.
import { getText, getJson, allowHosts } from './http.js';

const POLL_URL = 'https://www.pollofpolls.no/?cmd=Stortinget';
const WIKIDATA = 'https://query.wikidata.org/sparql';
allowHosts([POLL_URL, WIKIDATA]);

const POLL_CODE = { Ap: 'A', H: 'H', Frp: 'FrP', SV: 'SV', Sp: 'Sp', KrF: 'KrF', V: 'V', MDG: 'MDG', R: 'R' };
const num = s => Number(String(s).replace(',', '.').replace(/[^\d.]/g, ''));

/** Poll of polls: månedlige snitt av nasjonale målinger. Gir siste måned + utvikling. */
export function parsePolls(html) {
  const t = html.slice(html.indexOf('<table'), html.indexOf('</table>'));
  const head = [...t.matchAll(/parti=(\w+)"/g)].map(m => m[1]);
  const rows = [...t.matchAll(/do=snitt&amp;yw=(\d{6})">([^<]+)<\/a><\/th>([\s\S]*?)<\/tr>/g)].map(([, yw, label, cells]) => {
    const v = [...cells.matchAll(/<td>([^<]*)<\/td>/g)].map(m => num(m[1].split('(')[0]));
    const snitt = {};
    head.forEach((h, i) => { if (POLL_CODE[h] && Number.isFinite(v[i])) snitt[POLL_CODE[h]] = v[i]; });
    return { mnd: `${yw.slice(0, 4)}-${yw.slice(4)}`, label: label.trim(), snitt };
  });
  if (!rows.length || Object.keys(rows[0].snitt).length < 9) return null;
  const sum = Object.values(rows[0].snitt).reduce((a, b) => a + b, 0);
  if (sum < 80 || sum > 101) return null; // ser ikke ut som prosenter – ikke bruk
  return { kilde: `Poll of polls, snitt av nasjonale målinger ${rows[0].label.replace("'", '20')}`, url: POLL_URL, snitt: rows[0].snitt, utvikling: rows.slice(0, 12).reverse() };
}
export async function fetchPolls() { return parsePolls(await getText(POLL_URL)); }

/** Partiledere fra Wikidata (gjeldende «styreleder», uten sluttdato). */
const QID = { A: 'Q190219', FrP: 'Q485665', H: 'Q586364', SV: 'Q488418', Sp: 'Q493685', R: 'Q1512994', MDG: 'Q1518568', KrF: 'Q1166025', V: 'Q500190' };
export async function fetchLeaders() {
  const q = `SELECT ?p ?leaderLabel WHERE { VALUES ?p { ${Object.values(QID).map(x => 'wd:' + x).join(' ')} }
    ?p p:P488 ?st. ?st ps:P488 ?leader. FILTER NOT EXISTS { ?st pq:P582 ?e }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "nb,nn,en". } }`;
  const d = await getJson(`${WIKIDATA}?format=json&query=${encodeURIComponent(q)}`, { accept: 'application/sparql-results+json' });
  const byQ = {};
  for (const b of d?.results?.bindings || []) (byQ[b.p.value.split('/').pop()] ||= new Set()).add(b.leaderLabel.value);
  const out = {};
  for (const [k, q] of Object.entries(QID)) if (byQ[q]?.size === 1) out[k] = [...byQ[q]][0]; // bare entydige svar
  return out;
}
/** Beholder redaksjonell tilleggsinfo («(sykmeldt)») når navnet fortsatt stemmer, ellers byttes lederen ut. */
export function mergeLeaders(partier, leaders, warnings = []) {
  for (const [p, name] of Object.entries(leaders)) {
    const x = partier[p]; if (!x) continue;
    if (!x.leder?.includes(name)) { warnings.push(`Ny leder i ${p} ifølge Wikidata: ${name} (var ${x.leder})`); x.leder = name; }
  }
  return partier;
}

/** «Akkurat nå»: ferskeste politiske overskrifter (flest partier nevnt først) og siste vedtak i Stortinget. */
export function buildNow(auto, stemmer, days = 3, now = Date.now()) {
  const m = new Map();
  for (const [p, list] of Object.entries(auto || {})) for (const n of list) {
    const x = m.get(n.url) || { ...n, ps: [] }; x.ps.push(p); m.set(n.url, x);
  }
  const fresh = [...m.values()].filter(n => now - Date.parse(n.dato) < days * 864e5);
  const nyheter = fresh.sort((a, b) => b.ps.length - a.ps.length || b.dato.localeCompare(a.dato)).slice(0, 6);
  const seen = new Set(), vedtak = [];
  for (const v of stemmer?.voteringer || []) {
    if (seen.has(v.sak) || !v.vedtatt) continue; seen.add(v.sak);
    vedtak.push({ d: v.d, sak: v.sak, tittel: v.tittel }); if (vedtak.length === 5) break;
  }
  return { oppdatert: new Date(now).toISOString().slice(0, 10), nyheter, vedtak };
}

/** Siste nytt og siste voteringer som handler om hvert løfte (søkeord i lofter.json). */
export function attachPromiseNews(lofter, auto, stemmer) {
  const all = [...new Map(Object.values(auto || {}).flat().map(n => [n.url, n])).values()];
  for (const x of lofter?.regjering?.lofter || []) {
    if (!x.sok) continue;
    const re = new RegExp(x.sok, 'i');
    x.siste = all.filter(n => re.test(n.tittel)).sort((a, b) => b.dato.localeCompare(a.dato)).slice(0, 4);
    x.voteringer = (stemmer?.voteringer || []).filter(v => re.test(v.tittel + ' ' + v.tema)).slice(0, 4).map(v => ({ d: v.d, sak: v.sak, tittel: v.tittel, tema: v.tema, vedtatt: v.vedtatt, for: v.for, mot: v.mot }));
  }
  return lofter;
}
