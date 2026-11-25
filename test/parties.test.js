import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseRss, matchParties } from '../src/news.js';

const P = JSON.parse(fs.readFileSync(new URL('../content/partier.json', import.meta.url)));

test('partiinnhold: alle partier har lik struktur (likebehandling)', () => {
  assert.equal(Object.keys(P.partier).length, 9);
  for (const [k, p] of Object.entries(P.partier)) {
    assert.ok(p.leder && p.rolle && p.om, k);
    assert.equal(p.saker.length, 3, `${k}: tre saker`);
    for (const s of p.saker) {
      assert.equal(s.for.length, 2, `${k}/${s.tittel}: to for`);
      assert.equal(s.mot.length, 2, `${k}/${s.tittel}: to mot`);
      assert.match(s.kilde, /^https:\/\//);
    }
    assert.ok(p.nyheter.length >= 2, `${k}: nyheter`);
    for (const n of p.nyheter) assert.match(n.url, /^https:\/\//);
    assert.ok(P.maling.snitt[k] > 0, `${k}: måling`);
  }
});

test('RSS og Atom parses, og saker kobles til riktig parti', () => {
  const rss = parseRss('<rss><channel><title>NRK</title><item><title>KrF og Frp om kjernekraft</title><link>https://x.no/1</link><pubDate>Tue, 24 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>', 'nrk');
  assert.equal(rss[0].dato, '2026-11-24');
  const atom = parseRss('<feed><title>T</title><entry><title>Melby legger fram budsjett</title><link href="https://x.no/2"/><updated>2026-11-18T08:00:00Z</updated></entry></feed>', 't');
  const m = matchParties([...rss, ...atom], { V: 'Guri Melby' });
  assert.equal(m.KrF.length, 1); assert.equal(m.FrP.length, 1); assert.equal(m.V.length, 1);
  assert.equal(m.H.length, 0, '«Høyre» alene skal ikke gi treff på ord som høyresiden');
});

import { summarize } from '../src/votes.js';
import fsx from 'node:fs';

test('voteringer: partistandpunkt, enighet og oppmøte', () => {
  const s = summarize([{ tid: '/Date(1763640000000+0100)/', sak: 1, tittel: 'T', tema: 'x', vedtatt: true, for: 3, mot: 1, borte: 1,
    res: [['a', 'A', 'for'], ['b', 'A', 'for'], ['c', 'H', 'mot'], ['d', 'H', 'borte'], ['e', 'SV', 'for']] }]);
  assert.deepEqual(s.voteringer[0].pos, { A: 'F', H: 'M', SV: 'F' });
  assert.equal(s.enighet.A.SV, 100); assert.equal(s.enighet.A.H, 0);
  assert.deepEqual(s.oppmote.d, { n: 1, borte: 1 });
});

test('løfter og faktasjekk: hver påstand har kilde og gyldig status', () => {
  const L = JSON.parse(fsx.readFileSync(new URL('../content/lofter.json', import.meta.url)));
  const OK = ['Innfridd', 'Delvis', 'Pågår', 'Bak skjema', 'Ikke innfridd', 'Brutt', 'Brutt og rettet'];
  for (const x of L.regjering.lofter) { assert.ok(OK.includes(x.status), x.status); assert.ok(x.kilder.length >= 1 && x.kilder.every(k => /^https:/.test(k.u))); }
  for (const [p, l] of Object.entries(L.gjennomslag.partier)) assert.ok(l.every(g => /^https:/.test(g.u)), p);
  const F = JSON.parse(fsx.readFileSync(new URL('../content/faktasjekk.json', import.meta.url)));
  assert.ok(F.kritikk.length >= 1, 'kritikk av faktasjekkerne skal med');
  assert.ok(F.sjekker.every(s => /^https:\/\/www\.faktisk\.no\//.test(s.u)));
});

test('politikk for dummies: alle partier har standpunkt, kilder og lik struktur', () => {
  const X = JSON.parse(fsx.readFileSync(new URL('../content/dummies.json', import.meta.url)));
  const P = JSON.parse(fsx.readFileSync(new URL('../content/partier.json', import.meta.url)));
  const parties = Object.keys(P.partier).sort();
  assert.ok(X.tema.length >= 8);
  for (const t of X.tema) {
    assert.deepEqual(Object.keys(t.partier).sort(), parties, t.id + ': alle partier må ha standpunkt');
    assert.ok(Object.values(t.partier).every(v => Number.isInteger(v) && v >= -2 && v <= 2), t.id);
    for (const k of ['navn', 'kort', 'for', 'mot', 'pastand', 'sok']) assert.ok(t[k] && t[k].length > 1, `${t.id}.${k}`);
    assert.ok(t.kilder.length >= 1 && t.kilder.every(k => /^https:\/\//.test(k.u)), t.id + ': kilder');
    assert.doesNotThrow(() => new RegExp(t.sok));
    for (const p of Object.keys(t.merk || {})) assert.ok(parties.includes(p), t.id + ' merk ' + p);
    // Balanse: hvert spørsmål skal faktisk skille partiene (ellers er det ingen reell strid å forklare)
    assert.ok(new Set(Object.values(t.partier)).size >= 2, t.id + ' skiller ikke');
  }
  // Ingen parti skal få 100 % eller 0 % treff med alle svar nøytrale (testen fanger skjev skala)
  const neutral = parties.map(p => X.tema.reduce((s, t) => s + (1 - Math.abs(t.partier[p]) / 4), 0) / X.tema.length);
  assert.ok(Math.max(...neutral) < 0.95 && Math.min(...neutral) > 0.4);
});

test('automatikk: Poll of polls tolkes, ugyldig tabell avvises', async () => {
  const { parsePolls, buildNow, mergeLeaders } = await import('../src/auto.js');
  const head = ['Ap', 'H', 'Frp', 'SV', 'Sp', 'KrF', 'V', 'MDG', 'R', 'A'].map(c => `<th><a href="?cmd=Partier&amp;parti=${c}">${c}</a></th>`).join('');
  const row = (yw, l, v) => `<tr><th><a href="?cmd=Stortinget&amp;do=snitt&amp;yw=${yw}">${l}</a></th>${v.map(x => `<td>${x} (1)</td>`).join('')}</tr>`;
  const html = `<table><tr><th></th>${head}</tr>${row('202611', "November '26", ['21,3', '13,7', '32,5', '5,5', '5,0', '3,9', '3,6', '4,2', '8,4', '2,0'])}${row('202610', "Oktober '26", ['21,5', '13,1', '33,7', '4,6', '5,4', '3,7', '3,5', '4,2', '7,7', '2,4'])}</table>`;
  const m = parsePolls(html);
  assert.equal(m.snitt.FrP, 32.5); assert.equal(m.snitt.A, 21.3); assert.equal(m.utvikling.length, 2); assert.equal(m.utvikling[1].mnd, '2026-11');
  assert.equal(parsePolls('<table><tr><td>x</td></tr></table>'), null);
  const w = []; const p = { MDG: { leder: 'Arild Hermstad (sykmeldt)' }, H: { leder: 'Erna Solberg' } };
  mergeLeaders(p, { MDG: 'Arild Hermstad', H: 'Ine Eriksen Søreide' }, w);
  assert.equal(p.MDG.leder, 'Arild Hermstad (sykmeldt)'); assert.equal(p.H.leder, 'Ine Eriksen Søreide'); assert.equal(w.length, 1);
  const now = Date.parse('2026-11-25T12:00:00Z');
  const n = buildNow({ A: [{ tittel: 'x', url: 'https://a/1', dato: '2026-11-25', kilde: 'NRK' }, { tittel: 'gammel', url: 'https://a/2', dato: '2026-10-01', kilde: 'NRK' }], H: [{ tittel: 'x', url: 'https://a/1', dato: '2026-11-25', kilde: 'NRK' }] }, { voteringer: [{ d: '2026-11-24', sak: 1, tittel: 'S', vedtatt: true }, { d: '2026-11-24', sak: 1, tittel: 'S', vedtatt: true }] }, 3, now);
  assert.equal(n.nyheter.length, 1); assert.deepEqual(n.nyheter[0].ps, ['A', 'H']); assert.equal(n.vedtak.length, 1);
});

test('voteringscache: andre kjøring gir samme resultat (cache ødelegges ikke)', async () => {
  const os = await import('node:os'), path = await import('node:path'), http = await import('node:http');
  const dir = fsx.mkdtempSync(path.join(os.tmpdir(), 'votes-'));
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); res.setHeader('content-type', 'application/json');
    if (u.pathname.endsWith('/saker')) return res.end(JSON.stringify({ saker_liste: [{ id: 1, status: 1, korttittel: 'Sak', sist_oppdatert_dato: '/Date(1763640000000+0100)/' }] }));
    if (u.pathname.endsWith('/voteringer')) return res.end(JSON.stringify({ sak_votering_liste: [{ votering_id: 7, personlig_votering: true, votering_tid: '/Date(1763640000000+0100)/', votering_tema: 'T', vedtatt: true, antall_for: 1, antall_mot: 1, antall_ikke_tilstede: 0 }] }));
    if (u.pathname.endsWith('/voteringsresultat')) return res.end(JSON.stringify({ voteringsresultat_liste: [{ representant: { id: 'a', parti: { id: 'A' } }, votering: 2 }, { representant: { id: 'b', parti: { id: 'H' } }, votering: 3 }] }));
    res.statusCode = 404; res.end('{}');
  }).listen(0);
  const base = `http://127.0.0.1:${srv.address().port}/st`;
  process.env.DATA_DIR = dir; process.env.STORTINGET_API = base; process.env.STORTINGET_DELAY_MS = '0';
  const { config } = await import('../src/config.js');
  Object.assign(config, { dataDir: dir, stortingetApi: base, stortingetDelayMs: 0 });
  const { allowHosts } = await import('../src/http.js'); allowHosts([base]);
  const { fetchVotes } = await import('../src/votes.js');
  try {
    const a = await fetchVotes(['2025-2026']), b = await fetchVotes(['2025-2026']);
    assert.equal(a.antall, 1); assert.equal(b.antall, 1, 'cachet kjøring skal gi samme antall');
  } finally { srv.close(); }
});

test('innsidehandel: kjøp/salg, antall og kurs leses ut, politikere merkes', async () => {
  const { parseInsider, tagPoliticians } = await import('../src/insider.js');
  const a = parseInsider('Sandnes, 25 November 2026: Deputy employee representative to the Board,\nTrond Myklebust in Vår Energi has bought 6000 shares in the company at a price\nof NOK 42.79 per share. Following the transaction, Trond Myklebust holds 10 328 shares.\n\nContact', 'Vår Energi ASA: Notification of trade by primary insider');
  assert.equal(a.k, 'K'); assert.equal(a.ant, 6000); assert.equal(a.kurs, 42.79);
  const b = parseInsider('Lars-Petter Nesvåg, board member in Norconsult ASA has today sold 85 000 shares in the Company at a price of NOK 35.225 per share.', '');
  assert.equal(b.k, 'S'); assert.equal(b.ant, 85000); assert.equal(b.kurs, 35.225);
  const c = parseInsider('On 25 November 2026, Jarah Invest AS purchased 44,575 shares in Induct AS at a price of NOK 0.42 per share.', '');
  assert.equal(c.ant, 44575); assert.equal(c.kurs, 0.42);
  const t = tagPoliticians([{ tekst: 'Styremedlem Ola Nordmann har kjøpt aksjer', tittel: '' }, { tekst: 'Ola har kjøpt', tittel: '' }], [{ navn: 'Ola Nordmann', gruppe: 'Stortinget', ref: 'ON' }]);
  assert.equal(t[0].pol[0].ref, 'ON'); assert.equal(t[1].pol, undefined, 'bare fullt navn gir treff');
});

test('eiere: flaggemeldinger og navn/rolle på innsidere leses ut', async () => {
  const { parseFlagging, who } = await import('../src/insider.js');
  const f = parseFlagging('Fond forvaltet av Storebrand Asset Management AS solgte i dag 24.11.2026, 71865 aksjer i Scatec ASA. Etter salget eier fond forvaltet av Storebrand Asset Management AS 7 926 038 aksjer som utgjør en eierandel på 4,956 % av aksjene og stemmene i Scatec ASA.', '', 'Scatec ASA');
  assert.deepEqual([f.eier, f.retning, f.pst], ['Storebrand Asset Management AS', 'ned', 4.956]);
  const g = parseFlagging('Upon completion of the merger, Ferd AS will become the direct holder of 43,739,651 shares in General Oceans ASA, representing approximately 22.75% of the shares.', '', 'General Oceans ASA');
  assert.equal(g.eier, 'Ferd AS'); assert.equal(g.pst, 22.75);
  assert.deepEqual(who('Lars-Petter Nesvåg, board member in Norconsult ASA has today sold 85 000 shares'), { navn: 'Lars-Petter Nesvåg', rolle: 'board member' });
  assert.deepEqual(who('Styreleder Ola Nordmann i Equinor ASA har kjøpt 1000 aksjer'), { navn: 'Ola Nordmann', rolle: 'Styreleder' });
  assert.equal(who('The company has bought back shares'), null);
});
