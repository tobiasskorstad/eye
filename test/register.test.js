import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRegister, parseTrades, publicEntry, companyCandidates, validOrgnr, dateFromName, matchPerson } from '../src/register.js';

// Utdrag fra ekte register-tekst (pdf.js-uttrekk, ajourført 13.11.2026)
const RAW = `Ajourført pr. 13. november 2026
Representanter
Andersen, Alf Erik (FrP, Vest-Agder)
§2 Styreverv mv. Kommunestyremedlem Lindesnes kommune (møtegodtgjørelse).
Styremedlem Egeland & Andersen Holding AS (ikke godtgjørelse).
§3 Selvstendig næring 50% eier av Egeland & Andersen Holding AS sammen med kona
Nina Bø Egeland
§9 Selskapsinteresser Egeland & Andersen Holding AS, eier 50 %
Amundsen, Per-Willy (FrP, Troms)
Har ingen registreringspliktige interesser
Nilsen, Marius Arion (FrP, Aust-Agder)
§2 Styreverv mv. Styreleder og daglig leder i Smite AS - Ulønnet
§9 Selskapsinteresser Eier selskapet Smite AS 100%
Enkelttransaksjoner
Dato Kjøp/Salg Selskapsnavn Ansvarsform Eierandel (%) Antall Verdi (NOK)
26.05.2026 Kjøp Kongsberg Maritime ASA 24 1488,52
08.05.2026 Uspesifise
rt
TGS ASA ASA 76 146,3
36 Ajourført pr. 13. november 2026
22.04.2026 Kjøp Kongsberg Gruppen ASA 26 9744
02.03.2026 Salg Autostore AS 1000 10301
Kristiansen, Jørgen H. (KrF, Aust-Agder)
§2 Styreverv mv. Styremedlem: Kristiansand kommunale pensjonskasse (orgnr: 840 046 672). Godtgjørelse.
§10 Utenlandsreiser - 14.-22. juli 2018, Tanzania, Forum
- 16.-19. mai 2019, Colombia, Organisasjon
Olsen, Dagfinn Henrik (FrP, Nordland)
§8 Eiendom i næring En eiendom i Lødingen kommune Gnr. 28/Brn. 23 Solvegen 6.
Regjeringsmedlemmer
`;

test('parser personer og paragrafer', () => {
  const P = parseRegister(RAW);
  assert.equal(P.length, 5);
  assert.deepEqual(P.map(p => p.etternavn), ['Andersen', 'Amundsen', 'Nilsen', 'Kristiansen', 'Olsen']);
  assert.match(P[0].secs['2'], /^Kommunestyremedlem Lindesnes/);
  assert.ok(!P[4].secs['8'].includes('Regjeringsmedlemmer'));
});

test('aksjehandler, inkl. linjeskift og sidefot midt i tabellen', () => {
  const P = parseRegister(RAW);
  const t = parseTrades(P[2]);
  assert.equal(t.length, 4);
  assert.deepEqual(t[0], { d: '2026-05-26', k: 'K', sel: 'Kongsberg Maritime', ant: 24, ver: 1489 });
  assert.equal(t[1].k, 'U'); assert.equal(t[1].sel, 'TGS');
  assert.deepEqual(t[3], { d: '2026-03-02', k: 'S', sel: 'Autostore', ant: 1000, ver: 10301 });
});

test('registeret gjengis ordrett, også § 10 og § 15', () => {
  const P = parseRegister(RAW);
  const a = publicEntry(P[0]);
  assert.equal(a['3'], '50% eier av Egeland & Andersen Holding AS sammen med kona Nina Bø Egeland');
  assert.match(publicEntry(P[4])['8'], /Gnr\. 28\/Brn\. 23 Solvegen 6/);
  assert.match(publicEntry(P[3])['10'], /Tanzania/);
});

test('offentlig oppføring: ingen-flagg, reiser, transaksjoner kuttet', () => {
  const P = parseRegister(RAW);
  assert.equal(publicEntry(P[1]).ingen, 1);
  assert.equal(publicEntry(P[2])['9'], 'Eier selskapet Smite AS 100%');
});

test('selskapskandidater og orgnr', () => {
  const P = parseRegister(RAW);
  assert.deepEqual(companyCandidates(P[0]), ['Egeland & Andersen Holding AS']);
  assert.ok(companyCandidates(P[3]).includes('#840046672'));
  assert.ok(companyCandidates(P[2]).includes('Smite AS'));
  assert.ok(!companyCandidates(P[2]).some(c => /Kongsberg|Autostore/.test(c)), 'transaksjoner skal ikke bli kandidater');
  assert.ok(validOrgnr('989459317')); assert.ok(!validOrgnr('760241000'));
});

test('dato fra filnavn og navnematch', () => {
  assert.equal(dateFromName('/x/pr-13-november-2026.pdf'), '2026-11-13');
  const P = parseRegister(RAW);
  assert.equal(matchPerson(P, { fornavn: 'Marius Arion', etternavn: 'Nilsen' }).etternavn, 'Nilsen');
  assert.equal(matchPerson(P, { fornavn: 'Jørgen', etternavn: 'Kristiansen' }).fornavn, 'Jørgen H.');
});
