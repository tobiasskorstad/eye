// Bygger data/eye.json fra alle kilder. Kjøres nattlig av serveren, eller manuelt: npm run build-data
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { mapLimit } from './http.js';
import * as st from './stortinget.js';
import * as reg from './register.js';
import * as br from './brreg.js';
import { fetchRegnskap } from './regnskap.js';
import { fetchPartifin } from './partifin.js';
import { fetchListed } from './borsen.js';
import { fetchFiskeri } from './fiskeri.js';
import { fetchShort } from './short.js';
import { fetchJudges } from './dommere.js';
import { fetchStats } from './stats.js';
import { fetchNews, fetchFactchecks, tagParties } from './news.js';
import { fetchVotes } from './votes.js';
import { diff, merge } from './changes.js';
import { fetchInsider, fetchFlagging, tagPoliticians } from './insider.js';
import { fetchGovernment, fetchStatssekRegister, buildPep } from './pep.js';
import { buildProfiles, profilePeople } from './profiles.js';
import { fetchPolls, fetchLeaders, mergeLeaders, buildNow, attachPromiseNews } from './auto.js';

const log = (...a) => console.log(new Date().toISOString(), '[build]', ...a);

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
}
async function writeJsonAtomic(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data));
  await fs.rename(tmp, file);
}

export const files = {
  public: () => path.join(config.dataDir, 'eye.json'),
  internal: () => path.join(config.dataDir, 'internal.json'),
};

