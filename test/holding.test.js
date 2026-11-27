// Eierandeler lest fra fritekst i § 9 i interesseregisteret (samme funksjon som i public/app.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const holdingFor = new Function(src.match(/function holdingFor[\s\S]*?\n}\n/)[0] + 'return holdingFor;')();

test('eierandel per selskap fra fritekst', () => {
  const t1 = 'Torghatten Aqua AS: 300 aksjer Stack By Me AS: 4 500 aksjer Lildog AS: 50 000 aksjer Nordic Semiconductor: 6000 aksjer';
  assert.equal(holdingFor(t1, 'Stack By Me AS'), '4 500 aksjer'.replace(' ', ' '));
  assert.equal(holdingFor(t1, 'Lildog AS'), '50 000 aksjer');
  assert.equal(holdingFor('Eier selskapet Smite AS 100% Eier privat aksjer i: Vend', 'Smite AS'), '100 %');
  assert.equal(holdingFor('132 aksjer i Telenor ASA.', 'Telenor ASA'), '132 aksjer');
  assert.equal(holdingFor('Eier 8 % av aksjene i dansekompaniet Kartellet AS', 'Kartellet AS'), '8 %');
  assert.equal(holdingFor('Orinor AS (0,076 %)', 'Orinor AS'), '0,076 %');
  assert.equal(holdingFor('Øre Vilt SA - 1 andel', 'Øre Vilt SA'), '1 andel');
  assert.equal(holdingFor('Klassekampen AS: 1 aksje', 'Klassekampen AS'), '1 aksje');
  assert.equal(holdingFor('Styreleder i Nielsenkaia AS', 'Nielsenkaia AS'), null, 'ingen tall – ingen gjetning');
  assert.equal(holdingFor('Annet selskap: 50 aksjer', 'Lildog AS'), null);
});
