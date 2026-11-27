// Mock av Stortinget, interesseregisteret og Brreg, med samme JSON-formater som de ekte API-ene.
// Bygget fra et ekte øyeblikksbilde (test/fixtures) slik at testene ligner virkeligheten.
import http from 'node:http';
import fs from 'node:fs';
import PDFDocument from 'pdfkit';

const load = f => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const F = new Function(load('data.js') + load('reg.js') + load('co.js') + '; return {REPS,FIX,PARTI,KOM,REG,TRADES,COS}')();

const msDate = (y, m = 6, d = 15) => `/Date(${Date.UTC(y, m - 1, d, 11)}+0100)/`;
const split = navn => { const p = navn.split(' '); return { fornavn: p.slice(0, -1).join(' '), etternavn: p.at(-1) }; };

export const reps = F.REPS.map(r => {
  const f = F.FIX[r[0]];
  return { id: r[0], navn: r[1], ...split(r[1]), parti: r[2], fylke: r[3], kom: r[4] ? r[4].split('|') : [], fodt: r[5], vara: !!r[7],
    per: f ? f[0] : r[8], forst: f ? f[1] : r[9], utd: (f && f[2]) || r[10], yrke: (f && f[3]) || r[11], q: r[12], top: r[13] };
});
export const birth = id => { const r = reps.find(x => x.id === id); return `${r.fodt}-06-15`; };

