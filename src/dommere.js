// Dommernes sidegjøremål: verv, investeringer og annet arbeid ved siden av dommerjobben.
// Registeret er offentlig etter domstolloven kapittel 6A og føres av Domstoladministrasjonen (sidegjoremal.domstol.no).
// Vi henter det samme som nettstedets eget søk viser. Navn på private oppdragsgivere (f.eks. parter i voldgift) og
// dommerforsikringer tas ikke med.
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { getJson, allowHosts } from './http.js';

const API = config.dommerApi;
allowHosts([API]);
const DAY = 864e5, sleep = ms => new Promise(r => setTimeout(r, ms));
const t = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const d10 = s => (s ? String(s).slice(0, 10) : null);
const nr = s => (/^\d{9}$/.test(String(s || '').replace(/\s/g, '')) ? String(s).replace(/\s/g, '') : null);

/** Gjør om rådata for én dommer til kompakt form (aktive sidegjøremål først). */
export function compactJudge(raw) {
  const aktiv = x => !x.opphorsdato;
  const inv = (raw.investering || []).map(x => ({ navn: t(x.selskapetsNavn), nr: nr(x.organisasjonsnummer), type: t(x.selskapsTypeNavn), slutt: d10(x.opphorsdato) })).filter(x => x.navn);
  const selskap = (raw.selskapsverv || []).map(x => ({ navn: t(x.selskapsNavn), nr: nr(x.organisasjonsnummer), verv: t(x.selskapsVervTypeNavn), fra: d10(x.førstValgtDato), betalt: !!x.godtgjoring, slutt: d10(x.opphorsdato) })).filter(x => x.navn);
  const forening = (raw.foreningsverv || []).map(x => ({ navn: t(x.organisasjonsnavn), nr: nr(x.organisasjonsnummer), verv: t(x.foreningsVervTypeNavn), type: t(x.foreningsTypeNavn), fra: d10(x.førstValgtDato), betalt: !!x.godtgjoring, slutt: d10(x.opphorsdato) })).filter(x => x.navn);
  const offentlig = (raw.representantskap || []).map(x => ({ navn: t(x.organNavn), verv: t(x.representantskapValgtSomTypeNavn), type: t(x.representantskapTypeNavn), dep: t(x.departementNavn), fra: d10(x.førstValgtDato), betalt: !!x.godtgjoring, slutt: d10(x.opphorsdato) })).filter(x => x.navn);
  // Annen virksomhet: bare første oppdragsgiver (det andre feltet kan inneholde navn på private parter)
  const virksomhet = (raw.virksomhet || []).map(x => ({ type: t(x.virksomhetTypeNavn), for: t(x.oppdragsgiver1 || x.institusjonsnavn || x.ikkeJuridiskVervBeskrivelse), betalt: !!x.godtgjoring, slutt: d10(x.opphorsdato) })).filter(x => x.type || x.for);
  // Politiske verv: feltnavnene varierer, så vi tar med tekstfeltene som beskriver vervet
  const politisk = (raw.politiskverv || []).map(x => ({ tekst: Object.entries(x).filter(([k, v]) => typeof v === 'string' && /navn$|verv|organ|parti/i.test(k) && !/dommer/i.test(k)).map(([, v]) => t(v)).filter(Boolean).join(', '), slutt: d10(x.opphorsdato) })).filter(x => x.tekst);
  const st = raw.stilling ? { arbeidsgiver: t(raw.stilling.arbeidsgiverNavn), tittel: t(raw.stilling.stillingsTittel) } : null;
  const sort = l => l.sort((a, b) => (aktiv(a) === aktiv(b) ? 0 : aktiv(a) ? -1 : 1));
  return { inv: sort(inv), selskap: sort(selskap), forening: sort(forening), offentlig: sort(offentlig), virksomhet: sort(virksomhet), politisk: sort(politisk), stilling: st && (st.arbeidsgiver || st.tittel) ? st : null };
}

/**
 * Henter dommerlisten og sidegjøremål. Hver dommer friskes opp hver 14. dag; maks `perBuild` per bygg,
 * så hele registeret leses i løpet av et døgn uten å belaste tjenesten.
 */
export async function fetchJudges({ warnings = [], perBuild = 150 } = {}) {
  const file = path.join(config.dataDir, 'dommere-cache.json');
  let cache = { judges: {} }; try { cache = JSON.parse(await fs.readFile(file, 'utf8')); } catch { }
  const now = Date.now();
  if (!cache.liste || now - (cache.listeT || 0) > DAY) {
    const all = new Map();
    for (const q of ['a', 'e', 'i', 'o', 'u', 'y', 'æ', 'ø', 'å']) {
      const r = await getJson(`${API}/api/dommer/search?searchTerm=${encodeURIComponent(q)}&pageSize=2000&currentPage=1&sortTerm=etternavn&sortAscending=true`).catch(() => null);
      for (const x of r?.dommere || []) all.set(x.id, x);
      await sleep(config.delayMs);
    }
    if (all.size >= (cache.liste?.length || 0) * 0.8 && all.size) Object.assign(cache, { liste: [...all.values()], listeT: now });
    else warnings.push(`Dommerregisteret ga bare ${all.size} dommere – bruker forrige liste`);
    try { cache.domstol = Object.fromEntries((await getJson(`${API}/api/domstol`)).map(x => [x.id, t(x.domstolNavn)])); } catch { }
    try { cache.tittel = Object.fromEntries((await getJson(`${API}/api/tittel`)).map(x => [x.id, t(x.navn)])); } catch { }
  }
  const ids = new Set((cache.liste || []).map(x => x.id));
  for (const id of Object.keys(cache.judges)) if (!ids.has(Number(id))) delete cache.judges[id];
  const todo = (cache.liste || []).filter(x => !cache.judges[x.id] || now - cache.judges[x.id].t > 14 * DAY)
    .sort((a, b) => (cache.judges[a.id]?.t || 0) - (cache.judges[b.id]?.t || 0)).slice(0, perBuild);
  let fails = 0;
  for (const j of todo) {
    const raw = {};
    try {
      for (const [k, p] of [['stilling', 'stilling'], ['investering', 'investering/dommer'], ['selskapsverv', 'selskapsverv/dommer'], ['foreningsverv', 'foreningsverv/dommer'], ['representantskap', 'representantskap/dommer'], ['virksomhet', 'virksomhet/dommer'], ['politiskverv', 'politiskverv/dommer']]) {
        raw[k] = await getJson(`${API}/api/${p}/${j.id}`).catch(e => (/404/.test(e.message) ? null : Promise.reject(e)));
        await sleep(config.delayMs / 2);
      }
      cache.judges[j.id] = { t: now, d: compactJudge(raw) };
    } catch (e) { if (++fails >= 10) { warnings.push('Dommerregisteret: for mange feil, prøver igjen neste gang (' + e.message + ')'); break; } }
  }
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(file, JSON.stringify(cache));
  const liste = (cache.liste || []).map(x => ({ id: x.id, navn: t(`${x.fornavn} ${x.etternavn}`), etternavn: t(x.etternavn), tittel: cache.tittel?.[x.tittelId] || '', domstol: cache.domstol?.[x.domstolId] || '', ...(cache.judges[x.id]?.d || { lest: false }) }))
    .sort((a, b) => a.etternavn.localeCompare(b.etternavn, 'nb'));
  return { liste, lest: liste.filter(x => x.lest !== false).length, hentet: new Date().toISOString(), url: 'https://sidegjoremal.domstol.no/' };
}
