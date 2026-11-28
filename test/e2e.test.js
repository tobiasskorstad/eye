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
  DATA_DIR: dataDir + '/', NEWS_FEEDS: `${base}/rss`, FAKTISK_URL: `${base}/faktisk`, FAKTISK_FRONT: `${base}/faktisk-forside`, WIKI_NO: `${base}/wiki/no`, WIKI_EN: `${base}/wiki/en`, WIKI_SV: `${base}/wiki/sv`, WIKI_DA: `${base}/wiki/da`, WIKIDATA_API: `${base}/wd`, COMMONS_FILE: `${base}/commons/`, WIKI_UPLOAD: `${base}/wiki/upload/`, OSLOBORS_API: `${base}/ob`, BRREG_REGNSKAP: `${base}/rr`, SSB_API: `${base}/ssb`, NB_API: `${base}/nb`, POLL_URL: `${base}/poll`, PARTIFIN_URL: `${base}/pf`, FDIR_AQUA: `${base}/aqua`, FDIR_VESSEL: `${base}/vessel`, SSR_API: `${base}/ssr`, DOMMER_API: `${base}/dom`, NBIM_URL: `${base}/nbim`, WIKIDATA_URL: `${base}/wikidata`, STORTINGET_DELAY_MS: '0', WIKIDATA_DELAY_MS: '0', DELAY_MS: '0', CONCURRENCY: '8', REFRESH_HOUR: '-1',
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
  assert.ok(pub.faktasjekk.sjekker.some(s => s.u.endsWith('/123') && s.p.includes('FrP') && s.d === '2026-11-20'), 'automatisk faktasjekk hentes med dato og knyttes til parti');
  assert.equal(pub.faktasjekk.sjekker[0].type, 'artikkel', 'nyeste først, også verifiseringsartikler fra forsiden');
  assert.equal(pub.faktasjekk.nyeste, '2026-11-25');
  assert.ok(!pub.faktasjekk.sjekker.some(s => /Kommentar/.test(s.t)), 'kommentarer tas ikke med');
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
  assert.ok(img.some(f => f.startsWith('gov-jgs-')) && img.length === 5, img.join(','));
  // Wikidata: riktig person valgt (arbeidsgiver Equinor), ikke fotballspilleren med samme navn; bilde via Commons-omdirigering
  const kari = P['ins:kari-testesen'];
  assert.equal(kari.wiki.kilde, 'Wikidata'); assert.match(kari.wiki.tekst, /næringslivsleder.*Equinor/s);
  assert.equal(kari.fotoKilde, 'Wikimedia Commons');
  assert.ok(!/1970/.test(kari.wiki.tekst), 'fødselsår i parentes fjernes');
  // innsidere: bilde og omtale fra Wikipedia når artikkelen nevner yrke og selskap
  assert.deepEqual(pub.innside.map(i => i.navn), ['Anders Opedal', 'Kari Testesen'], 'titler som «Primary Insider» vaskes bort');
  assert.equal(P['ins:anders-opedal'].fotoKilde, 'Wikimedia Commons');
  assert.match(P['ins:anders-opedal'].wiki.tekst, /næringslivsleder/, 'godtatt fordi hele artikkelen nevner selskapet');
  assert.equal(pub.flagging.length, 2);
  // tall i debatten: alle indikatorene, med kilde og sammenligning
  assert.equal(pub.tall.length, 8);
  const led = pub.tall.find(t => t.id === 'ledighet'), rente = pub.tall.find(t => t.id === 'rente');
  assert.deepEqual([led.verdi, led.periode, led.før.verdi], [5.2, 'desember 2026', 4]);
  assert.match(led.url, /ssb\.no\/statbank\/table\/13760/);
  assert.deepEqual([rente.verdi, rente.periode], [4.5, '26. november 2026']);
  // årsregnskap fra Regnskapsregisteret: siste år + året før
  assert.deepEqual([pub.regnskap['913054210'].aar, pub.regnskap['913054210'].inn, pub.regnskap['913054210'].forrige.inn], [2024, 4800000, 4100000]);
  assert.match(pub.aksjer.EQNR.om, /^Equinor is an international energy company/, 'selskapets egen beskrivelse samles per aksje');
  assert.ok(!pub.innside.some(i => 'om' in i), 'beskrivelsen lagres bare én gang per aksje');
  // alle aksjeselskaper på børsen, også uten innsidehandel; obligasjonsutstedere (Nordic ABM) tas ikke med
  assert.equal(pub.aksjer.YAR?.notert, true, 'Yara skal med selv uten nylige innsidehandler');
  assert.equal(pub.aksjer.TVEKST?.marked, 'Euronext Growth');
  assert.match(pub.aksjer.TVEKST.om, /^Testvekst AS develops software/);
  assert.ok(!pub.aksjer.OBFIN, 'rene obligasjonsutstedere skal ikke med');
  // penger til partiene: organisasjoner med navn, privatpersoner bare som sum
  assert.equal(pub.partifin.partier.A.aar[2025].sum, 21050000);
  assert.equal(pub.partifin.partier.A.aar[2025].privN, 1);
  assert.deepEqual(pub.partifin.givere.map(g => g.navn), ['Landsorganisasjonen i Norge', 'Smite AS']);
  assert.ok(!JSON.stringify(pub.partifin).includes('Ola Privat'), 'navn på private givere skal ikke publiseres');
  // biografi og godtgjøring
  assert.ok(Object.keys(pub.bio).length > 0 && Object.values(pub.bio).every(b => Array.isArray(b.uy) && Array.isArray(b.verv)));
  assert.ok(pub.godtgjoring.representant > 1e6);
  // havbruk, havfiskeflåten og shortsalg
  assert.deepEqual(pub.fiskeri.havbruk.eiere[0], { nr: '913054210', navn: 'Smite AS', n: 2, matf: 2, mtb: 1560, land: 0, fylker: ['Nordland', 'Troms'] });
  assert.equal(pub.fiskeri.fartoy.eiere.length, 1, 'fartøy eid av privatpersoner tas ikke med');
  assert.ok(!JSON.stringify(pub.fiskeri).includes('Ola Fisker'));
  assert.equal(pub.short.liste[0].pst, 0.8);
  // dommernes sidegjøremål: investeringer med org.nr., men ikke navn på private parter
  const dom = pub.dommere.liste[0];
  assert.deepEqual([dom.navn, dom.tittel, dom.domstol, dom.inv[0].nr], ['Kari Dommer', 'tingrettsdommer', 'Oslo tingrett', '923609016']);
  assert.ok(!JSON.stringify(pub.dommere).includes('Per Privatpart'));
  // oljefondet
  assert.equal(pub.oljefondet.beholdning.dato, '2026-06-30', 'nyeste rapportering');
  assert.equal(pub.oljefondet.beholdning.aksjer[0][0], 'Apple Inc');
  assert.deepEqual(pub.oljefondet.historikk.verdi.slice(-1)[0], [2025, 21000]);
  assert.equal(pub.oljefondet.utelukket[0].dato, '2016-04-14');
  assert.equal(pub.oljefondet.budsjett.bruk, 608.4);
  assert.deepEqual(pub.short.liste[0].eiere, [['Test Capital LP', 0.8, '2026-11-20']]);
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
