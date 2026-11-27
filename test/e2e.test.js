// Ende-til-ende: bygger data mot mock-kildene og tester API-et.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startMock } from './mock.js';

const mock = await startMock();
const base = `http://127.0.0.1:${mock.address().port}`;
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eye-'));
Object.assign(process.env, {
  STORTINGET_API: `${base}/st`, REGISTER_PAGE: `${base}/web/register/`, BRREG_API: `${base}/br`,
  DATA_DIR: dataDir + '/', NEWS_FEEDS: `${base}/rss`, FAKTISK_URL: `${base}/faktisk`, WIKI_NO: `${base}/wiki/no`, WIKI_EN: `${base}/wiki/en`, WIKI_UPLOAD: `${base}/wiki/upload/`, OSLOBORS_API: `${base}/ob`, POLL_URL: `${base}/poll`, WIKIDATA_URL: `${base}/wikidata`, STORTINGET_DELAY_MS: '0', DELAY_MS: '0', CONCURRENCY: '8', REFRESH_HOUR: '-1',
});
const { buildData } = await import('../src/build.js');

let pub;
test('bygg data fra alle kilder', { timeout: 120_000 }, async () => {
  pub = await buildData();
  assert.equal(pub.reps.length, 169);
  assert.deepEqual(pub.sessions, ['2025-2026', '2026-2027']);
  assert.ok(pub.reps.find(r => r.id === 'BÅH').q > 100);
  assert.ok(pub.warnings.some(w => /biografier/.test(w)), 'manglende biografi skal gi advarsel');
  const regCount = pub.reps.filter(r => Object.keys(r.reg).length).length;
  assert.ok(regCount > 120, `registertreff: ${regCount}`);
  assert.ok(pub.trades.length >= 70, `handler: ${pub.trades.length}`);
  assert.ok(pub.cos.length >= 60, `selskaper: ${pub.cos.length}`);
  assert.ok(pub.cos.filter(c => Object.keys(c.roles).length).length >= 30);
  const smite = pub.cos.find(c => c.nr === '913054210');
  assert.deepEqual(smite.roles.MARNIL, ['Daglig leder', 'Styrets leder']);
  assert.equal(Object.keys(pub.partier.partier).length, 9);
  assert.deepEqual(pub.partier.auto.FrP.map(n => n.url), ['https://example.no/a']);
  assert.deepEqual(pub.partier.auto.Sp.map(n => n.url), ['https://example.no/b']);
  assert.equal(pub.partier.auto.H.length, 0, 'gamle saker filtreres bort');
  // voteringer: bare personlige voteringer i behandlede saker
  assert.equal(pub.stemmer.antall, 1);
  const v = pub.stemmer.voteringer[0];
  assert.equal(v.tittel, 'Testsak om skatt'); assert.equal(v.vedtatt, true);
  assert.ok(Object.values(v.pos).every(x => ['F', 'M', 'D', '-'].includes(x)));
  assert.ok(Object.values(pub.stemmer.oppmote).every(a => Array.isArray(a) && a.length === 2));
  // løfter og faktasjekk
  assert.ok(pub.lofter.regjering.lofter.length >= 5);
  assert.ok(pub.faktasjekk.sjekker.some(s => s.u.endsWith('/123') && s.p.includes('FrP')), 'automatisk faktasjekk hentes og knyttes til parti');
});

test('profiler: offisielle bilder, kontrollert Wikipedia-omtale uten fødselsdato', async () => {
  const P = pub.profiler;
  assert.equal(P['gov:JGS'].fotoKilde, 'Stortinget', 'statsråder får Stortingets portrett');
  assert.match(P['rep:MARNIL'].foto, /^img\/rep-marnil-[0-9a-f]{6}\.jpg$/);
  assert.ok(!P['rep:TIM']?.foto, 'ingen bilde når Stortinget svarer 404');
  assert.ok(!P['rep:HSP']?.wiki, 'flertydige Wikipedia-sider brukes ikke');
  assert.match(P['gov:JGS'].wiki.tekst, /norsk politiker/);
  assert.ok(!/1960|25\. august|født/.test(JSON.stringify(P)), 'fødselsdatoer fra Wikipedia publiseres ikke');
  const img = await fs.readdir(path.join(dataDir, 'img'));
  assert.ok(img.some(f => f.startsWith('gov-jgs-')) && img.length === 4, img.join(','));
  // innsidere: bilde og omtale fra Wikipedia når artikkelen nevner yrke og selskap
  assert.equal(pub.innside[0].navn, 'Anders Opedal');
  assert.equal(P['ins:anders-opedal'].fotoKilde, 'Wikimedia Commons');
  assert.match(P['ins:anders-opedal'].wiki.tekst, /konsernsjef i Equinor/);
  assert.equal(pub.flagging.length, 1);
});

test('offentlige data: alt fra registrene, men ingen fødselsdatoer', async () => {
  const raw = await fs.readFile(path.join(dataDir, 'eye.json'), 'utf8');
  assert.ok(!raw.includes('fodselsdato'));
  assert.ok(!raw.includes('1970-01-01'), 'fødselsdato til privatperson skal ikke lekke');
  assert.ok(raw.includes('Nina Bø Egeland'), 'registeret skal gjengis ordrett');
  assert.ok(raw.includes('Thom Erik Gruer'), '§ 15 skal være med');
  const smite = JSON.parse(raw).cos.find(c => c.nr === '913054210');
  assert.ok(smite.personer.some(p => p.navn === 'Privat Person' && p.rolle === 'Styremedlem'), 'alle styremedlemmer vises');
  assert.equal(smite.personer[0].rep, 'MARNIL');
});

test('API: data, søk og enhet', { timeout: 30_000 }, async () => {
  const mod = await import('../src/server.js');
  await mod.loadData();
  const srv = mod.createServer();
  await new Promise(r => srv.listen(0, r));
  const url = `http://127.0.0.1:${srv.address().port}`;
  const d = await fetch(url + '/api/data');
  assert.equal(d.status, 200);
  assert.equal((await d.json()).reps.length, 169);
  const s = await (await fetch(url + '/api/sok?q=smite')).json();
  assert.equal(s.treff[0].nr, '913054210');
  assert.equal(s.treff[0].politikere[0].id, 'MARNIL');
  const e = await (await fetch(url + '/api/enhet/913054210')).json();
  assert.deepEqual(e.politikere[0].roller, ['Daglig leder', 'Styrets leder']);
  assert.equal(e.persons, undefined);
  assert.ok(e.personer.some(p => p.navn === 'Privat Person'));
  assert.ok(!JSON.stringify(e).includes('1970-01-01'));
  const gz = await fetch(url + '/api/data', { headers: { 'accept-encoding': 'gzip' } });
  assert.equal(gz.headers.get('content-encoding'), 'gzip');
  assert.equal((await fetch(url + '/api/enhet/123456789')).status, 400);
  assert.equal((await fetch(url + '/api/sok?q=a')).status, 400);
  const html = await fetch(url + '/');
  assert.match(html.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal((await fetch(url + '/../package.json')).status, 200); // faller tilbake til index.html, ikke filen
  assert.ok(!(await (await fetch(url + '/%2e%2e/package.json')).text()).includes('"dependencies"'));
  srv.close(); mock.close();
});