/* ---------- Stortinget ---------- */
function dagens() {
  return { dagensrepresentanter_liste: reps.map(r => ({
    id: r.id, fornavn: r.fornavn, etternavn: r.etternavn, foedselsdato: msDate(r.fodt), kjoenn: 1, vara_representant: r.vara,
    parti: { id: r.parti, navn: F.PARTI[r.parti] }, fylke: { id: 'X', navn: r.fylke },
    komiteer_liste: r.kom.map(k => ({ id: k, navn: F.KOM[k] })),
  })) };
}
function questions(ses, type) {
  if (ses !== '2026-2027' || type !== 'skriftligesporsmal') return { sporsmal_liste: [] };
  const list = []; let id = 130000;
  for (const r of reps) {
    const tops = (r.top || '').split('|').filter(Boolean).map(x => x.split(':'));
    for (const [dep, n] of tops) for (let i = 0; i < Number(n); i++) {
      list.push({ id: id++, sporsmal_fra: { id: r.id }, sporsmal_til_minister_tittel: dep + 'ministeren',
        datert_dato: msDate(2026, 1 + (i % 11), 1 + (i % 27)), tittel: `Spørsmål ${i + 1} fra ${r.navn} om ${dep}sektoren?` });
    }
  }
  return { sesjon_id: ses, sporsmal_liste: list };
}
function bio(id) {
  const r = reps.find(x => x.id === id);
  if (!r || id === 'TIM') return null; // én manglende biografi tester advarsler
  const per = Array.from({ length: r.per }, (_, i) => ({ stortingsperiode_id: `${(r.forst || 2025) + 4 * i}-${(r.forst || 2025) + 4 * i + 4}` }));
  const uy = [];
  if (r.utd) uy.push({ type: '10', navn: r.utd.replace(/\s*\(.*$/, ''), fra_aar: 2000, til_aar: 2004 });
  if (r.yrke) uy.push({ type: '20', navn: r.yrke.replace(/\s*\(.*$/, ''), fra_aar: 2005, til_aar: -1 });
  return { person_id: id, stortingsperiode_kodet_liste: per, utdanning_yrke_kodet_liste: uy };
}

/* ---------- Interesseregister (PDF) ---------- */
const PDF_PATH = '/globalassets/pdf/verv-og-okonomiske-interesser/arkiv_2026-2027/pr-13-november-2026.pdf';
const LAB = { 2: 'Styreverv mv.', 3: 'Selvstendig næring', 4: 'Lønnet stilling m.v.', 7: 'Økonomisk støtte', 8: 'Eiendom i næring', 9: 'Selskapsinteresser', '9a': 'Gjeld i næringsvirksomhet', 11: 'Gaver' };
const wrap = (s, n = 95) => { const out = []; let line = ''; for (const w of s.split(' ')) { if ((line + ' ' + w).length > n) { out.push(line); line = w; } else line = line ? line + ' ' + w : w; } if (line) out.push(line); return out; };

export function registerLines() {
  const lines = ['Register', 'For stortingsrepresentantenes verv og økonomiske interesser', '§ 2. Verv i private eller offentlige selskapers styrende organer.', 'Representanter'];
  let page = 5;
  const sorted = [...reps].sort((a, b) => a.etternavn.localeCompare(b.etternavn, 'nb'));
  for (const r of sorted) {
    lines.push(`${r.etternavn}, ${r.fornavn} (${r.parti}, ${r.fylke})`);
    const e = { ...(F.REG[r.id] || {}) };
    if (r.id === 'ALFAND') e['3'] = '50% eier av Egeland & Andersen Holding AS sammen med kona Nina Bø Egeland';
    if (r.id === 'DHO') e['8'] = 'En eiendom i Lødingen kommune (Gnr. 28/Brn. 23) Solvegen 6, 8410 Lødingen benyttes til utleie.';
    if (e.ingen) lines.push('Har ingen registreringspliktige interesser');
    for (const k of ['2', '3', '4', '7', '8', '9', '9a', '11']) {
      if (!e[k]) continue;
      const w = wrap(`§${k} ${LAB[k]} ${e[k].replace(/ …$/, '')}`);
      lines.push(...w);
      if (k === '9') {
        const tr = F.TRADES.filter(t => t[0] === r.id);
        if (tr.length) {
          lines.push('Enkelttransaksjoner', 'Dato Kjøp/Salg Selskapsnavn Ansvarsform Eierandel (%) Antall Verdi (NOK)');
          for (const t of tr) lines.push(`${t[1].split('-').reverse().join('.')} ${t[2] === 'K' ? 'Kjøp' : t[2] === 'S' ? 'Salg' : 'Uspesifisert'} ${t[3]} ASA ${t[4]} ${t[5]},5`);
        }
      }
    }
    if (e.r) lines.push(`§10 Utenlandsreiser - 1.-3. mars 2024, Belgia, Organisasjon`);
    if (r.id === 'JUNGRU') lines.push('§15 Andre forhold Familiebedrift eies av onkelen min Thom Erik Gruer.');
    if (lines.length % 40 === 0) lines.push(`${page++} Ajourført pr. 13. november 2026`);
  }
  return lines;
}
let pdfCache;
function registerPdf() {
  if (pdfCache) return Promise.resolve(pdfCache);
  return new Promise(resolve => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = []; doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(pdfCache = Buffer.concat(chunks)));
    doc.fontSize(8);
    for (const l of registerLines()) doc.text(l, { lineBreak: false, width: 520 }).moveDown(0.15);
    doc.end();
  });
}

/* ---------- Brreg ---------- */
const norm = s => s.toUpperCase().replace(/[^A-Z0-9ÆØÅ&]/g, ' ').replace(/\s+/g, ' ').trim();
const enhet = c => ({
  organisasjonsnummer: c[0], navn: c[1].toUpperCase(), organisasjonsform: { kode: c[2], beskrivelse: c[2] },
  forretningsadresse: { kommune: c[3].toUpperCase() }, naeringskode1: { beskrivelse: c[4] },
  harRegistrertAntallAnsatte: c[5] > 0, antallAnsatte: c[5] > 0 ? c[5] : undefined,
  stiftelsesdato: `${c[6]}-01-01`, konkurs: c[7].includes('K'), underAvvikling: c[7].includes('V'),
});
function roller(c) {
  const persons = [];
  if (c[10]) for (const x of c[10].split(';')) {
    const [id, roles] = x.split(':'); const r = reps.find(y => y.id === id);
    for (const ro of roles.split('/')) persons.push({ person: { fodselsdato: birth(id), navn: { fornavn: r.fornavn, etternavn: r.etternavn } }, type: { beskrivelse: ro }, avregistrert: false });
  }
  persons.push({ person: { fodselsdato: '1970-01-01', navn: { fornavn: 'Privat', etternavn: 'Person' } }, type: { beskrivelse: 'Styremedlem' }, avregistrert: false });
  return { rollegrupper: [{ type: { beskrivelse: 'Styre' }, roller: persons }] };
}

