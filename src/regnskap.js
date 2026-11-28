// Årsregnskap fra Regnskapsregisteret (Brønnøysundregistrene), åpent API uten nøkkel.
// Hentes i bygget fordi API-et ikke tillater kall direkte fra nettlesere (CORS). Regnskap endres én gang i året,
// så hvert selskap slås opp på nytt bare én gang i uken.
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { getJson, allowHosts } from './http.js';

const API = config.brregRegnskap;
allowHosts([API]);
const WEEK = 7 * 864e5;
const n = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));

/** Gjør ett regnskap (ett år) om til nøkkeltall. */
export function keyFigures(r) {
  const res = r?.resultatregnskapResultat || {}, ekg = r?.egenkapitalGjeld || {}, ei = r?.eiendeler || {};
  return {
    aar: Number(String(r?.regnskapsperiode?.tilDato || '').slice(0, 4)) || null,
    type: r?.regnskapstype === 'KONSERN' ? 'konsern' : 'selskap',
    valuta: r?.valuta || 'NOK',
    inn: n(res.driftsresultat?.driftsinntekter?.sumDriftsinntekter),
    drift: n(res.driftsresultat?.driftsresultat),
    res: n(res.aarsresultat),
    ek: n(ekg.egenkapital?.sumEgenkapital),
    gjeld: n(ekg.gjeldOversikt?.sumGjeld),
    eiend: n(ei.sumEiendeler),
    revidert: r?.revisjon ? !r.revisjon.ikkeRevidertAarsregnskap && !r.revisjon.fravalgRevisjon : null,
  };
}

/**
 * Siste årsregnskap (konsern hvis selskapet har det, ellers selskapet), pluss året før til sammenligning.
 * Returnerer null hvis selskapet ikke har levert regnskap.
 */
export function pickLatest(list) {
  const all = (Array.isArray(list) ? list : []).filter(r => !r.avviklingsregnskap).map(keyFigures).filter(k => k.aar);
  if (!all.length) return null;
  const type = all.some(k => k.type === 'konsern') ? 'konsern' : 'selskap';
  const same = all.filter(k => k.type === type).sort((a, b) => b.aar - a.aar);
  const [siste, forrige] = same;
  return { ...siste, ...(forrige && forrige.aar === siste.aar - 1 ? { forrige: { aar: forrige.aar, inn: forrige.inn, res: forrige.res, drift: forrige.drift } } : {}) };
}

/** Henter regnskap for alle organisasjonsnumrene (med ukentlig cache). */
export async function fetchRegnskap(nrs, { warnings = [], delayMs = 150 } = {}) {
  const file = path.join(config.dataDir, 'regnskap-cache.json');
  let cache = {}; try { cache = JSON.parse(await fs.readFile(file, 'utf8')); } catch { }
  const now = Date.now(), out = {};
  // Enkelte selskaper gir feil (HTTP 500) hos Regnskapsregisteret. De hoppes over i en uke; vi gir bare opp
  // hvis mange kall på rad feiler (da er det API-et som er nede).
  let fails = 0, inRow = 0;
  for (const nr of [...new Set(nrs)].filter(x => /^\d{9}$/.test(x))) {
    if (!cache[nr] || now - cache[nr].t > WEEK) {
      try {
        const d = await getJson(`${API}/regnskap/${nr}`, { accept: 'application/json' });
        cache[nr] = { t: now, r: pickLatest(d) }; inRow = 0;
      } catch (e) {
        fails++; inRow++;
        if (cache[nr]) cache[nr].t = now; else cache[nr] = { t: now, r: null };
        if (inRow >= 10) { warnings.push(`Regnskapsregisteret svarte ikke (${fails} feil): ${e.message}`); break; }
      }
      await new Promise(r => setTimeout(r, delayMs));
    }
    if (cache[nr]?.r) out[nr] = cache[nr].r;
  }
  if (fails && inRow < 10) warnings.push(`Regnskapsregisteret: ${fails} selskaper ga feil og prøves igjen om en uke`);
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(file, JSON.stringify(cache));
  return out;
}
