// Sikkerhetstester: XSS-vern i klienten, stiangrep og hoder på serveren, personvernsperre i publisering.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from '../src/server.js';

const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('klient: ingen lenker fra data uten url()-filter, ingen eval', () => {
  assert.equal(/href="\$\{esc\(/.test(app), false, 'lenker må gå gjennom url()');
  assert.equal(/\beval\(|new Function\(|document\.write/.test(app), false);
  const url = new Function(app.match(/const esc = .*;/)[0] + app.match(/const url = .*;/)[0] + 'return url;')();
  assert.equal(url('javascript:alert(1)'), '#');
  assert.equal(url('data:text/html,x'), '#');
  assert.equal(url(' JaVaScRiPt:alert(1)'), '#');
  assert.equal(url('https://www.nrk.no/a?b="c"'), 'https://www.nrk.no/a?b=%22c%22');
});

test('server: stiangrep, hoder, metoder', async () => {
  const srv = createServer().listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    for (const p of ['/../src/config.js', '/%2e%2e/package.json', '/..%2fsrc%2fserver.js', '/.env', '/.git/config', '/%00']) {
      const r = await fetch(base + p); const t = await r.text();
      assert.ok(t.includes('<!doctype html') || t.includes('<!DOCTYPE html'), p + ' skal gi forsiden');
      assert.ok(!t.includes('process.env'), p);
    }
    const r = await fetch(base + '/');
    for (const h of ['content-security-policy', 'x-content-type-options', 'x-frame-options', 'strict-transport-security', 'referrer-policy']) assert.ok(r.headers.get(h), h);
    assert.match(r.headers.get('content-security-policy'), /default-src 'none'/);
    assert.equal((await fetch(base + '/api/status', { method: 'POST' })).status, 405);
    assert.equal((await fetch(base + '/x'.repeat(1100))).status, 414);
    assert.equal((await fetch(base + '/api/enhet/123456789')).status, 400, 'ugyldig orgnr avvises før Brreg-kall');
    assert.equal((await fetch(base + '/api/status')).headers.get('x-content-type-options'), 'nosniff');
  } finally { srv.close(); }
});

test('publisering: stopper fødselsdatoer og ufullstendige data', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eye-')), f = path.join(dir, 'd.json');
  const reps = Array.from({ length: 169 }, (_, i) => ({ id: 'R' + i, navn: 'X', parti: 'A', fodt: 1980 }));
  const run = d => { fs.writeFileSync(f, JSON.stringify(d)); try { execFileSync('node', ['tools/pages.js', f, path.join(dir, 's')], { stdio: 'pipe' }); return true; } catch { return false; } };
  assert.equal(run({ reps }), true);
  assert.equal(run({ reps: reps.slice(0, 10) }), false);
  assert.equal(run({ reps: [...reps.slice(1), { ...reps[0], fodselsdato: '1980-01-01' }] }), false);
  assert.equal(run({ reps: [...reps.slice(1), { ...reps[0], fodt: '01.01.1980' }] }), false);
});

test('server henter bare fra kjente kilder (SSRF-vern)', async () => {
  const { checkUrl } = await import('../src/http.js');
  for (const u of ['http://169.254.169.254/latest/meta-data/', 'file:///etc/passwd', 'https://evil.example/', 'http://data.brreg.no/x', 'gopher://data.brreg.no/'])
    assert.throws(() => checkUrl(u), u);
  assert.ok(checkUrl('https://data.brreg.no/enhetsregisteret/api/enheter/923609016'));
});

test('RSS-tekst: tagger fjernes, ingen dobbel dekoding', async () => {
  const { parseRss } = await import('../src/news.js');
  const [i] = parseRss('<rss><channel><title>T</title><item><title><![CDATA[<scr<script>ipt>x</script> &amp;lt;b&amp;gt; Ap]]></title><link>https://www.nrk.no/a</link></item></channel></rss>', 'x');
  assert.equal(/[<>]/.test(i.tittel), false);
  assert.match(i.tittel, /&lt;b&gt;/, '&amp;lt; skal bli &lt;, ikke <');
});
