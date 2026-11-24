import { config } from './config.js';
import { getJson, mapLimit } from './http.js';

const api = (path) => `${config.stortingetApi}/${path}${path.includes('?') ? '&' : '?'}format=json`;

/** Stortinget bruker formatet "/Date(1633039200000+0200)/". */
export function parseMsDate(s) {
  if (!s) return null;
  const m = String(s).match(/-?\d+/);
  return m ? new Date(Number(m[0])) : null;
}
/** Dato som YYYY-MM-DD i norsk tid (unngår at midnatt glir til dagen før i UTC). */
export function isoDateOslo(d) {
  if (!d) return '';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(d);
}

const QTYPES = [['skriftligesporsmal', 'S'], ['sporretimesporsmal', 'M'], ['interpellasjoner', 'I']];

export async function fetchRepresentatives() {
  const data = await getJson(api('dagensrepresentanter'));
  return data?.dagensrepresentanter_liste || [];
}

/** Sesjonene i inneværende stortingsperiode, f.eks. ["2025-2026","2026-2027"]. */
export async function fetchPeriodSessions() {
  const [ses, per] = await Promise.all([getJson(api('sesjoner')), getJson(api('stortingsperioder'))]);
  const current = ses?.innevaerende_sesjon?.id;
  const periodStart = Number((per?.innevaerende_stortingsperiode?.id || current || '').slice(0, 4));
  const all = (ses?.sesjoner_liste || []).map(s => s.id).filter(Boolean);
  if (current && !all.includes(current)) all.push(current);
  const curStart = Number((current || '').slice(0, 4));
  return all.filter(id => { const y = Number(id.slice(0, 4)); return y >= periodStart && y <= curStart; }).sort();
}

export async function fetchQuestions(sessions) {
  const out = [];
  for (const ses of sessions) {
    for (const [ep, t] of QTYPES) {
      const d = await getJson(api(`${ep}?sesjonid=${encodeURIComponent(ses)}`)).catch(() => null);
      for (const q of d?.sporsmal_liste || []) {
        out.push({
          fra: q.sporsmal_fra?.id, til: q.sporsmal_til_minister_tittel || '',
          d: isoDateOslo(parseMsDate(q.datert_dato)), t, tit: (q.tittel || '').replace(/\s+/g, ' ').trim(), id: q.id,
        });
      }
    }
  }
  return out;
}

export async function fetchBiographies(ids) {
  const bios = await mapLimit(ids, id => getJson(api(`kodetbiografi?personid=${encodeURIComponent(id)}`)).catch(() => null));
  return Object.fromEntries(ids.map((id, i) => [id, bios[i]]));
}

const cut = (s, n) => (s && s.length > n ? s.slice(0, n).replace(/\s\S*$/, '') + '…' : s || '');

function bioFields(b) {
  const per = (b?.stortingsperiode_kodet_liste || []).map(p => Number(String(p.stortingsperiode_id).slice(0, 4))).filter(Boolean);
  const uy = b?.utdanning_yrke_kodet_liste || [];
  const first = type => {
    const x = uy.find(x => String(x.type) === type);
    if (!x) return '';
    const yrs = x.fra_aar > 0 ? ` (${x.fra_aar}–${x.til_aar > 0 ? x.til_aar : ''})` : '';
    return cut((x.navn || '').trim(), 70) + yrs;
  };
  return { per: per.length, forst: per.length ? Math.min(...per) : 0, utd: first('10'), yrke: first('20') };
}

/** Bygger representantobjekter med spørsmålsstatistikk. */
export function buildReps(list, bios, questions) {
  const parti = {}, kom = {};
  const byRep = new Map();
  for (const q of questions) {
    if (!q.fra) continue;
    if (!byRep.has(q.fra)) byRep.set(q.fra, []);
    byRep.get(q.fra).push(q);
  }
  const reps = list.map(r => {
    parti[r.parti.id] = r.parti.navn;
    for (const k of r.komiteer_liste || []) kom[k.id] = k.navn;
    const mine = (byRep.get(r.id) || []).sort((a, b) => b.d.localeCompare(a.d));
    const counts = {};
    for (const q of mine) if (q.til) counts[q.til] = (counts[q.til] || 0) + 1;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([til, n]) => ({ til, n }));
    const born = parseMsDate(r.foedselsdato);
    const s = mine[0];
    return {
      id: r.id,
      navn: `${r.fornavn} ${r.etternavn}`.replace(/\s+/g, ' ').trim(),
      fornavn: r.fornavn, etternavn: r.etternavn,
      parti: r.parti.id, fylke: r.fylke?.navn || '',
      kom: (r.komiteer_liste || []).map(k => k.id),
      fodt: born ? Number(isoDateOslo(born).slice(0, 4)) : 0,
      fodselsdato: isoDateOslo(born), // brukes kun til matching mot Brreg, fjernes før publisering
      vara: !!r.vara_representant,
      ...bioFields(bios[r.id]),
      q: mine.length, top,
      siste: s ? { d: s.d, t: s.t, tit: cut(s.tit, 160), id: s.id } : null,
    };
  });
  return { reps, parti, kom };
}
