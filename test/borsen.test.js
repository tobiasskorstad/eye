import test from 'node:test';
import assert from 'node:assert/strict';
import { pickIssuers, parseWikidata } from '../src/borsen.js';
import { summarize, isOrg } from '../src/partifin.js';
import { compactBio } from '../src/stortinget.js';

test('børsliste: aksjeselskaper ut fra meldinger, obligasjonsutstedere holdes utenfor', () => {
  const m = (sign, name, markets, extra = {}) => ({ issuerSign: sign, issuerName: name, markets, messageId: sign + '1', publishedTime: '2026-08-01T00:00:00Z', ...extra });
  const l = pickIssuers({
    insider: [m('EQNR', 'Equinor ASA', ['XOSL'])],
    flagging: [m('YAR', 'Yara International ASA', ['XOSL'])],
    reports: [m('YAR', 'Yara International ASA', ['XOSL'], { messageId: 'r1' }), m('GROW', 'Vekst AS', ['MERK']), m('BANKB', 'Boligkreditt AS', ['XOSL']), m('ABM', 'Bond Ltd', ['XOAM'])],
  });
  assert.deepEqual(l.map(x => x.tick).sort(), ['EQNR', 'GROW', 'YAR']);
  assert.equal(l.find(x => x.tick === 'YAR').rapport, 'r1');
  assert.equal(l.find(x => x.tick === 'GROW').marked, 'Euronext Growth');
});

test('Wikidata: nettsted, stiftelsesår og bransje per ticker', () => {
  const b = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }]));
  const w = parseWikidata({ results: { bindings: [
    b({ c: 'http://www.wikidata.org/entity/Q1', cLabel: 'Kongsberg Gruppen', tick: 'KOG', org: '943753709', web: 'http://www.kongsberg.com/', inc: '1814-01-01T00:00:00Z', indLabel: 'Maritim' }),
    b({ c: 'http://www.wikidata.org/entity/Q1', cLabel: 'Kongsberg Gruppen', tick: 'KOG', indLabel: 'forsvarsindustri' }),
    b({ c: 'http://www.wikidata.org/entity/Q2', cLabel: 'Uten ticker', web: 'javascript:alert(1)', indLabel: 'Q123' }),
  ] } });
  assert.deepEqual([w.KOG.nr, w.KOG.stiftet, w.KOG.bransje], ['943753709', 1814, ['Maritim', 'forsvarsindustri']]);
  assert.equal(Object.keys(w).length, 1, 'uten ticker eller org.nr. hoppes over');
});

test('partifinansiering: organisasjoner med navn, privatpersoner bare som sum', () => {
  assert.equal(isOrg({ address: 'Torggata 12 0181 OSLO' }), true);
  assert.equal(isOrg({ address: 'BÆRUM' }), false);
  const d = summarize([
    { parti: 'A', aar: 2025, donator: 'Fagforbundet', address: 'Boks 7003 0130 OSLO', sum: 7000000, partyUnit: 'Sentral partiorganisasjon', received: '2025-03-03' },
    { parti: 'SV', aar: 2025, donator: 'Fagforbundet ', address: 'Keysers gate 15 0165 OSLO', sum: 500000, partyUnit: 'Fylkesparti', received: '2025-04-01' },
    { parti: 'A', aar: 2025, donator: 'Kari Nordmann', address: 'KVAM', sum: 40000, partyUnit: 'Kommuneparti' },
  ]);
  assert.deepEqual(d.partier.A.aar[2025], { sum: 7040000, n: 2, org: 7000000, orgN: 1, priv: 40000, privN: 1, sentral: 7000000 });
  assert.equal(d.givere.length, 1);
  assert.deepEqual(d.givere[0].partier, { A: 7000000, SV: 500000 });
  assert.ok(!JSON.stringify(d).includes('Kari Nordmann'));
});

test('biografi: utdanning, verv og regjering, uten foreldre og fødested', () => {
  const b = compactBio({
    utdanning_yrke_kodet_liste: [{ type: '10', navn: 'Cand.mag., Universitetet i Bergen', fra_aar: 1986, til_aar: 1986 }, { type: '20', navn: 'Konsulent', fra_aar: 1987, til_aar: -1 }],
    verv_kodet_liste: [{ type: 'kommune', organisasjon: 'Bystyre', sted: 'Bergen', verv: 'Medlem', fra_aar: 1979, til_aar: 1983 }],
    stortingsperiode_kodet_liste: [{ stortingsperiode_id: '1989-93', parti_id: 'H', fylke: 'Hordaland', verv: 'Representant' }],
    stortingsverv_kodet_liste: [{ komite_navn: 'Finanskomiteen', verv: 'Leder', fra_aar: 2025, til_aar: -1, komite_type: 'KOMI', stortingsperiode_id: '2025-29' }],
    permisjon_kodet_liste: [{ fravaer_grunn: 'REGJ', fra_dato: '/Date(1381874400000+0200)/', til_dato: '/Date(1506636000000+0200)/' }, { fravaer_grunn: 'SYK' }],
    personalia_kodet: { ansiennitet_aar: 37, foede_kommune: 'Bergen', person_biografi_foreldre_far_kodet: { fornavn: 'Asbjørn' } },
  });
  assert.equal(b.uy.length, 2); assert.equal(b.uy[1][3], null, 'ukjent sluttår blir null');
  assert.deepEqual(b.regj, [['2013-10-15', '2017-09-28']]);
  assert.equal(b.ans[0], 37);
  assert.ok(!JSON.stringify(b).includes('Asbjørn') && !JSON.stringify(b).includes('Bergen"]'.slice(0, 0) + 'foede'));
});
