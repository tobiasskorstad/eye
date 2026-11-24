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
