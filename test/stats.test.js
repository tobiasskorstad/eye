// Perioder fra SSB og Norges Bank skrives som vanlig norsk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { periode } from '../src/stats.js';

test('periodenavn', () => {
  assert.equal(periode('2026M10'), 'oktober 2026');
  assert.equal(periode('2026K3'), '3. kvartal 2026');
  assert.equal(periode('2025'), '2025');
  assert.equal(periode('2026-11-26'), '26. november 2026');
});
