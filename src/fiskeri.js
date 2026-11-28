// Hvem eier havbrukstillatelsene og de store fiskefartøyene? Åpne API-er fra Fiskeridirektoratet (NLOD,
// «Kilde: Fiskeridirektoratet»).
// - Akvakulturregisteret (pub-aqua): alle tillatelser med innehaver (organisasjonsnummer) og kapasitet.
// - Fartøyregisteret (vessel-api): fartøy på 28 meter og mer (havfiskeflåten) med eier. Fartøy eid av
//   privatpersoner tas ikke med.
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { getJson, allowHosts } from './http.js';

const AQUA = config.fdirAqua, VESSEL = config.fdirVessel;
allowHosts([AQUA, VESSEL]);
const DAY = 864e5, sleep = ms => new Promise(r => setTimeout(r, ms));
const title = s => String(s || '').toLowerCase().replace(/(^|[\s(\-/])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(As|Asa|Sa|Ans|Da)\b/g, x => x.toUpperCase()).replace(/ Og /g, ' og ').trim();

/** Slår sammen tillatelser per innehaver. */
export function summarizeLicenses(list) {
  const by = new Map();
  for (const l of list) {
    const nr = l.openLegalEntityNr; if (!/^\d{9}$/.test(nr || '')) continue;
    if (l.version?.status && l.version.status !== 'APPROVED') continue;
    const e = by.get(nr) || { nr, navn: title(l.legalEntityName), n: 0, matf: 0, mtb: 0, land: 0, fylker: new Set() };
    e.n++;
    // Matfisk i sjø ligger i et produksjonsområde; landbaserte anlegg har ikke det og regnes for seg
    if (l.type?.tag === 'KOMM-MATF') {
      e.matf++;
      const t = l.capacity?.unit === 'TN' && l.capacity?.type === 'MTK' ? Number(l.capacity.current) || 0 : 0;
      if (l.placement?.prodAreaCode) e.mtb += t; else e.land += t;
    }
    if (l.placement?.countyName) e.fylker.add(title(l.placement.countyName));
    by.set(nr, e);
  }
  return [...by.values()].map(e => ({ ...e, mtb: Math.round(e.mtb), land: Math.round(e.land), fylker: [...e.fylker] })).sort((a, b) => b.mtb - a.mtb || b.land - a.land || b.n - a.n);
}
/** Store fiskefartøy per eier (bare selskaper). */
export function summarizeVessels(list) {
  const by = new Map();
  for (const v of list) for (const o of v.owners || []) {
    if (o.entityType !== 'COMPANY' || !/^\d{9}$/.test(o.id || '')) continue;
    const e = by.get(o.id) || { nr: o.id, navn: title(o.name), fartoy: [] };
    e.fartoy.push([title(v.name), v.length ? Math.round(v.length * 10) / 10 : null, v.buildYear || null, v.registrationMark || '']);
    by.set(o.id, e);
  }
  return [...by.values()].sort((a, b) => b.fartoy.length - a.fartoy.length || a.navn.localeCompare(b.navn, 'nb'));
}

async function pages(fetchPage, max) {
  const out = [];
  for (let i = 0; i < max; i++) { const p = await fetchPage(i); if (!Array.isArray(p)) break; out.push(...p); if (p.length < 100) break; await sleep(config.delayMs); }
  return out;
}

/** Henter begge registrene. Ukentlig cache: tillatelser og eierskap endres sjelden. */
export async function fetchFiskeri({ warnings = [] } = {}) {
  const file = path.join(config.dataDir, 'fiskeri-cache.json');
  let cache = null; try { cache = JSON.parse(await fs.readFile(file, 'utf8')); } catch { }
  if (cache && cache.v === 2 && Date.now() - cache.t < 7 * DAY) return cache.d;
  const d = { ...(cache?.d || {}) };
  try {
    const lic = await pages(i => getJson(`${AQUA}/api/v1/licenses-overview?range=${i * 100}-${i * 100 + 99}`).catch(() => null), 80);
    if (lic.length) d.havbruk = { n: lic.length, eiere: summarizeLicenses(lic).slice(0, 600), hentet: new Date().toISOString(), url: 'https://www.fiskeridir.no/akvakultur/registre-og-skjema/akvakulturregisteret' };
  } catch (e) { warnings.push('Akvakulturregisteret feilet: ' + e.message); }
  try {
    const ves = [];
    for (let p = 1; p <= 10; p++) { const l = await getJson(`${VESSEL}/api/v1/vessels?length_gte=28&per_page=200&page=${p}`).catch(() => null); if (!Array.isArray(l)) break; ves.push(...l); if (l.length < 200) break; await sleep(config.delayMs); }
    if (ves.length) d.fartoy = { n: ves.length, eiere: summarizeVessels(ves), hentet: new Date().toISOString(), url: 'https://www.fiskeridir.no/yrkesfiske/registre-og-skjema/fartoyregisteret' };
  } catch (e) { warnings.push('Fartøyregisteret feilet: ' + e.message); }
  if (!d.havbruk && !d.fartoy) throw new Error('ingen data fra Fiskeridirektoratet');
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(file, JSON.stringify({ v: 2, t: Date.now(), d }));
  return d;
}
