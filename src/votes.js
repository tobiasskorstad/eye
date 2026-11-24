// Voteringer i Stortinget: hva partiene faktisk stemmer, og oppmøte per representant.
// Stortingets API har kvote på antall kall, så vi henter sakte og cacher resultater på disk (voteringer endres ikke).
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { getJson } from './http.js';
import { parseMsDate, isoDateOslo } from './stortinget.js';

const api = p => `${config.stortingetApi}/${p}${p.includes('?') ? '&' : '?'}format=json`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const VOTE = { 1: 'borte', 2: 'for', 3: 'mot' }; // koder i voteringsresultat (verifisert mot antall_for/mot på 100 voteringer)

let failures = 0; // mange feil på rad: gi opp for denne natten og bruk cache
async function slowGet(url) {
  if (failures >= 5) return null;
  for (let i = 0; i < 4; i++) {
    const d = await getJson(url).catch(() => null);
    if (!d || (d.feilmelding && /grensen/i.test(d.feilmelding))) { await sleep(20000 * (i + 1)); continue; } // kvote nådd eller feil: vent og prøv igjen
    await sleep(config.stortingetDelayMs);
    failures = 0;
    return d;
  }
  failures++;
  return null;
}

/** Henter personlige voteringer i periodens sesjoner. `max` begrenser hvor mange nye resultater som hentes per kjøring. */
export async function fetchVotes(sessions, max = 150) {
  const cacheFile = path.join(config.dataDir, 'votes-cache.json');
  let cache = {};
  try { cache = JSON.parse(await fs.readFile(cacheFile, 'utf8')); } catch { }

  const diag = {};
  let saker = [];
  for (const s of sessions) {
    const d = await slowGet(api(`saker?sesjonid=${encodeURIComponent(s)}`));
    for (const x of d?.saker_liste || []) if (x.status === 1) saker.push(x); // 1 = behandlet
  }
  // Fikk vi ingen saker (kvote/feil), bruk sakene vi allerede har i cachen.
  if (!saker.length) saker = Object.values(cache.saker || {});
  cache.saker = Object.fromEntries([...Object.values(cache.saker || {}), ...saker].map(x => [x.id, { id: x.id, status: 1, korttittel: x.korttittel, tittel: x.tittel, sist_oppdatert_dato: x.sist_oppdatert_dato }]));
  diag.saker = saker.length;
  const newest = saker.sort((a, b) => (parseMsDate(b.sist_oppdatert_dato) || 0) - (parseMsDate(a.sist_oppdatert_dato) || 0)).slice(0, 250);
  const votes = [];
  for (const s of newest) {
    const v = cache[`sak:${s.id}`] || (await slowGet(api(`voteringer?sakid=${s.id}`)))?.sak_votering_liste || [];
    cache[`sak:${s.id}`] = v.filter(x => x.personlig_votering).map(x => ({ id: x.votering_id, tid: x.votering_tid, tema: x.votering_tema, vedtatt: x.vedtatt, for: x.antall_for, mot: x.antall_mot, borte: x.antall_ikke_tilstede }));
    for (const x of cache[`sak:${s.id}`]) votes.push({ ...x, sak: s.id, tittel: s.korttittel || s.tittel });
  }
  diag.voteringer = votes.length;
  votes.sort((a, b) => (parseMsDate(b.tid) || 0) - (parseMsDate(a.tid) || 0));
  let fetched = 0;
  for (const v of votes) {
    if (cache[`v:${v.id}`] || fetched >= max) continue;
    const r = await slowGet(api(`voteringsresultat?voteringid=${v.id}`));
    if (r?.voteringsresultat_liste) {
      cache[`v:${v.id}`] = r.voteringsresultat_liste.map(x => [x.representant?.id, x.representant?.parti?.id, VOTE[x.votering] || '?']);
      fetched++;
    }
  }
  diag.nye = fetched;
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify(cache));
  return { ...summarize(votes.filter(v => cache[`v:${v.id}`]).map(v => ({ ...v, res: cache[`v:${v.id}`] }))), diag };
}

/** Partienes standpunkt per votering, enighet mellom partier og oppmøte per representant. */
export function summarize(votes) {
  const parties = new Set(), att = {};
  const list = votes.map(v => {
    const by = {};
    for (const [rep, p, val] of v.res) {
      if (!rep) continue;
      parties.add(p);
      (by[p] ||= { for: 0, mot: 0, borte: 0 })[val in { for: 1, mot: 1, borte: 1 } ? val : 'borte']++;
      const a = (att[rep] ||= { n: 0, borte: 0 }); a.n++; if (val === 'borte') a.borte++;
    }
    const pos = {};
    for (const [p, c] of Object.entries(by)) pos[p] = c.for && !c.mot ? 'F' : c.mot && !c.for ? 'M' : c.for || c.mot ? 'D' : '-';
    return { d: isoDateOslo(parseMsDate(v.tid)), sak: v.sak, tittel: v.tittel, tema: v.tema, vedtatt: !!v.vedtatt, for: v.for, mot: v.mot, borte: v.borte, pos };
  });
  const P = [...parties].filter(Boolean);
  const enighet = {};
  for (const a of P) for (const b of P) {
    let same = 0, n = 0;
    for (const v of list) { const x = v.pos[a], y = v.pos[b]; if ((x === 'F' || x === 'M') && (y === 'F' || y === 'M')) { n++; if (x === y) same++; } }
    (enighet[a] ||= {})[b] = n ? Math.round(100 * same / n) : null;
  }
  return { antall: list.length, fra: list.at(-1)?.d || '', til: list[0]?.d || '', voteringer: list, enighet, oppmote: att };
}
