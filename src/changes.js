// «Nytt siden sist»: finner hva som er endret fra forrige natt, slik at brukere som følger en politiker,
// et parti eller et selskap kan se det (og eventuelt få e-post). Inneholder bare offentlige opplysninger.
const KJOP = { K: 'kjøpte', S: 'solgte' };
const trId = t => [t.rep, t.d, t.k, t.sel, t.ant].join('|');
const coPairs = c => new Set([...(c.decl || []), ...Object.keys(c.roles || {})]);

export function diff(prev, next, today = new Date().toISOString().slice(0, 10)) {
  if (!prev?.reps?.length) return [];
  const out = [], rep = Object.fromEntries(next.reps.map(r => [r.id, r]));
  const add = (type, ref, tekst, extra = {}) => out.push({ id: `${type}:${ref}:${extra.key || tekst}`.slice(0, 200), d: today, type, ref, parti: type === 'rep' ? rep[ref]?.parti : undefined, tekst, ...extra, key: undefined });

  const old = new Set((prev.trades || []).map(trId));
  for (const t of next.trades || []) if (!old.has(trId(t)) && rep[t.rep])
    add('rep', t.rep, `${rep[t.rep].navn} ${KJOP[t.k] || 'handlet'} ${t.ant ?? ''} aksjer i ${t.sel}`.replace(/\s+/g, ' '), { key: trId(t), lenke: `#rep-${t.rep}` });

  const before = new Map((prev.cos || []).map(c => [c.nr, coPairs(c)]));
  for (const c of next.cos || []) {
    const was = before.get(c.nr) || new Set();
    for (const id of coPairs(c)) if (!was.has(id) && rep[id]) {
      const tekst = `${rep[id].navn} er koblet til ${c.navn}${c.roles?.[id] ? ` (${c.roles[id]})` : ''}`;
      add('rep', id, tekst, { key: c.nr + id, lenke: `#org-${c.nr}` });
      add('org', c.nr, tekst, { key: c.nr + id, lenke: `#org-${c.nr}` });
    }
  }

  const prevQ = Object.fromEntries((prev.reps || []).map(r => [r.id, r.siste?.id]));
  for (const r of next.reps) if (r.siste?.id && prevQ[r.id] && prevQ[r.id] !== r.siste.id)
    add('rep', r.id, `${r.navn} stilte nytt spørsmål: ${r.siste.tit}`, { key: r.siste.id, lenke: `#rep-${r.id}` });

  const oldI = new Set((prev.innside || []).map(i => i.id));
  for (const i of next.innside || []) if (!oldI.has(i.id)) for (const p of i.pol || []) if (p.ref && rep[p.ref])
    add('rep', p.ref, `Innsidehandel: ${i.tittel}`, { key: 'i' + i.id, lenke: i.u });

  const oldF = new Set((prev.faktasjekk?.sjekker || []).map(s => s.u));
  for (const s of next.faktasjekk?.sjekker || []) if (!oldF.has(s.u)) for (const p of s.p || [])
    add('parti', p, `Ny faktasjekk: ${s.t}`, { key: s.u, lenke: s.u });

  return out.map(({ key, ...x }) => x);
}

/** Slår sammen med tidligere endringer og beholder 60 dager (maks 2000). */
export function merge(prevList = [], fresh = [], today = new Date().toISOString().slice(0, 10)) {
  const cutoff = new Date(Date.parse(today) - 60 * 864e5).toISOString().slice(0, 10);
  const m = new Map([...prevList, ...fresh].filter(x => x.d >= cutoff).map(x => [x.id, x]));
  return [...m.values()].sort((a, b) => b.d.localeCompare(a.d)).slice(0, 2000);
}
