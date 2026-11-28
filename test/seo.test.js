import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildStatic } from '../tools/seo.js';

test('statiske sider: profiler, sitemap, ingen private personer', async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'seo-'));
  const data = {
    hentet: '2026-11-28T10:00:00Z', regDato: '2026-11-13', parti: { H: 'Høyre' }, kom: {},
    reps: [{ id: 'ABC', navn: 'Åse Ødegård', parti: 'H', fylke: 'Oslo', kom: [], fodt: 1970, reg: { 2: 'Styreleder i Test AS' } }],
    trades: [{ rep: 'ABC', d: '2026-11-01', k: 'K', sel: 'Equinor', ant: 10, ver: 3000 }],
    pep: { regjering: [{ id: 'X', navn: 'Ola Statsråd', tittel: 'Finansminister', dep: 'FIN', parti: 'H' }] },
    cos: [{ nr: '123456789', navn: 'Test AS', roles: { ABC: ['Styrets leder'] } }],
    aksjer: { EQNR: { tick: 'EQNR', navn: 'Equinor ASA', notert: true, marked: 'Oslo Børs' } },
    innside: [{ sel: 'Equinor ASA', navn: 'Per Privat Innsider', k: 'K' }],
    flagging: [{ sel: 'Equinor ASA', tick: 'EQNR', eier: 'Kari Privat', pst: 5 }, { sel: 'Equinor ASA', tick: 'EQNR', eier: 'Folketrygdfondet', pst: 5.1 }],
    dommere: { liste: [{ id: 7, navn: 'Kari Dommer', tittel: 'tingrettsdommer', domstol: 'Oslo tingrett', inv: [{ navn: 'Equinor' }] }] },
  };
  const { lenker, antall } = await buildStatic({ data, out, site: 'https://eks.no/eye', csp: "default-src 'none'", cssName: 'app.css', favicon: '', kontakt: { rettelser: [{ d: '2026-11-28', tekst: 'Rettet noe' }] } });
  assert.equal(lenker['#rep-ABC'], 'stortinget/ase-odegard/');
  assert.equal(lenker['#org-123456789'], 'selskap/123456789/');
  assert.ok(antall >= 8);
  const rep = await fs.readFile(path.join(out, 'stortinget/ase-odegard/index.html'), 'utf8');
  assert.match(rep, /<link rel="canonical" href="https:\/\/eks.no\/eye\/stortinget\/ase-odegard\/">/);
  assert.match(rep, /og:image/); assert.match(rep, /Styreleder i Test AS/); assert.ok(!rep.includes('1970'), 'ingen fødselsår');
  const st = await fs.readFile(path.join(out, 'aksjer/equinor-asa/index.html'), 'utf8');
  assert.ok(st.includes('Folketrygdfondet')); assert.ok(!st.includes('Kari Privat'), 'private eiere vises ikke'); assert.ok(!st.includes('Per Privat Innsider'), 'innsidere vises ikke');
  const sm = await fs.readFile(path.join(out, 'sitemap.xml'), 'utf8');
  assert.match(sm, /<loc>https:\/\/eks\.no\/eye\/dommere\/kari-dommer-7\/<\/loc>/);
  assert.ok((await fs.readFile(path.join(out, 'rettelser/index.html'), 'utf8')).includes('Rettet noe'));
  assert.ok(!(await fs.readdir(out)).includes('person'), 'ingen sider for innsidere');
});
