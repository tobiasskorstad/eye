// Politisk eksponerte personer (PEP) utover Stortinget, der det finnes offentlige opplysninger om aksjer:
// - regjeringsmedlemmer: Stortingets register (egen del) + Stortingets API for tittel/departement
// - statssekretærer og politiske rådgivere: regjeringens eget register (PDF fra DSS)
// Kilde for hvem som er PEP: forskrift om stillinger og funksjoner som medfører status som PEP (1.10.2026).
import { config } from './config.js';
import { getJson, getText, getBuffer, allowHosts } from './http.js';
import { pdfToText, norm, publicEntry, parseTrades } from './register.js';

const REGJ_PAGE = 'https://www.regjeringen.no/no/om-regjeringa/verv-og-okonomiske-interesser/id3025637/';
allowHosts([REGJ_PAGE]);

export async function fetchGovernment() {
  const d = await getJson(`${config.stortingetApi}/regjering?format=json`);
  return (d?.regjeringsmedlemmer_liste || []).map(x => ({
    id: x.id, navn: `${x.fornavn} ${x.etternavn}`.trim(), fornavn: x.fornavn, etternavn: x.etternavn,
    tittel: x.tittel || x.verv || 'Statsråd', dep: x.departement || '', parti: x.parti?.id || '',
  }));
}

/** Kobler regjeringsmedlemmene til registerets regjeringsdel (navn). */
export function governmentEntries(gov, entries) {
  const pool = entries.filter(e => e.seksjon === 'regjering');
  return gov.map(g => {
    const e = pool.find(p => norm(p.etternavn) === norm(g.etternavn) && norm(p.fornavn).split(' ')[0] === norm(g.fornavn).split(' ')[0])
      || pool.find(p => norm(p.etternavn) === norm(g.etternavn));
    return { g, e };
  });
}

const LABELS = [
  ['verv', 'Verv'], ['naering', 'Selvstendig inntektsbringende virksomhet'], ['stilling', 'Lønnet stilling eller engasjement'],
  ['tidl', 'Avtaler om permisjon eller av økonomisk karakter med tidligere arbeidsgiver'], ['fremtid', 'Avtaler med fremtidig arbeids- eller oppdragsgiver'],
  ['stotte', 'Økonomisk støtte eller vederlag'], ['eiendom', 'Fast eiendom som benyttes i næringsvirksomhet'],
  ['aksjer', 'Selskapsinteresser (aksjer, andeler m.m.)'], ['gjeld', 'Gjeld i næringsvirksomhet'], ['reiser', 'Utenlandsreiser'],
  ['gaver', 'Gaver eller annen økonomisk fordel'], ['annet', 'Interesser av særlig personlig eller økonomisk art'],
];
const lre = l => new RegExp(l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/-/g, '\\s*-\\s*').replace(/\s+/g, '\\s*'));
const tidy = s => s.replace(/\s+/g, ' ').replace(/\s+([,.)])/g, '$1').replace(/\(\s+/g, '(').trim();

/** Tolker regjeringens register for statssekretærer og politiske rådgivere. */
export function parseStatssekRegister(text) {
  const t = text.replace(/\u00ad/g, '');
  const HEADS = /(^|\n)\s*([A-ZÆØÅ][^,\n()]{1,50}?)\s*,\s*([^\n()]{1,60}?)\s*\n?\s*\(\s*([^,()\n]{1,20}?)\s*,\s*([^()\n]{1,40}?)\s*\)/g;
  const heads = [...t.matchAll(HEADS)].filter(m => !/Dokument|Register/.test(m[2]));
  return heads.map((m, i) => {
    let body = tidy(t.slice(m.index + m[0].length, i + 1 < heads.length ? heads[i + 1].index : t.length));
    const har = body.match(/Har registreringspliktige\s*interesser\?\s*(Ja|Nei)\b/i);
    if (har) body = body.slice(har.index + har[0].length);
    // Feltene kommer alltid i samme rekkefølge: let etter hver etikett fra der forrige sluttet.
    const pos = []; let from = 0;
    for (const [k, l] of LABELS) {
      const mm = body.slice(from).match(lre(l)); if (!mm) continue;
      pos.push({ k, start: from + mm.index, end: from + mm.index + mm[0].length }); from = from + mm.index + mm[0].length;
    }
    const felt = {};
    pos.forEach((p, j) => { const v = body.slice(p.end, j + 1 < pos.length ? pos[j + 1].start : body.length).trim(); if (v) felt[p.k] = v; });
    return { navn: tidy(`${m[3]} ${m[2]}`), etternavn: tidy(m[2]), parti: tidy(m[4]), fylke: tidy(m[5]), har: har ? /ja/i.test(har[1]) : null, felt };
  });
}

export async function fetchStatssekRegister() {
  const html = await getText(REGJ_PAGE);
  const href = html.match(/href="([^"]*register-for-verv-og-okonomiske-interesser[^"]*\.pdf)"/i)?.[1];
  if (!href) throw new Error('fant ikke regjeringens register-PDF');
  const url = new URL(href.replace(/&amp;/g, '&'), REGJ_PAGE).href;
  const bytes = await getBuffer(url); if (!bytes) throw new Error('kunne ikke laste ned regjeringens register');
  const list = parseStatssekRegister(await pdfToText(bytes));
  if (list.length < 20) throw new Error(`regjeringens register ga bare ${list.length} personer`);
  return { url, list };
}

/** Bygger PEP-delen av de offentlige dataene. */
export function buildPep(gov, entries, statssek, kilder) {
  const trades = [], regjering = [];
  for (const { g, e } of governmentEntries(gov, entries)) {
    regjering.push({ id: g.id, navn: g.navn, tittel: g.tittel, dep: g.dep, parti: g.parti, reg: e ? publicEntry(e) : null });
    if (e) for (const t of parseTrades(e)) trades.push({ pep: g.id, ...t });
  }
  return { regjering, statssek: statssek || [], trades, kilder, forskrift: 'https://www.regjeringen.no/no/dokumenter/forskrift-om-stillinger-og-funksjoner-som-medforer-status-som-politisk-eksponert-person/id3173733/' };
}
