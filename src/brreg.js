// Enhetsregisteret (Brønnøysundregistrene), åpent API uten nøkkel.
import { config } from './config.js';
import { getJson } from './http.js';
import { validOrgnr } from './register.js';

const api = p => `${config.brregApi}/${p}`;
export const normName = s => String(s || '').toUpperCase().normalize('NFC').replace(/[^A-Z0-9ÆØÅ&]/g, ' ').replace(/\s+/g, ' ').trim();
const stripForm = s => normName(s).replace(/ (AS|ASA|SA|DA|ANS|BA)$/, '');

export async function searchByName(q, size = 20) {
  const d = await getJson(api(`enheter?navn=${encodeURIComponent(q)}&size=${size}`));
  return d?._embedded?.enheter || [];
}

export async function getEnhet(nr) {
  if (!validOrgnr(nr)) return null;
  const e = await getJson(api(`enheter/${nr}`));
  if (e) return e;
  const u = await getJson(api(`underenheter/${nr}`));
  return u?.overordnetEnhet ? getJson(api(`enheter/${u.overordnetEnhet}`)) : null;
}

/** Alle aktive personroller i en enhet. */
export async function getPersonRoles(nr) {
  const d = await getJson(api(`enheter/${nr}/roller`));
  const out = [];
  for (const g of d?.rollegrupper || []) for (const r of g.roller || []) {
    if (!r.person || r.avregistrert) continue;
    out.push({
      fornavn: r.person.navn?.fornavn || '', etternavn: r.person.navn?.etternavn || '',
      fodselsdato: r.person.fodselsdato || '', rolle: r.type?.beskrivelse || '',
    });
  }
  return out;
}

/** Slår opp et kandidatnavn eller "#orgnr" – bare sikre treff (eksakt navn) godtas. */
export async function resolveCandidate(cand) {
  if (cand.startsWith('#')) return getEnhet(cand.slice(1));
  const base = cand.replace(/\s+(AS|ASA|SA|DA|ANS|BA)$/i, '');
  const list = await searchByName(base, 20);
  return list.find(x => normName(x.navn) === normName(cand)) || list.find(x => stripForm(x.navn) === stripForm(base)) || null;
}

/** Indeks over representanter: fødselsdato + etternavn → id. */
export function repIndex(reps) {
  const idx = new Map();
  for (const r of reps) if (r.fodselsdato) idx.set(`${r.fodselsdato}|${normName(r.etternavn)}`, r.id);
  return idx;
}

/** Finner hvilke representanter som har roller; andre personer telles bare. */
export function matchRoles(persons, idx) {
  const roles = {};
  for (const p of persons) {
    const id = idx.get(`${p.fodselsdato}|${normName(p.etternavn)}`);
    if (id) (roles[id] ||= []).includes(p.rolle) || roles[id].push(p.rolle);
  }
  return { roles, nRoller: persons.length };
}

const titleCase = s => String(s || '').toLowerCase()
  .replace(/(^|[\s\-/(])([a-zæøå])/g, (m, a, b) => a + b.toUpperCase())
  .replace(/\b(As|Asa|Sa|Da|Ans|Iks|Fkf|Kf)$/, m => m.toUpperCase());

/** Alle roller i enheten slik de står i Enhetsregisteret, uten fødselsdato. Representanter markeres. */
export function publicPersons(persons, idx) {
  const out = new Map();
  for (const p of persons) {
    const navn = [p.fornavn, p.etternavn].filter(Boolean).join(' ');
    const key = `${navn}|${p.fodselsdato}`; // samme person med flere roller slås sammen
    if (!out.has(key)) out.set(key, { navn, rolle: p.rolle, rep: idx.get(`${p.fodselsdato}|${normName(p.etternavn)}`) || undefined });
    else if (!out.get(key).rolle.split(', ').includes(p.rolle)) out.get(key).rolle += ', ' + p.rolle;
  }
  return [...out.values()].sort((a, b) => (b.rep ? 1 : 0) - (a.rep ? 1 : 0));
}

/** Offentlige nøkkelopplysninger om en enhet (ingen personopplysninger). */
export function summarize(e) {
  return {
    nr: e.organisasjonsnummer,
    navn: titleCase(e.navn),
    form: e.organisasjonsform?.kode || '',
    formNavn: e.organisasjonsform?.beskrivelse || '',
    kommune: titleCase(e.forretningsadresse?.kommune || e.postadresse?.kommune || ''),
    nar: e.naeringskode1?.beskrivelse || '',
    ans: e.harRegistrertAntallAnsatte ? e.antallAnsatte : -1,
    ar: String(e.stiftelsesdato || e.registreringsdatoEnhetsregisteret || '').slice(0, 4),
    flag: (e.konkurs ? 'K' : '') + (e.underAvvikling || e.underTvangsavviklingEllerTvangsopplosning ? 'V' : ''),
    hjemmeside: e.hjemmeside || '',
  };
}