/* ---------- bilder og Wikipedia ---------- */
export const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(900, 7), Buffer.from([0xff, 0xd9])]);
export const WIKI_TEXT = 'Jonas Gahr Støre (født 25. august 1960 i Oslo) er en norsk politiker fra Arbeiderpartiet og statsminister.';
function wiki(lang, titles) {
  const base = `http://${'127.0.0.1'}`; // erstattes ikke: bildeadressen settes av testen via WIKI_UPLOAD
  const pages = titles.map(t => t === 'Jonas Gahr Støre' && lang === 'no' ? { title: t, extract: WIKI_TEXT, description: 'norsk politiker', thumbnail: { source: (process.env.WIKI_UPLOAD || base) + 'x.jpg' }, pageimage: 'Støre.jpg' }
    : t === 'Anders Opedal' && lang === 'no' ? { title: t, extract: 'Anders Opedal (født 1968) er en norsk ingeniør og næringslivsleder.', description: 'norsk næringslivsleder', thumbnail: { source: (process.env.WIKI_UPLOAD || base) + 'x.jpg' }, pageimage: 'Opedal.jpg' }
    : t === 'Haagen Poppe' ? { title: t, extract: 'Haagen Poppe kan vise til flere personer.', pageprops: { disambiguation: '' } }
    : { title: t, missing: true });
  return { query: { pages } };
}

