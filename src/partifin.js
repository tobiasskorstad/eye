// Bidrag til de politiske partiene fra partifinansiering.no (Kommunal- og distriktsdepartementet / SSB).
// Partiloven krever at bidrag over en viss grense offentliggjøres med navn på giveren.
//
// Personvern: bidrag fra privatpersoner viser politisk tilhørighet (særlig kategori etter GDPR art. 9). Vi viser derfor
// bare navn på juridiske givere (selskaper, fagforeninger, organisasjoner). Privatpersoner telles og summeres, men
// navnene publiseres ikke – de står fortsatt hos partifinansiering.no for den som vil se.
// Skillet: partifinansiering.no oppgir full adresse med postnummer for organisasjoner og bare kommune for privatpersoner.
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { getJson, allowHosts } from './http.js';

const BASE = config.partifinUrl;
allowHosts([BASE]);
const DAY = 864e5;

// Partiets kode på partifinansiering.no → partikoden Stortinget bruker
export const PARTIES = { A: 'A', FRP: 'FrP', H: 'H', SV: 'SV', SP: 'Sp', 'RØDT': 'R', MDG: 'MDG', KRF: 'KrF', V: 'V' };

/** Er giveren en organisasjon (adresse med postnummer) eller en privatperson (bare kommune)? */
export const isOrg = x => /\b\d{4}\b/.test(String(x?.address || ''));

const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
const key = s => clean(s).toLowerCase().replace(/[.,]/g, '').replace(/\b(as|asa|sa)$/, '').trim();

/**
 * Slår sammen rader fra partifinansiering.no til én oversikt per parti og år.
 * rows: [{ parti: 'A', aar: 2025, kilde: 'valgår'|'år', ... rå felt }]
 */
export function summarize(rows) {
  const partier = {}, givere = new Map();
  for (const r of rows) {
    const p = partier[r.parti] ||= { aar: {}, givere: {} };
    const y = p.aar[r.aar] ||= { sum: 0, n: 0, org: 0, orgN: 0, priv: 0, privN: 0, sentral: 0 };
    const sum = Math.round(Number(r.sum) || 0); if (!sum) continue;
    y.sum += sum; y.n++;
    if (/sentral/i.test(r.partyUnit || '')) y.sentral += sum;
    if (isOrg(r)) {
      y.org += sum; y.orgN++;
      const k = key(r.donator); if (!k) continue;
      const g = givere.get(k) || { navn: clean(r.donator), sum: 0, n: 0, partier: {}, aar: {}, siste: '' };
      g.sum += sum; g.n++; g.partier[r.parti] = (g.partier[r.parti] || 0) + sum; g.aar[r.aar] = (g.aar[r.aar] || 0) + sum;
      if ((r.received || '') > g.siste) g.siste = r.received;
      givere.set(k, g);
      p.givere[k] = (p.givere[k] || 0) + sum;
    } else { y.priv += sum; y.privN++; }
  }
  // Per parti: de største organisasjonsgiverne
  for (const p of Object.values(partier)) {
    p.topp = Object.entries(p.givere).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, sum]) => ({ navn: givere.get(k).navn, sum }));
    delete p.givere;
  }
  const alle = [...givere.values()].sort((a, b) => b.sum - a.sum);
  return { partier, givere: alle.slice(0, 400) };
}

/**
 * Henter bidrag for de siste årene. For hvert år brukes årsoversikten hvis den finnes (komplett),
 * ellers «bidrag i valgår» (fortløpende i valgår). Cache i ett døgn.
 */
export async function fetchPartifin({ years, warnings = [] } = {}) {
  const file = path.join(config.dataDir, 'partifin-cache.json');
  let cache = null; try { cache = JSON.parse(await fs.readFile(file, 'utf8')); } catch { }
  if (cache && Date.now() - cache.t < DAY) return cache.d;
  const now = new Date().getFullYear();
  years ||= [now - 4, now - 3, now - 2, now - 1, now];
  const rows = [], brukt = {};
  for (const y of years) {
    for (const [kilde, side] of [['år', 'arlige-bidrag'], ['valgår', 'bidrag-i-valgar']]) {
      let got = 0;
      for (const [kode, parti] of Object.entries(PARTIES)) {
        const u = `${BASE}/nb/${side}/Json?year=${y}&name=&centralPartyListCode=${encodeURIComponent(kode)}&partyLevelId=-1&countyId=-1&municipalityId=-1`;
        const list = await getJson(u).catch(e => { warnings.push('Partifinansiering: ' + e.message); return null; });
        for (const r of Array.isArray(list) ? list : []) { rows.push({ ...r, parti, aar: y }); got++; }
      }
      if (got) { brukt[y] = kilde; break; } // årsoversikten er komplett; valgårslisten brukes bare når den mangler
    }
  }
  if (!rows.length) { if (cache) return cache.d; throw new Error('fant ingen bidrag'); }
  const d = { ...summarize(rows), aar: Object.keys(brukt).map(Number).sort(), kilder: brukt, url: `${BASE}/`, hentet: new Date().toISOString() };
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(file, JSON.stringify({ t: Date.now(), d }));
  return d;
}
