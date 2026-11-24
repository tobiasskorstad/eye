// Stortingets register over representantenes verv og økonomiske interesser (kun publisert som PDF).
import { config } from './config.js';
import { getText, getBuffer } from './http.js';

const MONTHS = { januar: 1, februar: 2, mars: 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8, september: 9, oktober: 10, november: 11, desember: 12 };

/** Finner lenken til nyeste register-PDF på Stortingets side. */
export async function findLatestRegisterPdf() {
  const html = await getText(config.registerPage);
  if (!html) throw new Error('Fant ikke registersiden');
  const links = [...html.matchAll(/href="([^"]+\.pdf)"/gi)].map(m => m[1])
    .filter(h => /verv-og-okonomiske-interesser\/.*pr-\d+-[a-zæøå]+-\d{4}\.pdf$/i.test(h));
  if (!links.length) throw new Error('Fant ingen register-PDF på siden');
  const withDate = links.map(h => ({ url: new URL(h, config.registerPage).href, date: dateFromName(h) }))
    .sort((a, b) => b.date.localeCompare(a.date));
  return withDate[0];
}

export function dateFromName(h) {
  const m = h.match(/pr-(\d+)-([a-zæøå]+)-(\d{4})\.pdf$/i);
  if (!m || !MONTHS[m[2].toLowerCase()]) return '';
  return `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** Trekker ut tekst linje for linje fra PDF (samme metode som er testet mot registeret). */
export async function pdfToText(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    const lines = []; let line = '', lastY = null;
    for (const it of tc.items) {
      if (!('str' in it)) continue;
      const y = Math.round(it.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 2) { lines.push(line); line = ''; }
      line += it.str; lastY = y;
    }
    lines.push(line);
    pages.push(lines.join('\n'));
  }
  return pages.join('\n');
}

const HEAD = /^([^\n,§]{2,40}), ([^\n(§]{2,60}) \(([A-Za-zæøåÆØÅ]+), ([^)\n]+)\)\s*$/gm;
const LABEL = /^(Styreverv mv\.|Selvstendig næring|Lønnet stilling m\.?v\.|Tidligere arbeidsgiver|Framtidig arbeidsgiver|Fremtidig arbeidsgiver|Økonomisk støtte[^ ]*|Eiendom i næring|Selskapsinteresser|Gjeld[^ ]*|Utenlandsreiser|Gaver|Andre forhold)\s*/;

/** Deler registerteksten i personer med paragrafer. */
export function parseRegister(raw) {
  let R = raw
    .replace(/^\d+\s+Ajourført pr\.[^\n]*\n/gm, '')
    .replace(/^Ajourført pr\.[^\n]*\d+\s*\n/gm, '')
    .replace(/^(Representanter|Vararepresentanter|Regjeringsmedlemmer|Regjeringens medlemmer)\s*$/gm, '');
  const start = raw.indexOf('\nRepresentanter\n');
  if (start >= 0) {
    const firstHead = R.search(HEAD);
    if (firstHead > 0) R = R.slice(firstHead);
  }
  const heads = [...R.matchAll(HEAD)];
  return heads.map((m, i) => {
    const body = R.slice(m.index + m[0].length, i + 1 < heads.length ? heads[i + 1].index : R.length).trim();
    const secs = {};
    for (const part of body.split(/(?=^§\s?\d+\s?a?\s)/m)) {
      const mm = part.match(/^§\s?(\d+\s?a?)\s/);
      const text = part.replace(/^§\s?\d+\s?a?\s+/, '').replace(/\s*\n\s*/g, ' ').trim();
      if (!mm) { if (text) secs.x = (secs.x ? secs.x + ' ' : '') + text; continue; }
      const k = mm[1].replace(/\s/g, '');
      secs[k] = (secs[k] ? secs[k] + ' ' : '') + text.replace(LABEL, '').trim();
    }
    return { etternavn: m[1].trim(), fornavn: m[2].trim(), parti: m[3], fylke: m[4].trim(), secs };
  });
}

export const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-zæøå ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Finner registeroppføringen til en representant (fullt navn, ellers etternavn + første fornavn). */
export function matchPerson(entries, rep) {
  const full = norm(`${rep.fornavn} ${rep.etternavn}`);
  return entries.find(p => norm(`${p.fornavn} ${p.etternavn}`) === full)
    || entries.find(p => norm(p.etternavn) === norm(rep.etternavn) && norm(p.fornavn).split(' ')[0] === norm(rep.fornavn).split(' ')[0])
    || null;
}

/** Hele registeroppføringen, ordrett slik Stortinget publiserer den. Transaksjonstabellen tas ut av § 9
 *  fordi handlene vises strukturert. § 10 (reiser) beholdes som tekst. */
export function publicEntry(p) {
  if (!p) return {};
  const out = {};
  for (const [k, v] of Object.entries(p.secs)) {
    if (k === 'x') { if (/ingen registreringspliktige/i.test(v)) out.ingen = 1; continue; }
    const t = (k === '9' ? v.split(/\s*(Enkelttransaksjoner|Dato Kjøp\/Salg)/)[0] : v).trim();
    if (t) out[k] = t;
  }
  return out;
}

/** Leser tabellen over enkelttransaksjoner i aksjer. */
export function parseTrades(p) {
  const s = `${p?.secs?.['9'] || ''} ${p?.secs?.['15'] || ''}`;
  const k = s.search(/Enkelttransaksjoner|Dato Kjøp\/Salg/);
  if (k < 0) return [];
  const t = s.slice(k).replace(/Uspesifise\s?rt/g, 'Uspesifisert');
  const out = [];
  for (const seg of t.split(/(?=\b\d{2}\.\d{2}\.\d{4}\s)/).slice(1)) {
    const m = seg.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\S+)\s+(.+?)\s+(ASA|AS|Annet|SA|NUF|ANS|DA)\s+(?:([\d,.E\-]+)\s+)?(\d+)\s+(\d+(?:,\d+)?)\b/);
    if (!m) continue;
    const type = /^kj/i.test(m[4]) ? 'K' : /^sa/i.test(m[4]) ? 'S' : 'U';
    out.push({
      d: `${m[3]}-${m[2]}-${m[1]}`, k: type,
      sel: m[5].replace(/\s+/g, ' ').replace(/\s+(ASA|AS)$/i, '').replace(/,$/, '').trim(),
      ant: Number(m[8]), ver: Math.round(parseFloat(m[9].replace(',', '.'))),
    });
  }
  return out;
}

/** Organisasjonsnummer-kontroll (modulus 11). */
export function validOrgnr(n) {
  if (!/^\d{9}$/.test(n)) return false;
  const w = [3, 2, 7, 6, 5, 4, 3, 2];
  const s = w.reduce((a, x, i) => a + x * Number(n[i]), 0);
  let c = 11 - (s % 11); if (c === 11) c = 0;
  return c !== 10 && c === Number(n[8]);
}

const PREFIX = /^(Aksjer i|Aksje i|Aksjonær i|Styreleder i|Styremedlem i|Styreleder|Styremedlem|Styrets leder|Varamedlem|Daglig leder|Leder|Nestleder|Innehaver|Eier av|Eier|Eies|Justert for|Navn|Selskapet|i|av|og)\s+/i;

/** Selskapsnavn og organisasjonsnumre nevnt under §§ 2, 3, 4, 8 og 9. Børsnoterte ASA hoppes over. */
export function companyCandidates(p) {
  if (!p) return [];
  const txt = ['2', '3', '4', '8', '9'].map(k => (p.secs[k] || '').split(/\s*(Enkelttransaksjoner|Dato Kjøp\/Salg)/)[0]).join(' ; ');
  const out = new Set();
  for (const m of txt.matchAll(/\b(\d{3})[\s.]?(\d{3})[\s.]?(\d{3})\b/g)) {
    const nr = m[1] + m[2] + m[3];
    if (validOrgnr(nr)) out.add('#' + nr);
  }
  for (const m of txt.matchAll(/([A-ZÆØÅ0-9][\wÆØÅæøå&.'\-]*(?: +(?:[A-ZÆØÅ0-9&][\wÆØÅæøå&.'\-]*|og|i|av|for))*?) +(AS|SA|DA|ANS|BA)\b/g)) {
    let n = m[1];
    for (let i = 0; i < 3; i++) n = n.replace(PREFIX, '').replace(/^\d+[.)]?\s+/, '');
    n = n.trim();
    if (n.length < 2 || /^(Holding|KS)$/i.test(n)) continue;
    out.add(`${n} ${m[2]}`);
  }
  return [...out];
}

export async function fetchRegister() {
  const { url, date } = await findLatestRegisterPdf();
  const bytes = await getBuffer(url);
  if (!bytes) throw new Error('Kunne ikke laste ned register-PDF');
  const text = await pdfToText(bytes);
  const entries = parseRegister(text);
  if (entries.length < 100) throw new Error(`Registeret ga bare ${entries.length} personer – formatet kan ha endret seg`);
  return { url, date, entries };
}
