// Oljefondet (Statens pensjonsfond utland), fra Norges Bank Investment Management (nbim.no):
// - alle investeringer ved siste rapportering (aksjer, obligasjoner, eiendom, infrastruktur), samme data som NBIMs
//   investeringsoversikt bruker
// - markedsverdi, tilførsel og avkastning over tid (diagramdata på nbim.no)
// - selskaper som er utelukket eller satt til observasjon
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { getJson, getText, allowHosts } from './http.js';

const NB = config.nbimUrl;
allowHosts([NB]);
const DAY = 864e5;
const ASSET = { 0: 'aksjer', 1: 'obligasjoner', 2: 'eiendom', 3: 'infrastruktur' };
const yr = ms => new Date(ms).getUTCFullYear();
const dec = s => String(s || '').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Diagramdata som ligger som JSON i <script>-blokker på nbim.no. Returnerer { serienavn: [[år, verdi], …] }. */
export function chartSeries(html) {
  const out = {};
  for (const m of String(html).matchAll(/<script[^>]*>\s*(\{[\s\S]*?\})\s*<\/script>/g)) {
    let j; try { j = JSON.parse(m[1]); } catch { continue; }
    for (const s of j?.nok?.series || []) if (s?.name && Array.isArray(s.data)) out[`${j.nok.id}|${s.name}`] = s.data.map(([t, v]) => [yr(t), v]);
  }
  return out;
}
/** Finn en serie på navn (id-en på diagrammet endrer seg, navnet gjør det ikke). */
export const pick = (series, name, nth = 0) => Object.entries(series).filter(([k]) => k.split('|')[1] === name)[nth]?.[1] || [];

/** Tabellen over utelukkede selskaper og selskaper til observasjon. */
export function parseExclusions(html) {
  const t = String(html).match(/<table[\s\S]*?<\/table>/)?.[0] || '';
  const rows = [...t.matchAll(/<tr[\s\S]*?<\/tr>/g)].map(r => [...r[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(c => dec(c[1])));
  const hi = rows.findIndex(r => r.some(c => /^selskapsnavn$/i.test(c))); if (hi < 0) return [];
  const H = rows[hi].map(c => c.toLowerCase()), col = re => H.findIndex(c => re.test(c));
  const ix = { navn: col(/^selskapsnavn/), kategori: col(/^kategori/), kriterium: col(/^kriteri/), beslutning: col(/^beslutning/), dato: col(/dato/) };
  return rows.slice(hi + 1).filter(r => r[ix.navn]).map(r => ({ navn: r[ix.navn], kategori: r[ix.kategori] || '', kriterium: r[ix.kriterium] || '', beslutning: r[ix.beslutning] || '',
    dato: ((r[ix.dato] || '').match(/(\d{2})\.(\d{2})\.(\d{4})/) || []).slice(1).reverse().join('-') || null }));
}

/** Oppsummerer alle investeringene. Full aksjeliste beholdes (til søk), resten kortes ned. */
export function summarizeHoldings(list) {
  const by = { aksjer: [], obligasjoner: [], eiendom: [], infrastruktur: [] };
  for (const x of list || []) { const k = ASSET[x.at]; if (k) by[k].push(x); }
  const sum = l => l.reduce((a, x) => a + (x.a?.n || 0), 0);
  const land = {}, sektor = {};
  for (const x of list || []) land[x.cc] = (land[x.cc] || 0) + (x.a?.n || 0);
  for (const x of by.aksjer) { const s = x.eq?.s || 'Annet'; sektor[s] = (sektor[s] || 0) + (x.a?.n || 0); }
  const sorted = l => [...l].sort((a, b) => (b.a?.n || 0) - (a.a?.n || 0));
  return {
    antall: Object.fromEntries(Object.entries(by).map(([k, l]) => [k, l.length])),
    verdi: Object.fromEntries(Object.entries(by).map(([k, l]) => [k, Math.round(sum(l))])),
    land: Object.entries(land).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v)]),
    sektor: Object.entries(sektor).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v)]),
    aksjer: sorted(by.aksjer).map(x => [x.n, x.cc, Math.round(x.a?.n || 0), x.o ?? x.eq?.v ?? null, x.eq?.s || '']),
    obligasjoner: sorted(by.obligasjoner).slice(0, 60).map(x => [x.n, x.cc, Math.round(x.a?.n || 0), x.fi?.s || '']),
    // For eiendom og infrastruktur oppgir NBIM verdien per land, ikke per partner. Vi tar derfor bare med antall og type.
    eiendom: [...by.eiendom].sort((a, b) => (b.re || []).length - (a.re || []).length).map(x => [x.n, x.cc, (x.re || []).length, [...new Set((x.re || []).map(r => r.s))].join(', ')]),
    infrastruktur: by.infrastruktur.map(x => [x.n, x.cc, (x.ri || []).map(r => `${r.n} (${r.s}, ${r.o} %)`).join('; ')]),
  };
}

