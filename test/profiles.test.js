// Bilder og Wikipedia-omtale: riktig person, ingen fødselsdatoer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { accept, stripBirth, slug, profilePeople, mentions } from '../src/profiles.js';

test('fødselsdatoer fjernes fra Wikipedia-tekst', () => {
  assert.equal(stripBirth('Jonas Gahr Støre (født 25. august 1960 i Oslo) er en norsk politiker.'), 'Jonas Gahr Støre er en norsk politiker.');
  assert.equal(stripBirth('Kari Nordmann, født 3. mai 1970 i Bergen, er styreleder.'), 'Kari Nordmann er styreleder.');
  assert.equal(stripBirth('John Doe (born March 3, 1965) is an American businessman.'), 'John Doe is an American businessman.');
  assert.equal(stripBirth('Hun ble utnevnt 14. oktober 2021.'), 'Hun ble utnevnt 2021.');
});

test('Wikipedia-sider godtas bare for riktig person', () => {
  const pg = (extract, description = '') => ({ title: 'X', extract, description });
  assert.ok(accept(pg('Anders Opedal er en norsk ingeniør og konsernsjef i Equinor.'), { kind: 'biz', sel: 'Equinor ASA' }, 'no'));
  assert.ok(!accept(pg('Anders Opedal er en norsk fotballspiller.'), { kind: 'biz', sel: 'Equinor ASA' }, 'no'), 'feil yrke');
  assert.equal(accept(pg('Ola Hansen er konsernsjef i Telenor.'), { kind: 'biz', sel: 'Equinor ASA' }, 'no'), 'sjekk', 'selskapet må finnes et sted i artikkelen');
  assert.ok(accept(pg('Jane Roe is a British businesswoman and chief executive of Frontline.'), { kind: 'biz', sel: 'Frontline plc' }, 'en'));
  assert.ok(accept(pg('Per Olsen er en norsk politiker fra Høyre.'), { kind: 'pol', parti: 'Høyre' }, 'no'));
  assert.ok(!accept(pg('Per Olsen er en norsk skuespiller.'), { kind: 'pol', parti: 'Høyre' }, 'no'));
  assert.ok(!accept({ ...pg('Per Olsen kan vise til flere personer, blant annet politiker.'), pageprops: { disambiguation: '' } }, { kind: 'pol' }, 'no'), 'pekersider brukes ikke');
  assert.ok(!accept({ title: 'X', missing: true }, { kind: 'pol' }, 'no'));
});

test('personer: representanter, statsråder, partiledere og innsidere, uten dubletter', () => {
  const list = profilePeople([{ id: 'JGS', navn: 'Jonas Gahr Støre', parti: 'A' }], { regjering: [{ id: 'JGS', navn: 'Jonas Gahr Støre', parti: 'A' }] },
    [{ navn: 'Kjell Inge Røkke', sel: 'Aker ASA' }, { navn: 'Kjell Inge Røkke', sel: 'Aker BP ASA' }], { partier: { A: { leder: 'Jonas Gahr Støre' }, H: { leder: 'Ine Eriksen Søreide' } } });
  assert.deepEqual(list.map(p => p.key), ['rep:JGS', 'gov:JGS', 'leder:H', 'ins:kjell-inge-rokke']);
  assert.equal(slug('ins:Kjell Inge Røkke'), 'ins-kjell-inge-rokke');
});

test('innsidernavn uten titler', async () => {
  const { who, cleanName } = await import('../src/insider.js');
  assert.equal(cleanName('Primary Insider Vegard Wollan'), 'Vegard Wollan');
  assert.equal(cleanName('Mr. Artem Volynets'), 'Artem Volynets');
  assert.equal(who('Mr. Artem Volynets, Chairman of the Board, has bought shares').navn, 'Artem Volynets');
});

test('selskapsnavn: hele navnet eller et særpreget ord, aldri bare «Norwegian»', () => {
  assert.ok(!mentions('Norwegian Minister of Health and Care Services', 'Norwegian Block Exchange AS'));
  assert.ok(mentions('styremedlem i Norwegian Block Exchange', 'Norwegian Block Exchange AS'));
  assert.ok(mentions('Equinor', 'Equinor ASA'));
  assert.ok(mentions('konsernsjef i Equinor siden 2020', 'Equinor ASA'));
  assert.ok(mentions('chairperson of Arendals Fossekompani', 'Arendals Fossekompani ASA'));
  assert.ok(!mentions('Nordic Mining', 'Nordic Semiconductor ASA'));
  assert.ok(!mentions('Equinoxe Holding', 'Equinor ASA'), 'hele ord, ikke delstrenger');
});
