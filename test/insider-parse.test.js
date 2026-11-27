// Tolking av ekte formuleringer fra Oslo Børs-meldinger (november 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { who, parseInsider, parseFlagging, about } from '../src/insider-parse.js';

test('hvem handlet: vanlige formuleringer', () => {
  const cases = [
    ['Vidar Hasund, Contracted Chief Financial Officer of 2020 Bulkers Ltd., has sold 64 100 shares', 'Vidar Hasund', 'Contracted Chief Financial Officer'],
    ['AS Saturn, a close associate of CEO and primary insider Jon Asbjørn Bø, has today purchased', 'Jon Asbjørn Bø', 'CEO'],
    ['Oslo, Norway, 27 November 2026: Primary insider Ole Kristian Sørlie, Head of Finance of Thor Medical ASA, has today acquired', 'Ole Kristian Sørlie', 'Head of Finance'],
    ['has received notification of a transaction in its securities related to Mr. Tor Olav Trøim, a director of the Company', 'Tor Olav Trøim', 'director'],
    ['Lola Bidco AS, a close associate of the board member and primary insider Ashkan Senobari, purchased a total of', 'Ashkan Senobari', 'board member'],
    ['Kathleen Offman Mathisen, CHRO in Grieg Seafood ASA, has on 26 November 2026 acquired', 'Kathleen Offman Mathisen', 'CHRO'],
    ['Mr. Lars-Christian Svensen, Contracted CEO, has purchased 6,800 shares', 'Lars-Christian Svensen', 'Contracted CEO'],
    ['Ola Nordmann, styreleder i Equinor ASA, har kjøpt 1 000 aksjer', 'Ola Nordmann', 'styreleder'],
  ];
  for (const [t, navn, rolle] of cases) assert.deepEqual(who(t), { navn, rolle }, t);
  assert.equal(who('The Company has today been notified that the Board of Directors has approved'), null, 'ingen falske navn');
});

test('innsidehandel: topplinje hoppes over, beløp, kurs og valuta', () => {
  const body = "27.11.2026 16:13:01 CET | Thor Medical ASA | Managers' transaction\n\nOslo, Norway, 27 November 2026: Primary insider Ole Kristian Sørlie, Head of\nFinance of Thor Medical ASA, has today acquired 34,000 shares in Thor Medical\nASA at an average price of NOK 2.95 per share.\n\nABOUT THOR MEDICAL ASA\n\nThor Medical is a leading supplier of high-purity isotopes to the\nradiopharmaceutical industry, headquartered in Oslo.\n\nATTACHMENTS\n\nfile.pdf";
  const p = parseInsider(body, 'Thor Medical ASA: Primary Insider Transaction');
  assert.equal(p.navn, 'Ole Kristian Sørlie'); assert.equal(p.k, 'K'); assert.equal(p.ant, 34000); assert.equal(p.kurs, 2.95); assert.equal(p.cur, 'NOK');
  assert.match(p.om, /^Thor Medical is a leading supplier of high-purity isotopes/);
  const usd = parseInsider('Mr. John Smith, CEO, has purchased 10,000 shares at an average price of USD 4.10 per share.', 'Notification of PDMR transaction');
  assert.equal(usd.cur, 'USD'); assert.equal(usd.kurs, 4.1);
  const noCur = parseInsider('On 27 November 2026, Intertrade Shipping AS purchased 100,000 shares in Medistim ASA at a price of 333 per share.', 'Mandatory notification of trade');
  assert.equal(noCur.ant, 100000); assert.equal(noCur.kurs, 333);
});

test('flagging: eier fra tittel, «on behalf of» og tekst', () => {
  assert.equal(parseFlagging('', 'The Goldman Sachs Group, Inc. Disclosure in HIMALAYA SHIPPING LTD', 'Himalaya Shipping Ltd').eier, 'The Goldman Sachs Group, Inc.');
  assert.equal(parseFlagging('', 'Société Générale : Shareholding Disclosures on BLUENORD ASA', 'BlueNord ASA').eier, 'Société Générale');
  assert.equal(parseFlagging('Please find attached a disclosure on behalf of Bank of America Corporation in respect of Borr Drilling LTD for trade date 21st October 2026.', 'NOTIFICATION OF MAJOR HOLDINGS', 'Borr Drilling Limited').eier, 'Bank of America Corporation');
  const k = parseFlagging('Kistefos AS has increased its holding and now holds 7,02 % of the shares in Axactor ASA.', 'Major shareholding notification', 'Axactor ASA');
  assert.deepEqual([k.eier, k.pst, k.retning], ['Kistefos AS', 7.02, 'opp']);
  assert.equal(parseFlagging('', 'Magnora ASA: Mandatory notification of trade', 'Magnora ASA').eier, null, 'selskapets eget navn er ikke eier');
});

test('selskapsbeskrivelse: bare når meldingen har en', () => {
  assert.equal(about('Ingen beskrivelse her.\n\nContacts\n\nOla'), null);
  assert.match(about('Tekst.\n\nAbout Norconsult\n\nNorconsult is a leading pan-Nordic interdisciplinary consulting firm combining engineering and architecture.\n\nFor further information'), /^Norconsult is a leading/);
});