export async function fetchFund({ warnings = [] } = {}) {
  const file = path.join(config.dataDir, 'oljefondet-cache.json');
  let cache = {}; try { cache = JSON.parse(await fs.readFile(file, 'utf8')); } catch { }
  const now = Date.now(), out = { ...(cache.d || {}) };
  if (!cache.t || now - cache.t > DAY) {
    try {
      const init = await getJson(`${NB}/api/investments/v2/init.json`);
      const latest = [...(init?.data?.details || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
      if (latest && latest.fileName !== cache.fil) {
        const h = await getJson(`${NB}/api/investments/v2/${latest.fileName}`);
        out.beholdning = { dato: String(latest.date).slice(0, 10), ...summarizeHoldings(h?.data) };
        cache.fil = latest.fileName;
      }
    } catch (e) { warnings.push('Oljefondet (investeringer) feilet: ' + e.message); }
    try {
      const v = chartSeries(await getText(`${NB}/no/investeringene/fondets-verdi/`, { accept: 'text/html' }));
      const a = chartSeries(await getText(`${NB}/no/investeringene/avkastning/`, { accept: 'text/html' }));
      out.historikk = {
        verdi: pick(v, 'Total markedsverdi'), totalt: pick(v, 'Totalt'),
        tilforsel: pick(v, 'Tilførsel (etter forvaltningsgodtgjøring)'), avkastning: pick(v, 'Avkastning'), krone: pick(v, 'Kronekurs'),
        aksjer: pick(v, 'Aksjer'), renter: pick(v, 'Rentepapirer'), eiendom: pick(v, 'Eiendom'), infra: pick(v, 'Infrastruktur for fornybar energi'),
        aarlig: pick(a, 'Årlig avkastning'), snitt: pick(a, 'Akkumulert annualisert avkastning'),
        relativ: pick(a, 'Årlig relativ avkastning'), relSnitt: pick(a, 'Akkumulert annualisert relativ avkastning'),
        kAksjer: pick(a, 'Aksjer'), kRenter: pick(a, 'Rentepapirer'), kEiendom: pick(a, 'Unotert eiendom'), kInfra: pick(a, 'Unotert infrastruktur for fornybar energi'),
      };
      if (!out.historikk.verdi.length) warnings.push('Oljefondet: fant ikke verdidiagrammet på nbim.no');
    } catch (e) { warnings.push('Oljefondet (verdi og avkastning) feilet: ' + e.message); }
    try { const ex = parseExclusions(await getText(`${NB}/no/ansvarlig-forvaltning/utelukkelse-av-selskaper/`, { accept: 'text/html' })); if (ex.length) out.utelukket = ex; }
    catch (e) { warnings.push('Oljefondet (utelukkelser) feilet: ' + e.message); }
    out.hentet = new Date().toISOString(); out.url = `${NB}/no/`;
    Object.assign(cache, { t: now, d: out });
    await fs.mkdir(config.dataDir, { recursive: true });
    await fs.writeFile(file, JSON.stringify(cache));
  }
  return out.beholdning || out.historikk ? out : null;
}