/* ---------- server ---------- */
export function startMock(port = 0) {
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x'); const p = u.pathname;
    const send = (code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
    let m;
    if (p === '/st/dagensrepresentanter') return send(200, dagens());
    if (p === '/st/sesjoner') return send(200, { innevaerende_sesjon: { id: '2026-2027' }, sesjoner_liste: [{ id: '2024-2025' }, { id: '2025-2026' }, { id: '2026-2027' }] });
    if (p === '/st/stortingsperioder') return send(200, { innevaerende_stortingsperiode: { id: '2025-2029' } });
    if (['/st/skriftligesporsmal', '/st/sporretimesporsmal', '/st/interpellasjoner'].includes(p)) return send(200, questions(u.searchParams.get('sesjonid'), p.slice(4)));
    if (p === '/st/regjering') return send(200, { regjeringsmedlemmer_liste: [{ id: 'JGS', fornavn: 'Jonas Gahr', etternavn: 'Støre', tittel: 'Statsminister', departement: 'Statsministerens kontor', parti: { id: 'A' } }] });
    if (p === '/st/saker') return send(200, { saker_liste: [{ id: 501, status: 1, korttittel: 'Testsak om skatt', sist_oppdatert_dato: msDate(2026, 11, 20) }, { id: 502, status: 2, korttittel: 'Ubehandlet' }] });
    if (p === '/st/voteringer') return send(200, { sak_votering_liste: [{ votering_id: 9001, personlig_votering: true, votering_tid: msDate(2026, 11, 20), votering_tema: 'Forslag nr. 1', vedtatt: true, antall_for: 2, antall_mot: 1, antall_ikke_tilstede: 0 }, { votering_id: 9002, personlig_votering: false }] });
    if (p === '/st/voteringsresultat') return send(200, { voteringsresultat_liste: reps.slice(0, 4).map((r, i) => ({ representant: { id: r.id, parti: { id: r.parti } }, votering: [2, 3, 2, 1][i] })) });
    if (p === '/faktisk') return send(200, '<html><a href="/faktasjekk/stemmer-pastand-om-skatt/123"><h3>Faktasjekk Stemmer påstanden om skatt fra Frp?</h3></a><time datetime="2026-11-20T10:00:00Z"></time></html>', 'text/html');
    if (p === '/ob/list') return send(200, { data: { messages: u.searchParams.get('category') === '1102'
      ? [{ messageId: 7001, title: 'Mandatory notification of trade', issuerName: 'Equinor ASA', issuerSign: 'EQNR', publishedTime: '2026-11-25T08:00:00Z' }]
      : [{ messageId: 7002, title: 'Disclosure of large shareholding', issuerName: 'Equinor ASA', issuerSign: 'EQNR', publishedTime: '2026-11-24T08:00:00Z' }] } });
    if (p === '/ob/message') return send(200, { data: { message: { body: u.searchParams.get('messageId') === '7001'
      ? 'Anders Opedal, CEO of Equinor ASA, has today bought 10 000 shares at NOK 250 per share in the company.'
      : 'Folketrygdfondet AS has increased its holding and now owns 6,1 % of the shares in Equinor ASA, above the 5 % threshold.' } } });
    if (p === '/st/personbilde') return ['JGS', 'MARNIL', 'HSP'].includes(u.searchParams.get('personid')) ? send(200, JPEG, 'image/jpeg') : send(404, 'ikke funnet', 'text/plain');
    if ((p === '/wiki/no') && !u.searchParams.get('exintro')) return send(200, { query: { pages: [{ title: u.searchParams.get('titles'), extract: 'Anders Opedal er norsk næringslivsleder. Han har vært konsernsjef i Equinor siden 2020.' }] } });
    if (p === '/wiki/no' || p === '/wiki/en') return send(200, wiki(p.slice(6), (u.searchParams.get('titles') || '').split('|')));
    if (p === '/wiki/upload/x.jpg') return send(200, JPEG, 'image/jpeg');
    if (p === '/st/kodetbiografi') { const b = bio(u.searchParams.get('personid')); return b ? send(200, b) : send(404, {}); }
    if (p === '/web/register/') return send(200, `<html><body><a href="${PDF_PATH}">Se register (pdf)</a><a href="/globalassets/pdf/verv-og-okonomiske-interesser/skjema.pdf">skjema</a></body></html>`, 'text/html');
    if (p === PDF_PATH) return send(200, await registerPdf(), 'application/pdf');
    if (p === '/rss') return send(200, `<?xml version="1.0"?><rss><channel><title>Testnytt</title>
<item><title>Listhaug vil kutte bompenger</title><link>https://example.no/a</link><pubDate>${new Date().toUTCString()}</pubDate><description>Frp-lederen la fram forslag.</description></item>
<item><title><![CDATA[Vedum: – Dieselprisen må ned]]></title><link>https://example.no/b</link><pubDate>${new Date().toUTCString()}</pubDate></item>
<item><title>Været blir fint i helgen</title><link>https://example.no/c</link><pubDate>${new Date().toUTCString()}</pubDate></item>
<item><title>Gammel sak om Høyres landsmøte</title><link>https://example.no/d</link><pubDate>Mon, 01 Jan 2024 10:00:00 GMT</pubDate></item>
</channel></rss>`, 'application/rss+xml');
    if (p === '/br/enheter') {
      const q = norm(u.searchParams.get('navn') || '');
      const hits = F.COS.filter(c => norm(c[1]).includes(q)).slice(0, Number(u.searchParams.get('size') || 20));
      return send(200, hits.length ? { _embedded: { enheter: hits.map(enhet) } } : { page: { totalElements: 0 } });
    }
    if ((m = p.match(/^\/br\/enheter\/(\d{9})\/roller$/))) { const c = F.COS.find(x => x[0] === m[1]); return c ? send(200, roller(c)) : send(404, {}); }
    if ((m = p.match(/^\/br\/enheter\/(\d{9})$/))) { const c = F.COS.find(x => x[0] === m[1]); return c ? send(200, enhet(c)) : send(404, {}); }
    if (p.startsWith('/br/underenheter/')) return send(404, {});
    send(404, { feil: 'mock: ukjent ' + p });
  });
  return new Promise(r => srv.listen(port, () => r(srv)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await startMock(Number(process.argv[2] || 9911));
  console.log('mock på', s.address().port);
}