export async function buildData() {
  const t0 = Date.now();
  const warnings = [];
  const previous = await readJson(files.public());

  // 1. Stortinget
  log('henter representanter');
  const list = await st.fetchRepresentatives();
  if (list.length < 150) throw new Error(`Bare ${list.length} representanter – avbryter for å ikke publisere ufullstendige data`);
  const sessions = await st.fetchPeriodSessions();
  log('sesjoner', sessions.join(', '));
  const questions = await st.fetchQuestions(sessions);
  log('spørsmål', questions.length);
  const bios = await st.fetchBiographies(list.map(r => r.id));
  const missingBios = Object.values(bios).filter(b => !b).length;
  if (missingBios) warnings.push(`${missingBios} biografier kunne ikke hentes`);
  const { reps, parti, kom } = st.buildReps(list, bios, questions);
  // Manglende biografier (f.eks. når Stortingets API-kvote er nådd): bruk forrige natts opplysninger.
  const prevRep = Object.fromEntries((previous?.reps || []).map(r => [r.id, r]));
  for (const r of reps) if (!bios[r.id] && prevRep[r.id]) for (const k of ['utd', 'yrke', 'per', 'forst']) if (r[k] == null || r[k] === '' || r[k] === 0) r[k] = prevRep[r.id][k];

  // 2. Interesseregisteret
  let regDato = previous?.regDato || '', regUrl = previous?.regUrl || '';
  let trades = [], candidates = new Map(), regEntries = null;
  try {
    log('henter interesseregister');
    const r = await reg.fetchRegister();
    regDato = r.date; regUrl = r.url; regEntries = r.entries;
    let unmatched = 0;
    for (const rep of reps) {
      const p = reg.matchPerson(r.entries, rep);
      if (!p) { unmatched++; rep.reg = {}; continue; }
      rep.reg = reg.publicEntry(p);
      for (const t of reg.parseTrades(p)) trades.push({ rep: rep.id, ...t });
      for (const c of reg.companyCandidates(p)) {
        if (!candidates.has(c)) candidates.set(c, new Set());
        candidates.get(c).add(rep.id);
      }
    }
    if (unmatched) warnings.push(`${unmatched} representanter ble ikke funnet i registeret`);
    log('register', r.entries.length, 'personer,', trades.length, 'handler,', candidates.size, 'selskapskandidater');
  } catch (e) {
    warnings.push('Interesseregisteret feilet: ' + e.message + ' – bruker forrige versjon');
    log('ADVARSEL', e.message);
    const prevReg = Object.fromEntries((previous?.reps || []).map(r => [r.id, r.reg || {}]));
    for (const rep of reps) rep.reg = prevReg[rep.id] || {};
    trades = (previous?.trades || []).filter(t => reps.some(r => r.id === t.rep));
  }
  trades.sort((a, b) => b.d.localeCompare(a.d));

  // 3. Brønnøysund
  const idx = br.repIndex(reps);
  let cos = [];
  if (candidates.size) {
    log('slår opp selskaper i Brreg');
    const keys = [...candidates.keys()];
    const found = await mapLimit(keys, c => br.resolveCandidate(c).catch(() => null));
    const byNr = new Map();
    keys.forEach((k, i) => {
      const e = found[i];
      if (!e) return;
      const nr = e.organisasjonsnummer;
      if (!byNr.has(nr)) byNr.set(nr, { e, decl: new Set() });
      for (const id of candidates.get(k)) byNr.get(nr).decl.add(id);
    });
    const nrs = [...byNr.keys()];
    const roleLists = await mapLimit(nrs, nr => br.getPersonRoles(nr).catch(() => []));
    cos = nrs.map((nr, i) => {
      const { e, decl } = byNr.get(nr);
      const { roles, nRoller } = br.matchRoles(roleLists[i], idx);
      return { ...br.summarize(e), nRoller, roles, decl: [...decl], personer: br.publicPersons(roleLists[i], idx) };
    }).filter(c => c.kommune || c.nar); // slettede enheter uten data utelates
    const misses = keys.length - found.filter(Boolean).length;
    if (misses) warnings.push(`${misses} selskapsnavn fra registeret ble ikke funnet entydig i Brreg`);
    log('selskaper', cos.length);
  } else if (previous?.cos) {
    cos = previous.cos;
  }

  // 3b. Andre politisk eksponerte personer (PEP) med offentlige aksjeopplysninger
  let pep = previous?.pep || null;
  try {
    const gov = await fetchGovernment();
    // Regjeringen.no avviser av og til kall fra skyservere. Da brukes forrige natts data, ellers siste lagrede øyeblikksbilde.
    const snap = await readJson(path.join(config.contentDir, 'statssek-snapshot.json'));
    let ss = previous?.pep?.statssek?.length ? previous.pep.statssek : snap?.list || [], ssUrl = previous?.pep?.kilder?.statssek || snap?.url || '', ssDato = previous?.pep?.kilder?.statssekDato || snap?.dato || '';
    try { const r = await fetchStatssekRegister(); ss = r.list; ssUrl = r.url; ssDato = new Date().toISOString().slice(0, 10); }
    catch (e) { warnings.push(`Regjeringens register (statssekretærer) kunne ikke hentes (${e.message}) – viser versjonen fra ${ssDato}`); }
    if (regEntries && gov.length) pep = buildPep(gov, regEntries, ss, { regjering: regUrl, statssek: ssUrl, statssekDato: ssDato });
    else if (pep) pep = { ...pep, statssek: ss };
    log('PEP', pep?.regjering?.length, 'regjeringsmedlemmer,', ss.length, 'statssekretærer/rådgivere,', pep?.trades?.length, 'handler');
  } catch (e) { warnings.push('Regjeringsmedlemmer feilet: ' + e.message); }

  // 3c. Innsidehandel på Oslo Børs (alle styremedlemmer og toppledere i børsselskaper)
  let innside = previous?.innside || [];
  try {
    const people = [...reps.map(r => ({ navn: r.navn, gruppe: 'Stortinget', ref: r.id })),
      ...(pep?.regjering || []).map(g => ({ navn: g.navn, gruppe: 'Regjeringen', ref: g.id })),
      ...(pep?.statssek || []).map(s => ({ navn: s.navn, gruppe: 'Statssekretær/rådgiver' }))];
    innside = tagPoliticians(await fetchInsider(), people);
    log('innsidehandel', innside.length, 'meldinger,', innside.filter(i => i.pol).length, 'med politikere');
  } catch (e) { warnings.push('Innsidehandel (Oslo Børs) feilet: ' + e.message + ' – viser forrige'); }
  let flagging = previous?.flagging || [];
  try { flagging = (await fetchFlagging()).map(({ ant, kurs, k, ver, ...f }) => f); log('flaggemeldinger', flagging.length); }
  catch (e) { warnings.push('Flaggemeldinger (Oslo Børs) feilet: ' + e.message + ' – viser forrige'); }

  // 4. Partier: redaksjonelt innhold + automatiske nyhetsoverskrifter
  let partier = await readJson(path.join(config.contentDir, 'partier.json'));
  if (partier) {
    // Partiledere (Wikidata) og målinger (Poll of polls) hentes automatisk; redaksjonelle verdier er reserve.
    try { mergeLeaders(partier.partier, await fetchLeaders(), warnings); } catch (e) { warnings.push('Partiledere (Wikidata) feilet: ' + e.message); }
    try { const m = await fetchPolls(); if (m) partier.maling = m; else warnings.push('Målinger: kunne ikke tolke Poll of polls'); }
    catch (e) { warnings.push('Målinger feilet: ' + e.message); if (previous?.partier?.maling?.utvikling) partier.maling = previous.partier.maling; }
    try {
      const leaders = Object.fromEntries(Object.entries(partier.partier).map(([k, v]) => [k, v.leder]));
      partier.auto = await fetchNews(leaders);
      log('nyheter', Object.values(partier.auto).reduce((a, l) => a + l.length, 0));
    } catch (e) { warnings.push('Nyhetsfeeds feilet: ' + e.message); partier.auto = previous?.partier?.auto || {}; }
  } else warnings.push('Fant ikke content/partier.json');

  // 4a. Børsnoterte selskaper: navn, ticker og selskapets egen beskrivelse («About …») fra nyeste melding som har den
  const aksjer = {};
  for (const x of [...innside, ...flagging].sort((a, b) => b.d.localeCompare(a.d))) {
    const key = x.tick || x.sel; if (!key) continue;
    const a = aksjer[key] ||= { tick: x.tick || null, navn: x.sel, om: null };
    if (!a.om && x.om) Object.assign(a, { om: x.om, omDato: x.d, omU: x.u });
  }
  for (const x of [...innside, ...flagging]) delete x.om;
  // Alle aksjeselskaper på børsen, også dem uten nylige innsidehandler (beskrivelse fra rapportmeldinger og Wikidata)
  try {
    const listed = await fetchListed({ warnings });
    for (const s of listed) {
      const a = aksjer[s.tick] ||= { tick: s.tick, navn: s.navn, om: null };
      Object.assign(a, { marked: s.marked, web: s.web, stiftet: s.stiftet, bransje: s.bransje?.length ? s.bransje : undefined, notert: true });
      if (!a.om && s.om) Object.assign(a, { om: s.om, omDato: s.omDato, omU: s.omU });
      if (!a.om && s.wdesc) a.wdesc = s.wdesc;
      if (s.nr) a.nr = s.nr;
    }
    log('børsselskaper', listed.length);
  } catch (e) { warnings.push('Børslisten feilet: ' + e.message); for (const [k, a] of Object.entries(previous?.aksjer || {})) aksjer[k] ||= a; }

  // 4a2. Organisasjonsnummer for norske børsselskaper (slås opp én gang i måneden) og årsregnskap
  let regnskap = previous?.regnskap || {};
  try {
    const nrFile = path.join(config.dataDir, 'aksje-orgnr.json');
    let nrCache = {}; try { nrCache = JSON.parse(await fs.readFile(nrFile, 'utf8')); } catch { }
    const norske = Object.values(aksjer).filter(a => /\b(ASA|AS)$/i.test(a.navn.trim()));
    for (const a of norske) {
      if (a.nr) continue; // org.nr. fra Wikidata
      const c = nrCache[a.navn];
      if (!c || Date.now() - c.t > 30 * 864e5) nrCache[a.navn] = { t: Date.now(), nr: (await br.resolveCandidate(a.navn).catch(() => null))?.organisasjonsnummer || null };
      if (nrCache[a.navn].nr) a.nr = nrCache[a.navn].nr;
    }
    await fs.writeFile(nrFile, JSON.stringify(nrCache));
    regnskap = await fetchRegnskap([...cos.map(c => c.nr), ...norske.map(a => a.nr).filter(Boolean)], { warnings });
    log('regnskap', Object.keys(regnskap).length, 'selskaper');
  } catch (e) { warnings.push('Regnskap feilet: ' + e.message + ' – viser forrige'); }

  // 4b. Bilder og kort omtale av politikere, statsråder, partiledere og innsidere
  let profiler = previous?.profiler || {};
  try {
    profiler = await buildProfiles(profilePeople(reps, pep, innside, partier), { warnings });
    log('profiler', Object.keys(profiler).length, 'med bilde:', Object.values(profiler).filter(p => p.foto).length);
  } catch (e) { warnings.push('Bilder/profiler feilet: ' + e.message + ' – viser forrige'); }

  // 5. Voteringer (sakte pga. API-kvote, cache på disk)
  let stemmer = previous?.stemmer?.antall ? previous.stemmer : await readJson(path.join(config.contentDir, 'stemmer-snapshot.json'));
  try {
    const { diag, ...fresh } = await fetchVotes(sessions, config.maxNewVotes); log('voteringer', fresh.antall, diag);
    if (!fresh.antall) warnings.push(`Voteringer: ingen hentet (saker ${diag.saker}, voteringer ${diag.voteringer}, nye resultater ${diag.nye})`);
    if (fresh.antall > 0 && (stemmer?.kilde || fresh.antall >= Math.min(20, (stemmer?.antall || 0) / 2))) stemmer = fresh;
    else if (fresh.antall) warnings.push(`Voteringer: fikk bare ${fresh.antall}, beholder forrige (${stemmer?.antall || 0})`);
  } catch (e) { warnings.push('Voteringer feilet: ' + e.message); }
  if (stemmer) {
    const ids = new Set(reps.map(r => r.id));
    stemmer.oppmote = Object.fromEntries(Object.entries(stemmer.oppmote).filter(([id]) => ids.has(id)).map(([id, a]) => [id, Array.isArray(a) ? a : [a.n, a.borte]]));
    stemmer.voteringer = stemmer.voteringer.slice(0, 150);
  }

  // 6. Løfter og faktasjekk (redaksjonelt + automatisk)
  const lofter = attachPromiseNews(await readJson(path.join(config.contentDir, 'lofter.json')), partier?.auto, stemmer);
  if (partier) partier.naaAuto = buildNow(partier.auto, stemmer);
  const dummies = await readJson(path.join(config.contentDir, 'dummies.json'));
  // Redaksjonelt innhold som ikke er oppdatert på lenge, vises med varsel (men publiseres fortsatt).
  for (const [navn, c] of [['partier', partier], ['lofter', lofter], ['dummies', dummies]]) {
    const d = c?.oppdatert && (Date.now() - Date.parse(c.oppdatert)) / 864e5;
    if (d > 60) warnings.push(`Redaksjonelt innhold «${navn}» er ${Math.round(d)} dager gammelt`);
  }
  const faktasjekk = await readJson(path.join(config.contentDir, 'faktasjekk.json'));
  if (faktasjekk) {
    try {
      const leaders = partier ? Object.fromEntries(Object.entries(partier.partier).map(([k, v]) => [k, v.leder])) : {};
      const auto = tagParties(await fetchFactchecks(), leaders);
      const known = new Set(faktasjekk.sjekker.map(s => s.u));
      faktasjekk.sjekker = [...faktasjekk.sjekker.map(s => ({ type: 'faktasjekk', ...s })), ...auto.filter(a => !known.has(a.u))].sort((a, b) => (b.d || '').localeCompare(a.d || ''));
      faktasjekk.nyeste = faktasjekk.sjekker.find(s => s.d)?.d || null; // så siden kan si fra når kilden er stille
    } catch (e) { warnings.push('Faktasjekker feilet: ' + e.message); }
  }

  // 6b. Tall i debatten (SSB og Norges Bank)
  const tall = await fetchStats(previous?.tall, warnings);
  log('tall i debatten', tall.length);

  // 6c. Penger til partiene (partifinansiering.no)
  let partifin = previous?.partifin || null;
  try { partifin = await fetchPartifin({ warnings }); log('partifinansiering', partifin.aar.join(', '), partifin.givere.length, 'givere'); }
  catch (e) { warnings.push('Partifinansiering feilet: ' + e.message + (partifin ? ' – viser forrige' : '')); }

  // 6c2. Havbruk og havfiskeflåten (Fiskeridirektoratet) og shortposisjoner (Finanstilsynet)
  let fiskeri = previous?.fiskeri || null;
  try { fiskeri = await fetchFiskeri({ warnings }); log('fiskeri', fiskeri.havbruk?.eiere?.length, 'havbruksselskaper,', fiskeri.fartoy?.n, 'fartøy'); }
  catch (e) { warnings.push('Fiskeridirektoratet feilet: ' + e.message + (fiskeri ? ' – viser forrige' : '')); }
  const short = (await fetchShort({ warnings })) || previous?.short || null;
  if (short) log('short', short.liste.length, 'aksjer');

  // 6c3. Dommernes sidegjøremål (Domstoladministrasjonen)
  let dommere = previous?.dommere || null;
  try { dommere = await fetchJudges({ warnings }); log('dommere', dommere.liste.length, 'lest', dommere.lest); }
  catch (e) { warnings.push('Dommerregisteret feilet: ' + e.message + (dommere ? ' – viser forrige' : '')); }

  // 6d. Full biografi for representanter og statsråder (lastes av nettleseren bare når en profil åpnes)
  const govIds = (pep?.regjering || []).map(g => g.id).filter(id => id && !bios[id]);
  const govBios = govIds.length ? await st.fetchBiographies([...Object.keys(bios), ...govIds]).catch(() => ({})) : {};
  const bio = {};
  for (const [id, b] of Object.entries({ ...bios, ...govBios })) { const c = st.compactBio(b); if (c) bio[id] = c; }
  const godtgjoring = await readJson(path.join(config.contentDir, 'godtgjoring.json'));

  // 7. Lagre: offentlig fil uten fødselsdatoer; intern fil for live-matching
  const internal = { reps: reps.map(r => ({ id: r.id, navn: r.navn, parti: r.parti, etternavn: r.etternavn, fodselsdato: r.fodselsdato })) };
  const pub = {
    hentet: new Date().toISOString(), regDato, regUrl, sessions, parti, kom,
    reps: reps.map(({ fodselsdato, fornavn, etternavn, ...r }) => r),
    trades, cos, pep, innside, flagging, aksjer, regnskap, profiler, partier, stemmer, lofter, faktasjekk, tall, dummies, partifin, fiskeri, short, dommere, bio, godtgjoring, warnings, byggetid: Math.round((Date.now() - t0) / 1000),
  };
  pub.endringer = merge(previous?.endringer, diff(previous, pub));
  await writeJsonAtomic(files.internal(), internal);
  await writeJsonAtomic(files.public(), pub);
  log(`ferdig på ${pub.byggetid}s`, warnings.length ? `(${warnings.length} advarsler)` : '');
  return pub;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildData().catch(e => { console.error(e); process.exit(1); });
}
