// Nøkkeltall fra Regnskapsregisteret: konsern foretrekkes, året før tas med til sammenligning.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickLatest } from '../src/regnskap.js';

const yr = (aar, type, inn) => ({ regnskapstype: type, regnskapsperiode: { tilDato: `${aar}-12-31` }, valuta: 'USD',
  resultatregnskapResultat: { aarsresultat: inn / 10, driftsresultat: { driftsresultat: inn / 5, driftsinntekter: { sumDriftsinntekter: inn } } },
  egenkapitalGjeld: { egenkapital: { sumEgenkapital: 5 }, gjeldOversikt: { sumGjeld: 3 } }, eiendeler: { sumEiendeler: 8 } });

test('siste regnskap: konsern før selskap, med året før', () => {
  const r = pickLatest([yr(2023, 'KONSERN', 100), yr(2024, 'SELSKAP', 50), yr(2024, 'KONSERN', 120)]);
  assert.deepEqual([r.aar, r.type, r.valuta, r.inn, r.res, r.forrige.aar, r.forrige.inn], [2024, 'konsern', 'USD', 120, 12, 2023, 100]);
  assert.equal(pickLatest([]), null);
  assert.equal(pickLatest([yr(2024, 'SELSKAP', 10), yr(2021, 'SELSKAP', 9)]).forrige, undefined, 'ikke sammenlign med et år som mangler imellom');
});
