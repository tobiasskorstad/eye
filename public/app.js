// Maktkartet – ingen rammeverk. All tekst fra data går gjennom esc(), alle lenker gjennom url().
'use strict';
const COL = { R: '#8a1020', SV: '#d6336c', MDG: '#58a72a', A: '#e1202d', Sp: '#0f7a3c', KrF: '#e0a800', V: '#0b8f86', H: '#1d6ee0', FrP: '#0a2c66' };
const ORDER = ['R', 'SV', 'MDG', 'A', 'Sp', 'KrF', 'V', 'H', 'FrP'];
const FORM = { AS: 'Aksjeselskap', ASA: 'Allmennaksjeselskap', ENK: 'Enkeltpersonforetak', FLI: 'Forening/lag', STI: 'Stiftelse', SA: 'Samvirkeforetak', ANS: 'Ansvarlig selskap', DA: 'Delt ansvar', IKS: 'Interkommunalt selskap', FKF: 'Fylkeskommunalt foretak', KF: 'Kommunalt foretak', PK: 'Pensjonskasse' };
const PARA = { 2: 'Styreverv mv.', 3: 'Selvstendig næring', 4: 'Lønnet stilling', 5: 'Tidligere arbeidsgiver', 6: 'Framtidig arbeidsgiver', 7: 'Økonomisk støtte', 8: 'Eiendom i næring', 9: 'Selskapsinteresser', '9a': 'Gjeld', 10: 'Utenlandsreiser', 11: 'Gaver', 15: 'Andre forhold' };
const PARA_ORDER = ['2', '3', '4', '5', '6', '7', '8', '9', '9a', '10', '11', '15'];
const QTYPE = { S: 'Skriftlig spørsmål', M: 'Spørretimen', I: 'Interpellasjon' };

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Bare http(s)-lenker slipper gjennom (stopper javascript:/data:-lenker fra RSS og skrapede kilder).
const url = u => { try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) ? esc(x.href) : '#'; } catch { return '#'; } };
const num = n => Number.isFinite(+n) ? +n : 0;
const col = p => /^#[0-9a-f]{6}$/i.test(COL[p]) ? COL[p] : '#7a8496';
const dot = p => `<span class="dot" style="background:${col(p)}"></span>`;
const nf = n => Number(n).toLocaleString('nb-NO');
const sdate = d => d ? new Date(d).toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '–';
const date = (d, long) => d ? new Date(d).toLocaleDateString('nb-NO', long ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' }) : '–';
const org = nr => String(nr).replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
const hid = id => String(id).replace(/[^\wÅØÆåøæ]/g, '').replace(/Å/g, 'AA').replace(/Ø/g, 'OE').replace(/Æ/g, 'AE');
const trade = k => k === 'K' ? '<span class="k">Kjøp</span>' : k === 'S' ? '<span class="s">Salg</span>' : 'Uspesifisert';
const flag = f => (f || '').includes('K') ? 'Konkurs' : (f || '').includes('V') ? 'Under avvikling' : '';
// Tre måter å kjøre på: én HTML-fil (EYE_DATA), statisk nettsted (data.json) eller Node-server (/api).
// Uten server går selskapssøk rett mot Brønnøysunds åpne API fra nettleseren.
let SERVER = false;
const BRREG = 'https://data.brreg.no/enhetsregisteret/api/';
const tc = s => String(s || '').toLowerCase().replace(/(^|[\s\-/(])([a-zæøå])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(As|Asa|Sa|Da|Ans|Iks|Fkf|Kf)$/, m => m.toUpperCase());
const brSum = e => ({ nr: String(e.organisasjonsnummer).replace(/\D/g, ''), navn: tc(e.navn), form: e.organisasjonsform?.kode || '', formNavn: e.organisasjonsform?.beskrivelse || '',
  kommune: tc(e.forretningsadresse?.kommune || e.postadresse?.kommune || ''), nar: e.naeringskode1?.beskrivelse || '', ans: e.harRegistrertAntallAnsatte ? num(e.antallAnsatte) : -1,
  ar: String(e.stiftelsesdato || e.registreringsdatoEnhetsregisteret || '').slice(0, 4), flag: (e.konkurs ? 'K' : '') + (e.underAvvikling || e.underTvangsavviklingEllerTvangsopplosning ? 'V' : '') });
async function brGet(p) { if (!/^(enheter|underenheter)(\/\d{9}(\/roller)?|\?size=15&navn=[^/#]*)$/.test(p)) throw new Error('ugyldig oppslag'); const r = await fetch(BRREG + p, { headers: { accept: 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer' }); if (r.status === 404) return null; if (!r.ok) throw new Error('Brønnøysund svarte ikke – prøv igjen'); return r.json(); }
async function brSearch(q) {
  const nr = q.replace(/\s/g, '');
  if (/^\d{9}$/.test(nr)) { const e = await brGet('enheter/' + nr); return e ? [brSum(e)] : []; }
  return ((await brGet('enheter?size=15&navn=' + encodeURIComponent(q)))?._embedded?.enheter || []).map(brSum);
}
async function brEnhet(nr) {
  if (!/^\d{9}$/.test(nr)) return null;
  const e = await brGet('enheter/' + nr) || await brGet('underenheter/' + nr); if (!e) return null;
  const roller = await brGet('enheter/' + nr + '/roller').catch(() => null), m = new Map();
  for (const g of roller?.rollegrupper || []) for (const r of g.roller || []) {
    if (!r.person || r.avregistrert) continue; // fødselsdato i svaret brukes ikke
    const navn = [r.person.navn?.fornavn, r.person.navn?.mellomnavn, r.person.navn?.etternavn].filter(Boolean).join(' '), rolle = r.type?.beskrivelse || '';
    const x = m.get(navn); x ? (x.rolle.split(', ').includes(rolle) || (x.rolle += ', ' + rolle)) : m.set(navn, { navn, rolle });
  }
  const known = byNr[brSum(e).nr];
  return { ...brSum(e), personer: [...m.values()].map(p => ({ ...p, rep: known?.ids.find(id => byId[id].navn.toLowerCase() === p.navn.toLowerCase()) })), politikere: (known?.ids || []).map(id => ({ id })) };
}

const PFIX = { Ap: 'A', Frp: 'FrP', Høyre: 'H' }, pp = p => PFIX[p] || p;
let D, reps, byId, byH, cos, byNr, trades, P, holdings = [], govs = [], govById = {}, govByH = {}, insiders = new Map(), stocks = new Map(), owners = new Map();

/* ---------- data ---------- */
async function load() {
  if (window.EYE_DATA) return window.EYE_DATA;
  const s = await fetch('data.json', { cache: 'no-cache' }).catch(() => null);
  if (s?.ok) return s.json();
  SERVER = true;
  for (let i = 0; i < 40; i++) {
    const r = await fetch('/api/data');
    if (r.ok) return r.json();
    if (r.status !== 503) throw new Error('HTTP ' + r.status);
    $('repsLede').textContent = 'Dataene hentes for første gang. Det tar noen minutter …';
    await new Promise(s => setTimeout(s, 15000));
  }
  throw new Error('tidsavbrudd');
}
function prepare(d) {
  D = d;
  reps = D.reps.map(r => ({ ...r, parti: String(r.parti).replace(/[^\wÅØÆåøæ]/g, ''), h: hid(r.id), reg: r.reg || {}, cos: [], trades: [] }));
  byId = Object.fromEntries(reps.map(r => [r.id, r]));
  byH = Object.fromEntries(reps.map(r => [r.h, r]));
  const gov = Object.fromEntries((D.pep?.regjering || []).map(g => [g.id, { navn: g.navn, parti: pp(g.parti), rolle: g.tittel, trades: [] }]));
  trades = [...D.trades.map(t => ({ ...t, r: byId[t.rep] })), ...(D.pep?.trades || []).map(t => ({ ...t, r: gov[t.pep] }))].filter(t => t.r).sort((a, b) => b.d.localeCompare(a.d));
  const NONE = /^(nei|ingen|har ingen|jeg har ingen|-|x)\b/i;
  holdings = [
    ...reps.map(r => ({ navn: r.navn, h: r.h, rid: r.id, parti: r.parti, gruppe: 'Stortinget', rolle: r.vara ? 'Vararepresentant' : 'Stortingsrepresentant', tekst: r.reg?.['9'] || '' })),
    ...(D.pep?.regjering || []).map(g => ({ navn: g.navn, g: hid(g.id), gid: g.id, parti: pp(g.parti), gruppe: 'Regjeringen', rolle: g.tittel, tekst: g.reg ? g.reg['9'] || '' : '', mangler: !g.reg })),
    ...(D.pep?.statssek || []).map(s => ({ navn: s.navn, parti: pp(s.parti), gruppe: 'Statssekretærer og politiske rådgivere', rolle: 'Statssekretær eller politisk rådgiver', tekst: s.felt?.aksjer || '' })),
  ].map(x => ({ ...x, eier: !!x.tekst && !NONE.test(x.tekst.trim()) }));
  trades.forEach(t => t.r.trades.push(t));
  govs = (D.pep?.regjering || []).map(g => ({ ...g, parti: pp(g.parti), trades: gov[g.id].trades }));
  govById = Object.fromEntries(govs.map(g => [g.id, g])); govByH = Object.fromEntries(govs.map(g => [hid(g.id), g]));
  insiders = new Map(); stocks = new Map(); owners = new Map();
  // Aksjer: alle selskaper med innsidehandel eller flaggemeldinger, pluss beskrivelsen fra byggeren
  const stockOf = x => { const k = slug(x.tick || x.sel); if (!k) return null; let st = stocks.get(k);
    if (!st) { const a = D.aksjer?.[x.tick || x.sel] || {}; st = { k, tick: x.tick || null, navn: x.sel, om: a.om || null, omDato: a.omDato, omU: a.omU, ins: [], flag: [], pol: [] }; stocks.set(k, st); }
    return st; };
  for (const [key, a] of Object.entries(D.aksjer || {})) { const st = stockOf({ tick: a.tick, sel: a.navn }); if (st) Object.assign(st, { notert: !!a.notert || !!st.notert, marked: a.marked, web: a.web, stiftet: a.stiftet, bransje: a.bransje, wdesc: a.wdesc, om: st.om || a.om, omDato: st.omDato || a.omDato, omU: st.omU || a.omU }); }
  for (const x of D.innside || []) stockOf(x)?.ins.push(x);
  for (const f of D.flagging || []) { stockOf(f)?.flag.push(f); if (f.eier) { const k = slug(f.eier); const o = owners.get(k) || { s: k, navn: f.eier, list: [] }; o.list.push(f); owners.set(k, o); } }
  for (const t of trades) { const st = stockByName(t.sel); if (st) st.pol.push(t); }
  for (const x of D.innside || []) if (x.navn) { const k = slug(x.navn); if (!k) continue; const e = insiders.get(k) || { s: k, navn: x.navn, list: [], pol: x.pol }; e.list.push(x); insiders.set(k, e); }
  cos = D.cos.map(c => ({ ...c, ids: [...new Set([...(c.decl || []), ...Object.keys(c.roles || {})])].filter(i => byId[i]) }));
  cos.forEach(c => c.ids.forEach(i => byId[i].cos.push(c)));
  byNr = Object.fromEntries(cos.map(c => [c.nr, c]));
  P = D.partier || null;
  reps.forEach(r => r.key = (r.navn + ' ' + r.fylke + ' ' + r.parti).toLowerCase());
  cos.forEach(c => c.key = (c.navn + ' ' + c.nr).toLowerCase());
}

/* ---------- visninger og faner ---------- */
const VIEWS = ['home', 'questions', 'money', 'listed', 'gov', 'minister', 'person', 'stock', 'owner', 'owners', 'flagging', 'insider', 'holdings', 'konto', 'personvern', 'reps', 'rep', 'votes', 'agree', 'parties', 'party', 'promises', 'news', 'dummies', 'trades', 'cos', 'org', 'facts', 'om'];
const SECTIONS = {
  st: [['stortinget', 'Representanter'], ['sporsmal', 'Spørsmål'], ['voteringer', 'Voteringer'], ['enighet', 'Hvem stemmer med hvem']],
  pa: [['partier', 'Oversikt'], ['partipenger', 'Penger til partiene'], ['lofter', 'Løfter og resultater'], ['nyheter', 'Nyheter']],
  pe: [['handler', 'Aksjehandler'], ['aksjeposter', 'Aksjeposter'], ['selskaper', 'Selskaper']],
  ei: [['eiere', 'Oversikt'], ['borsselskaper', 'Selskaper'], ['innside', 'Innsidehandler'], ['storeeiere', 'Store eiere']],
  fa: [], om: [], du: [], ko: [], ov: [], rg: [],
};
const HASHVIEW = { oversikt: ['home', 'ov'], regjeringen: ['gov', 'rg'], stortinget: ['reps', 'st'], sporsmal: ['questions', 'st'], voteringer: ['votes', 'st'], enighet: ['agree', 'st'], partier: ['parties', 'pa'], partipenger: ['money', 'pa'], borsselskaper: ['listed', 'ei'], lofter: ['promises', 'pa'], nyheter: ['news', 'pa'], handler: ['trades', 'pe'], aksjeposter: ['holdings', 'pe'], innside: ['insider', 'ei'], eiere: ['owners', 'ei'], storeeiere: ['flagging', 'ei'], selskaper: ['cos', 'pe'], faktasjekk: ['facts', 'fa'], forklart: ['dummies', 'du'], om: ['om', 'om'], konto: ['konto', 'ko'], personvern: ['personvern', 'ko'] };
function show(v, sec, sub) {
  for (const x of VIEWS) $('v-' + x).hidden = x !== v;
  for (const a of document.querySelectorAll('#mainnav a')) a.dataset.s === sec ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  $('subnav').innerHTML = (SECTIONS[sec] || []).map(([h, l]) => `<a href="#${h}"${h === sub ? ' aria-current="page"' : ''}>${l}</a>`).join('');
  // Aktiv fane skal alltid synes i menyen, også på smale skjermer der menyen kan rulles sidelengs.
  const cur = document.querySelector('#mainnav [aria-current]'), nav = $('mainnav');
  if (cur && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = cur.offsetLeft - (nav.clientWidth - cur.offsetWidth) / 2;
  document.querySelector('.top')?.classList.remove('hide');
}
// Mobil: toppen glir bort når du blar ned og kommer tilbake når du blar opp, så innholdet får plass.
{ let last = 0; addEventListener('scroll', () => { const y = scrollY, top = document.querySelector('.top'); if (!top || !matchMedia('(max-width:720px)').matches) return; if (y > last + 6 && y > 140 && !top.contains(document.activeElement)) top.classList.add('hide'); else if (y < last - 6 || y < 140) top.classList.remove('hide'); last = y; }, { passive: true }); }
function route() {
  const h = decodeURIComponent(location.hash.slice(1)) || 'oversikt'; let m;
  closeSearch();
  if ((m = h.match(/^rep-(\w+)$/)) && byH[m[1]]) { renderRep(byH[m[1]]); show('rep', 'st', 'stortinget'); }
  else if ((m = h.match(/^parti-(\w+)$/)) && P?.partier[m[1]]) { renderParty(m[1]); show('party', 'pa', 'partier'); }
  else if ((m = h.match(/^org-(\d{9})$/))) { renderOrg(m[1]); show('org', 'pe', 'selskaper'); }
  else if ((m = h.match(/^statsrad-(\w+)$/)) && govByH[m[1]]) { renderMinister(govByH[m[1]]); show('minister', 'rg', 'regjeringen'); }
  else if ((m = h.match(/^person-([a-z0-9-]+)$/)) && insiders.has(m[1])) { renderPerson(insiders.get(m[1])); show('person', 'ei', 'eiere'); }
  else if ((m = h.match(/^aksje-([a-z0-9-]+)$/)) && stocks.has(m[1])) { renderStock(stocks.get(m[1])); show('stock', 'ei', 'borsselskaper'); }
  else if ((m = h.match(/^eier-([a-z0-9-]+)$/)) && owners.has(m[1])) { renderOwner(owners.get(m[1])); show('owner', 'ei', 'storeeiere'); }
  else { const [v, s] = HASHVIEW[h] || HASHVIEW.oversikt; if (v === 'konto') kontoView(); show(v, s, HASHVIEW[h] ? h : 'oversikt'); document.title = 'Maktkartet – makt og penger i Norge'; }
  scrollTo(0, 0);
}

/* ---------- Stortinget ---------- */
const off = new Set();
function chamber() {
  const n = reps.length, rows = 8, r0 = 60, r1 = 186, cx = 200, cy = 198, seats = [];
  const rad = [...Array(rows)].map((_, i) => r0 + (r1 - r0) * i / (rows - 1)), tot = rad.reduce((a, b) => a + b, 0);
  const cnt = rad.map(r => Math.round(n * r / tot)); cnt[rows - 1] += n - cnt.reduce((a, b) => a + b, 0);
  rad.forEach((r, i) => { for (let j = 0; j < cnt[i]; j++) { const a = Math.PI - Math.PI * j / Math.max(1, cnt[i] - 1); seats.push({ x: cx + r * Math.cos(a), y: cy - r * Math.sin(a), a }); } });
  seats.sort((p, q) => q.a - p.a || Math.hypot(p.x - cx, p.y - cy) - Math.hypot(q.x - cx, q.y - cy));
  const order = [...new Set([...ORDER, ...reps.map(r => r.parti)])];
  const seated = [...reps].sort((a, b) => order.indexOf(a.parti) - order.indexOf(b.parti) || b.q - a.q);
  $('sal').innerHTML = seated.map((r, i) => `<a href="#rep-${r.h}"><circle data-h="${r.h}" cx="${seats[i].x.toFixed(1)}" cy="${seats[i].y.toFixed(1)}" r="5.6" fill="${col(r.parti)}"><title>${esc(r.navn)} (${esc(r.parti)})</title></circle></a>`).join('') +
    `<text x="200" y="190" text-anchor="middle" font-weight="800" font-size="30" fill="currentColor">${n}</text>`;
  legend();
}
function legend() {
  const ps = [...new Set([...ORDER, ...reps.map(r => r.parti)])].filter(p => reps.some(r => r.parti === p));
  $('leg').innerHTML = ps.map(p => `<button data-p="${esc(p)}" class="${off.has(p) ? 'off' : ''}" aria-pressed="${!off.has(p)}">${dot(p)}${esc(D.parti[p] || p)} ${reps.filter(r => r.parti === p).length}</button>`).join('');
}
function repList() {
  const fy = $('fy').value, ko = $('ko').value, so = $('so').value;
  const list = reps.filter(r => !off.has(r.parti) && (!fy || r.fylke === fy) && (!ko || r.kom.includes(ko)))
    .sort((a, b) => so === 'navn' ? a.navn.localeCompare(b.navn, 'nb') : so === 'cos' ? b.cos.length - a.cos.length || b.q - a.q : so === 'tr' ? b.trades.length - a.trades.length || b.q - a.q : b.q - a.q);
  const vis = new Set(list.map(r => r.h));
  for (const c of $('sal').querySelectorAll('circle')) c.classList.toggle('dim', !vis.has(c.dataset.h));
  const z = n => n ? nf(n) : '<span class="zero">0</span>';
  $('repTable').tBodies[0].innerHTML = list.map(r => `<tr data-go="rep-${r.h}"><td><div class="who">${avatar(['rep:' + r.id], r.navn, r.parti)}<div><a href="#rep-${r.h}">${esc(r.navn)}</a><div class="meta">${esc(r.fylke)}<span class="show-s"> · ${esc(r.parti)}</span></div></div></div></td><td class="hide-s">${dot(r.parti)}${esc(r.parti)}</td><td class="n">${z(r.q)}</td><td class="n">${z(r.cos.length)}</td><td class="n">${z(r.trades.length)}</td></tr>`).join('')
    || '<tr><td colspan="5" class="empty">Ingen treff.</td></tr>';
}

/* ---------- profiler: bilder og omtale ---------- */
// Bildene ligger på samme nettsted (lastet ned i bygget). I én-fil-versjonen finnes de ikke, da vises initialer.
const IMG = !window.EYE_DATA;
const slug = s => String(s || '').toLowerCase().normalize('NFKD').replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
/** Slår sammen profilene for flere nøkler (f.eks. både representant og statsråd): første bilde og første omtale vinner. */
const prof = keys => { const o = {}; for (const k of keys) { const p = D.profiler?.[k]; if (!p) continue; if (!o.foto && p.foto) Object.assign(o, { foto: p.foto, fotoKilde: p.fotoKilde, fotoLenke: p.fotoLenke }); if (!o.wiki && p.wiki) o.wiki = p.wiki; } return o; };
const initials = n => { const w = String(n || '').split(/\s+/).filter(Boolean); return w.length ? (w[0][0] + (w.length > 1 ? w.at(-1)[0] : '')).toUpperCase() : '?'; };
function avatar(keys, navn, parti, size = 's') {
  const p = prof(keys), sz = { s: 'av-s', m: 'av-m', l: 'av-l' }[size] || 'av-s';
  if (IMG && /^img\/[a-z0-9-]{1,80}\.jpg$/.test(p.foto || '')) return `<img class="av ${sz}" src="${p.foto}" alt="" loading="lazy" decoding="async" width="158" height="211">`;
  return `<span class="av ${sz} av-i" style="background:${parti ? col(parti) : '#5b6675'}" aria-hidden="true">${esc(initials(navn))}</span>`;
}
const credit = p => p.foto && IMG ? `<div class="credit">Foto: <a href="${url(p.fotoLenke)}" rel="noopener">${esc(p.fotoKilde)}</a></div>` : '';
const LANGN = { en: ' (engelsk)', sv: ' (svensk)', da: ' (dansk)' };
const wikiSrc = w => `Fra <a href="${url(w.url)}" rel="noopener">${w.kilde === 'Wikidata' ? 'Wikidata' : 'Wikipedia'}</a>${LANGN[w.lang] || ''}, lisens ${w.kilde === 'Wikidata' ? 'CC0' : 'CC BY-SA 4.0'}`;
const wikiBox = p => p.wiki ? `<div class="wiki"><p>${esc(p.wiki.tekst)}</p><div class="meta">${wikiSrc(p.wiki)}</div></div>` : '';
/** Toppen av en personside: bilde, navn, rolle, omtale. */
function profileHead({ keys, navn, parti, kicker, sub, follow = '' }) {
  const p = prof(keys);
  return `<div class="profile"><div class="ph">${avatar(keys, navn, parti, 'l')}${credit(p)}</div>
  <div class="pinfo"><div class="kicker">${kicker}</div><div class="hrow"><h1>${esc(navn)}</h1>${follow}</div>${sub ? `<div class="meta">${sub}</div>` : ''}${wikiBox(p)}</div></div>`;
}
/** Innholdsfortegnelse som hopper til seksjoner på siden (uten å endre adressen). */
const toc = items => `<nav class="toc" aria-label="På denne siden">${items.filter(Boolean).map(([id, l]) => `<button type="button" data-jump="${esc(id)}">${l}</button>`).join('')}</nav>`;
const sec = (id, title, body, extra = '') => `<section class="block" id="${esc(id)}"><div class="bh"><h2>${title}</h2>${extra}</div>${body}</section>`;

/**
 * Hvor mye representanten eier i et selskap, lest fra fritekst i § 9 i interesseregisteret.
 * Finner selskapsnavnet og leser antall aksjer/andeler eller prosent rett etter («Lildog AS: 50 000 aksjer»,
 * «Smite AS 100%») eller rett før («132 aksjer i Telenor ASA», «8 % av aksjene i dansekompaniet Kartellet AS»).
 */
function holdingFor(text, coName) {
  const t = String(text || ''), base = String(coName || '').replace(/\s+\b(ASA|AS|SA|AB|LTD|PLC)\b\.?$/i, '').trim();
  if (base.length < 3) return null;
  const m = new RegExp(base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*'), 'i').exec(t);
  if (!m) return null;
  const after = t.slice(m.index + m[0].length, m.index + m[0].length + 90), before = t.slice(Math.max(0, m.index - 70), m.index);
  const num = '(?<![\\d,])(\\d{1,3}(?:[\\u00a0 .]\\d{3})+|\\d+(?:,\\d+)?)', unit = '(aksjer|aksje|andeler|andel|egenkapitalbevis|grunnfondsbevis)';
  const cut = after.split(/(?<=aksjer|aksje|andeler|andel|bevis|%\)?)\s*[.,;]|\n/)[0];
  const fmt = (n, u) => {
    const v = Number(n.replace(/[\s .]/g, '').replace(',', '.')), l = u.toLowerCase();
    if (u === '%') return `${v.toLocaleString('nb-NO')} %`;
    return `${v.toLocaleString('nb-NO')} ${l.startsWith('andel') ? (v === 1 ? 'andel' : 'andeler') : l.startsWith('aksje') ? (v === 1 ? 'aksje' : 'aksjer') : l}`;
  };
  let x;
  if ((x = new RegExp(num + '\\s*%').exec(cut))) return fmt(x[1], '%');
  if ((x = new RegExp(num + '\\s*' + unit, 'i').exec(cut))) return fmt(x[1], x[2]);
  if ((x = new RegExp('antall\\s+aksjer:?\\s*' + num, 'i').exec(cut))) return fmt(x[1], 'aksjer');
  if ((x = new RegExp(num + '\\s*' + unit + '\\s+i\\s+(?:\\S+\\s+){0,3}$', 'i').exec(before))) return fmt(x[1], x[2]);
  if ((x = new RegExp(num + '\\s*%\\s*(?:av\\s+aksjene\\s+)?i\\s+(?:\\S+\\s+){0,3}$', 'i').exec(before))) return fmt(x[1], '%');
  return null;
}
/** Aksjehandler oppsummert per selskap: kjøpt, solgt, netto antall, sum. */
function tradeSummary(list) {
  const m = new Map();
  for (const t of list) {
    const g = m.get(t.sel) || { sel: t.sel, kjop: 0, salg: 0, kr: 0, n: 0, d: t.d };
    if (t.k === 'K') g.kjop += t.ant || 0; else if (t.k === 'S') g.salg += t.ant || 0;
    g.kr += t.ver || 0; g.n++; if (t.d > g.d) g.d = t.d; m.set(t.sel, g);
  }
  return [...m.values()].sort((a, b) => b.d.localeCompare(a.d));
}
const tradeBlock = list => {
  const sum = tradeSummary(list);
  return `<div class="tw"><table><thead><tr><th>Selskap</th><th class="n">Handler</th><th class="n hide-s">Kjøpt</th><th class="n hide-s">Solgt</th><th class="n">Netto aksjer</th><th class="n hide-s">Sist</th></tr></thead><tbody>${sum.map(g => { const net = g.kjop - g.salg; return `<tr><td><b>${stockLink(g.sel)}</b></td><td class="n">${g.n}</td><td class="n hide-s">${g.kjop ? nf(g.kjop) : '–'}</td><td class="n hide-s">${g.salg ? nf(g.salg) : '–'}</td><td class="n"><b class="${net > 0 ? 'pos' : net < 0 ? 'neg' : ''}">${net > 0 ? '+' : ''}${nf(net)}</b></td><td class="n hide-s">${sdate(g.d)}</td></tr>`; }).join('')}</tbody></table></div>
  <p class="meta">Netto = kjøpt minus solgt i perioden Maktkartet har data for. Det er ikke nødvendigvis hele beholdningen; den står i interesseregisteret.</p>
  ${list.length > 5 ? `<details class="more"><summary>Vis alle ${list.length} handler</summary>${tradeTable(list)}</details>` : tradeTable(list)}`;
};

function renderRep(r) {
  const rg = r.reg, paras = PARA_ORDER.filter(k => rg[k]), g = govs.find(x => x.id === r.id);
  const coRows = [...r.cos].sort((a, b) => (b.roles?.[r.id] ? 1 : 0) - (a.roles?.[r.id] ? 1 : 0) || b.ans - a.ans).map(c => {
    const ro = c.roles?.[r.id], nr = org(c.nr).replace(/ /g, '');
    const sh = holdingFor(rg['9'], c.navn);
    return `<tr data-go="org-${nr}"><td><a href="#org-${nr}">${esc(c.navn)}</a><div class="meta">${esc(c.kommune || '–')}${flag(c.flag) ? ' · ' + flag(c.flag) : ''}${RS(c.nr)?.inn != null ? ` · omsetning ${money2(RS(c.nr).inn, RS(c.nr).valuta)} (${RS(c.nr).aar})` : ''}</div></td><td>${ro ? ro.map(x => `<span class="chip ok">${esc(x)}</span>`).join('') : '<span class="meta">Ingen rolle registrert</span>'}</td><td class="n">${sh ? esc(sh) : '–'}</td><td class="n hide-s">${c.ans > 0 ? nf(c.ans) : '–'}</td></tr>`;
  }).join('');
  const sum = r.trades.reduce((a, t) => a + t.ver, 0), om = S()?.oppmote[r.id];
  const partyLink = P?.partier[r.parti] ? `<a href="#parti-${r.parti}">${esc(D.parti[r.parti] || r.parti)}</a>` : esc(D.parti[r.parti] || r.parti);
  $('v-rep').innerHTML = `<a class="back" href="#stortinget">← Alle representanter</a>
  ${profileHead({ keys: ['rep:' + r.id, 'gov:' + r.id], navn: r.navn, parti: r.parti, follow: followBtn('rep', r.id),
    kicker: `${dot(r.parti)}${r.vara ? 'Møtende vararepresentant' : 'Stortingsrepresentant'}${g ? ` · <a href="#statsrad-${hid(g.id)}">${esc(g.tittel)}</a>` : ''}`,
    sub: `${partyLink} · ${esc(r.fylke)}${r.kom.length ? ' · ' + r.kom.map(k => esc(D.kom[k] || k)).join(', ') : ''}` })}
  <div class="kpis"><div><b>${num(r.q)}</b><span>spørsmål til regjeringen</span></div><div><b>${r.cos.length}</b><span>selskaper og organisasjoner</span></div><div><b>${r.trades.length}</b><span>aksjehandler${sum ? `, ${kr(sum)} kr` : ''}</span></div>${om ? `<div><b>${om[0] - om[1]} av ${om[0]}</b><span>personlige voteringer</span></div>` : ''}</div>
  ${toc([['s-om', 'Om'], ['s-bio', 'Biografi'], r.cos.length && ['s-cos', `Selskaper (${r.cos.length})`], r.trades.length && ['s-tr', `Aksjehandler (${r.trades.length})`], ['s-reg', 'Interesseregisteret'], ['s-q', 'Spørsmål'], ['s-lenker', 'Kilder']])}
  <div class="cols">
  ${sec('s-om', 'Om', `<dl class="facts">
    <dt>Parti</dt><dd>${partyLink}</dd><dt>Valgdistrikt</dt><dd>${esc(r.fylke)}</dd>
    <dt>Komité</dt><dd>${r.kom.length ? r.kom.map(k => esc(D.kom[k] || k)).join(', ') : '–'}</dd>
    <dt>Født</dt><dd>${esc(r.fodt || '–')}</dd>
    <dt>På Stortinget</dt><dd>${num(r.per)} ${r.per === 1 ? 'periode' : 'perioder'}${r.forst ? ` (første i ${esc(r.forst)})` : ''}</dd>
    ${r.utd ? `<dt>Utdanning</dt><dd>${esc(r.utd)}</dd>` : ''}${r.yrke ? `<dt>Yrke</dt><dd>${esc(r.yrke)}</dd>` : ''}
    ${payHtml(g ? (/^statsminister/i.test(g.tittel) ? 'pm' : 'gov') : 'rep')}
    ${om ? `<dt>Voteringer</dt><dd>Stemte i ${om[0] - om[1]} av ${om[0]} personlige voteringer. <span class="meta">I vanlige voteringer stemmer ofte bare rundt 101 representanter etter avtale mellom partiene, så tallet viser ikke fravær alene.</span></dd>` : ''}
  </dl>`)}
  ${sec('s-q', 'Spørsmål til regjeringen', `${r.q ? `<p>${num(r.q)} spørsmål denne perioden. Mest til ${r.top.map(t => `${esc(t.til)} (${num(t.n)})`).join(', ')}.</p>` : '<p class="empty">Ingen spørsmål denne perioden.</p>'}
  ${r.siste ? `<p><span class="meta">Siste, ${date(r.siste.d)} (${QTYPE[r.siste.t] || ''}):</span><br>«${esc(r.siste.tit)}» <a href="https://www.stortinget.no/no/Saker-og-publikasjoner/Sporsmal/${r.siste.t === 'I' ? 'Interpellasjoner/Interpellasjon/' : 'Skriftlige-sporsmal-og-svar/Skriftlig-sporsmal/'}?qnid=${encodeURIComponent(r.siste.id)}">Les svaret</a></p>` : ''}`)}
  </div>
  <div id="bioBox"></div>
  ${r.cos.length ? sec('s-cos', 'Selskaper', `<div class="tw"><table class="list"><thead><tr><th>Selskap</th><th>Rolle i Brønnøysund</th><th class="n">Eier (fra registeret)</th><th class="n hide-s">Ansatte</th></tr></thead><tbody>${coRows}</tbody></table></div>
  <p class="meta">Selskapene representanten har oppgitt i interesseregisteret. Rolle hentes fra Brønnøysundregistrene. Eierandel leses automatisk fra § 9 i interesseregisteret – sjekk teksten nederst på siden.</p>`) : ''}
  ${r.trades.length ? sec('s-tr', 'Aksjehandler', tradeBlock(r.trades)) : ''}
  ${sec('s-reg', 'Interesseregisteret', `${rg.ingen ? '<p>Har ingen registreringspliktige interesser.</p>' : paras.length ? `<dl class="facts reg">${paras.map(k => `<dt>§ ${k} ${PARA[k] || ''}</dt><dd>${esc(rg[k])}</dd>`).join('')}</dl>` : `<p class="empty">Ingen oppføringer.</p>`}
  <p class="meta">Ordrett fra Stortingets register, ajourført ${date(D.regDato, true)}.</p>`)}
  ${sec('s-lenker', 'Kilder', `<div class="links"><a href="https://www.stortinget.no/no/Representanter-og-komiteer/Representantene/Representant/?perid=${encodeURIComponent(r.id)}">Stortingets side</a>${D.regUrl ? `<a href="${url(D.regUrl)}">Interesseregisteret (PDF)</a>` : ''}${prof(['rep:' + r.id]).wiki ? `<a href="${url(prof(['rep:' + r.id]).wiki.url)}" rel="noopener">Wikipedia</a>` : ''}</div>`)}`;
  document.title = `${r.navn} – Maktkartet`;
  fillBio(r.id, 'bioBox');
}
const tradeTable = list => `<div class="tw"><table class="trades"><thead><tr><th>Dato</th><th>Handel</th><th>Selskap</th><th class="n hide-s">Antall</th><th class="n">Verdi, kr</th></tr></thead><tbody>${list.map(t => `<tr><td class="d">${sdate(t.d)}</td><td>${trade(t.k)}</td><td>${stockLink(t.sel)}</td><td class="n hide-s">${nf(t.ant)}</td><td class="n">${nf(t.ver)}</td></tr>`).join('')}</tbody></table></div>`;

/* ---------- regjeringen ---------- */
const govRank = t => /^statsminister/i.test(t) ? 0 : /finans/i.test(t) ? 1 : /utenriks/i.test(t) ? 2 : 3;
const govKeys = g => ['gov:' + g.id, 'rep:' + g.id];
function govView() {
  const list = [...govs].sort((a, b) => govRank(a.tittel) - govRank(b.tittel) || a.tittel.localeCompare(b.tittel, 'nb'));
  const ps = [...new Set(list.map(g => g.parti))].filter(Boolean);
  $('govLede').textContent = list.length ? `${list.length} statsråder fra ${ps.map(pname).join(', ')}. Klikk på en statsråd for å se verv, aksjer og aksjehandler.` : 'Fant ingen regjeringsmedlemmer i dataene.';
  $('govGrid').innerHTML = list.map(g => personCard({ href: `#statsrad-${hid(g.id)}`, keys: govKeys(g), navn: g.navn, parti: g.parti, rolle: g.tittel, meta: g.dep && g.dep !== g.tittel ? g.dep : '', badge: g.trades.length ? `${g.trades.length} aksjehandler` : '' })).join('');
  const SS = [...(D.pep?.statssek || [])].sort((a, b) => a.etternavn.localeCompare(b.etternavn, 'nb'));
  $('govSS').innerHTML = SS.length ? sec('g-ss', `Statssekretærer og politiske rådgivere (${SS.length})`, `<p class="meta">Fra regjeringens eget register over verv og økonomiske interesser${D.pep.kilder?.statssekDato ? `, versjon ${date(D.pep.kilder.statssekDato)}` : ''}. ${SS.filter(x => x.har).length} av ${SS.length} har registrert verv eller interesser. Registeret oppgir ikke stilling eller departement.</p>
  <div class="tw"><table class="list"><thead><tr><th>Navn</th><th>Registrert</th><th>Aksjer og eierandeler (ordrett)</th></tr></thead><tbody>${SS.map(x => `<tr><td><b>${esc(x.navn)}</b><div class="meta">${dot(pp(x.parti))}${esc(pname(pp(x.parti)))}</div></td><td>${x.har ? '<span class="chip ok">Har interesser</span>' : '<span class="meta">Ingen</span>'}</td><td>${x.felt?.aksjer && !/^nei\.?$/i.test(x.felt.aksjer.trim()) ? esc(x.felt.aksjer) : '<span class="meta">–</span>'}</td></tr>`).join('')}</tbody></table></div>
  ${D.pep.kilder?.statssek ? `<div class="links"><a href="${url(D.pep.kilder.statssek)}" rel="noopener">Regjeringens register (PDF)</a></div>` : ''}`) : '';
}
function personCard({ href, keys, navn, parti, rolle, meta = '', badge = '' }) {
  return `<a class="person" href="${hashLink(href)}">${avatar(keys, navn, parti, 'm')}<span class="pc"><b>${esc(navn)}</b><span>${esc(rolle)}</span>${meta ? `<span class="meta">${esc(meta)}</span>` : ''}<span class="meta">${parti ? dot(parti) + esc(pname(parti)) : ''}${badge ? ` · ${esc(badge)}` : ''}</span></span></a>`;
}
function renderMinister(g) {
  const reg = g.reg, paras = PARA_ORDER.filter(k => reg?.[k]), r = byId[g.id];
  $('v-minister').innerHTML = `<a class="back" href="#regjeringen">← Hele regjeringen</a>
  ${profileHead({ keys: govKeys(g), navn: g.navn, parti: g.parti, kicker: `${dot(g.parti)}${esc(g.tittel)}`, sub: `${g.dep ? esc(g.dep) + ' · ' : ''}${P?.partier[g.parti] ? `<a href="#parti-${g.parti}">${esc(pname(g.parti))}</a>` : esc(pname(g.parti))}${r ? ` · <a href="#rep-${r.h}">Også på Stortinget</a>` : ''}` })}
  <div class="kpis"><div><b>${g.trades.length}</b><span>aksjehandler meldt</span></div><div><b>${paras.length}</b><span>registrerte interesser</span></div>${D.godtgjoring ? `<div><b>${nf(/^statsminister/i.test(g.tittel) ? D.godtgjoring.statsminister : D.godtgjoring.statsrad)} kr</b><span>godtgjøring i året</span></div>` : ''}</div>
  <div id="bioBoxG"></div>
  ${g.trades.length ? sec('s-tr', 'Aksjehandler', tradeBlock(g.trades)) : ''}
  ${sec('s-reg', 'Interesseregisteret', !reg ? '<p class="empty">Står ikke i registeret ennå.</p>' : reg.ingen ? '<p>Har ingen registreringspliktige interesser.</p>' : paras.length ? `<dl class="facts reg">${paras.map(k => `<dt>§ ${k} ${PARA[k] || ''}</dt><dd>${esc(reg[k])}</dd>`).join('')}</dl><p class="meta">Ordrett fra regjeringsdelen av Stortingets register, ajourført ${date(D.regDato, true)}.</p>` : '<p class="empty">Ingen oppføringer.</p>')}
  ${sec('s-lenker', 'Kilder', `<div class="links">${D.regUrl ? `<a href="${url(D.regUrl)}">Interesseregisteret (PDF)</a>` : ''}<a href="https://www.regjeringen.no/no/om-regjeringa/" rel="noopener">Regjeringen.no</a>${prof(govKeys(g)).wiki ? `<a href="${url(prof(govKeys(g)).wiki.url)}" rel="noopener">Wikipedia</a>` : ''}</div>`)}`;
  document.title = `${g.navn} – Maktkartet`;
  fillBio(g.id, 'bioBoxG');
}

/* ---------- personsider for innsidere ---------- */
function renderPerson(x) {
  const keys = ['ins:' + x.s], buy = x.list.filter(i => i.k === 'K').reduce((a, i) => a + (i.ver || 0), 0), sell = x.list.filter(i => i.k === 'S').reduce((a, i) => a + (i.ver || 0), 0);
  const roles = [...new Map(x.list.map(i => [`${i.rolle || ''}|${i.sel}`, i])).values()];
  $('v-person').innerHTML = `<a class="back" href="#eiere">← Børs og eiere</a>
  ${profileHead({ keys, navn: x.navn, kicker: 'Primærinnsider på Oslo Børs', sub: roles.map(i => `${esc(i.rolle || 'Innsider')} i ${esc(i.sel)}`).join(' · ') })}
  ${x.pol ? `<p class="card">Navnet er også en politiker: ${x.pol.map(p => esc(p.navn) + ' (' + esc(p.gruppe) + ')').join(', ')}. Sjekk meldingen for å se om det er samme person.</p>` : ''}
  <div class="kpis"><div><b>${x.list.length}</b><span>meldte handler, 60 dager</span></div><div><b>${buy ? kr(buy) : '–'}</b><span>kjøpt for, kr</span></div><div><b>${sell ? kr(sell) : '–'}</b><span>solgt for, kr</span></div><div><b>${new Set(x.list.map(i => i.sel)).size}</b><span>selskaper</span></div></div>
  <div id="pBrreg"></div>
  ${sec('s-tr', 'Meldte handler', `<div class="tw"><table><thead><tr><th>Dato</th><th>Selskap</th><th>Melding</th><th class="n">Verdi, kr</th></tr></thead><tbody>${x.list.map(i => `<tr><td class="d">${sdate(i.d)}</td><td><b>${stocks.has(slug(i.tick || i.sel)) ? `<a href="#aksje-${slug(i.tick || i.sel)}">${esc(i.sel)}</a>` : esc(i.sel)}</b><div class="meta">${ITYPE[i.k] || '–'}</div></td><td>${esc(i.tekst || i.tittel)} <a href="${url(i.u)}" rel="noopener">Les meldingen</a></td><td class="n">${money(i)}</td></tr>`).join('')}</tbody></table></div>
  <p class="meta">Handler gjort av nærstående eller selskaper personen kontrollerer, står på personen som meldingen gjelder. Navn og beløp leses automatisk ut av meldingen og kan være feil – sjekk alltid meldingen.</p>`)}`;
  document.title = `${x.navn} – Maktkartet`;
  personBrreg(x);
}
/** Selskapene personen er innsider i, slått opp live i Enhetsregisteret: fakta + om rollen er registrert der. */
async function personBrreg(x) {
  const box = $('pBrreg'), sels = [...new Set(x.list.map(i => i.sel))].slice(0, 3), nn = s => String(s || '').toLowerCase().replace(/\b(asa|as|ab|ltd|limited|plc|\(publ\))\b|[^a-zæøå0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  box.innerHTML = sec('s-br', 'Selskapene i Brønnøysundregistrene', '<p class="loading">Henter fra Brønnøysund …</p>');
  const words = nn(x.navn).split(' ').filter(w => w.length > 1), out = [];
  for (const sel of sels) {
    try {
      const hits = await brSearch(sel), h = hits.find(c => nn(c.navn) === nn(sel)) || null;
      if (!h) { out.push(`<li><b>${esc(sel)}</b><div class="meta">Ikke registrert i Norge (utenlandsk selskap) eller ikke funnet entydig.</div></li>`); continue; }
      const e = await brEnhet(h.nr), me = (e?.personer || []).filter(p => words.every(w => nn(p.navn).split(' ').includes(w)));
      out.push(`<li><a href="#org-${h.nr}"><b>${esc(h.navn)}</b></a> <span class="meta">org.nr. ${org(h.nr)}</span><div class="meta">${esc(h.nar || h.formNavn)} · ${esc(h.kommune || '–')} · ${h.ans > 0 ? nf(h.ans) + ' ansatte' : 'ansatte ikke registrert'}</div>
        <div>${me.length ? me.map(p => `<span class="chip ok">Registrert: ${esc(p.rolle)}</span>`).join('') : '<span class="meta">Ikke blant de registrerte rollene. Det er vanlig for ledere som ikke er daglig leder, og for styreverv i morselskap.</span>'}</div></li>`);
    } catch { out.push(`<li><b>${esc(sel)}</b><div class="meta">Brønnøysund svarte ikke.</div></li>`); }
  }
  if (location.hash.slice(1) === 'person-' + x.s) box.innerHTML = sec('s-br', 'Selskapene i Brønnøysundregistrene', `<ul class="feed brl">${out.join('')}</ul><p class="meta">Slått opp live i Enhetsregisteret. Roller vises bare når navnet stemmer helt.</p>`);
}
/* ---------- aksjer og eiere (Oslo Børs) ---------- */
const coKey = s => String(s || '').toLowerCase().replace(/\((publ)\)|\b(asa|as|ab|ltd|limited|plc|sa|se|n\.v\.|inc|corp|holdings?|group)\b\.?/g, '').replace(/[^a-zæøåäö0-9]/g, '');
/** Finn aksjesiden til et selskapsnavn fra interesseregisteret («Nordic Semiconductor» → Nordic Semiconductor ASA). */
function stockByName(n) {
  const k = coKey(n); if (k.length < 3) return null;
  for (const st of stocks.values()) { const s2 = coKey(st.navn); if (s2 === k || (Math.min(s2.length, k.length) >= 5 && (s2.startsWith(k) || k.startsWith(s2)))) return st; }
  return null;
}
/** Lenker børsnoterte selskaper som nevnes i fritekst (f.eks. «Telenor ASA: 132 aksjer») til aksjesidene. */
function linkStocks(text) {
  let h = esc(text);
  const names = [...stocks.values()].map(st => ({ st, base: st.navn.replace(/\s+\b(ASA|AS|Ltd\.?|Limited|plc|SE|AB|N\.V\.|S\.A\.)$/i, '').replace(/\s+Holdings?$/i, '').trim() })).filter(x => x.base.length >= 4).sort((a, b) => b.base.length - a.base.length);
  for (const { st, base } of names) {
    const re = new RegExp(`(^|[^\\p{L}>])(${esc(base).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s+(?:ASA|AS|Ltd\\.?|plc))?)(?![\\p{L}<])`, 'iu');
    if (re.test(h) && !h.includes(`#aksje-${st.k}"`)) h = h.replace(re, `$1<a href="#aksje-${st.k}">$2</a>`);
  }
  return h;
}
const stockLink = n => { const st = stockByName(n); return st ? `<a href="#aksje-${st.k}">${esc(n)}</a>` : esc(n); };
const ownerLink = n => n && owners.has(slug(n)) ? `<a href="#eier-${slug(n)}">${esc(n)}</a>` : esc(n || '–');
const money = x => x.ver ? kr(x.ver) : x.bel ? `${nf(x.bel)} ${esc(x.cur)}` : '–';
const pct = v => v != null ? String(v).replace('.', ',') + ' %' : '–';
const arrow = r => r === 'opp' ? '<span class="k">▲ økte</span>' : r === 'ned' ? '<span class="s">▼ reduserte</span>' : '';

function renderStock(st) {
  const L = [...st.ins].sort((a, b) => b.d.localeCompare(a.d)), F = [...st.flag].sort((a, b) => b.d.localeCompare(a.d)), PT = [...st.pol].sort((a, b) => b.d.localeCompare(a.d));
  const buy = L.filter(x => x.k === 'K').reduce((a, x) => a + (x.ver || 0), 0), sell = L.filter(x => x.k === 'S').reduce((a, x) => a + (x.ver || 0), 0);
  // Innsidere i selskapet, oppsummert per person
  const per = new Map();
  for (const x of L) { const k = x.navn || '–'; const p = per.get(k) || { navn: x.navn, rolle: x.rolle, n: 0, k: 0, s: 0, ant: 0, d: x.d }; p.n++; if (x.k === 'K') { p.k += x.ver || 0; p.ant += x.ant || 0; } if (x.k === 'S') { p.s += x.ver || 0; p.ant -= x.ant || 0; } if (!p.rolle && x.rolle) p.rolle = x.rolle; per.set(k, p); }
  // Største eiere som har flagget: nyeste melding per eier
  const latest = [...new Map(F.filter(f => f.eier).map(f => [f.eier, f])).values()];
  const lastPrice = L.find(x => x.kurs && (!x.cur || x.cur === 'NOK'));
  $('v-stock').innerHTML = `<a class="back" href="#borsselskaper">← Alle børsselskaper</a>
  <div class="hrow"><div><div class="kicker">Børsnotert${st.tick ? ` · <span class="tick">${esc(st.tick)}</span>` : ''}</div><h1>${esc(st.navn)}</h1></div></div>
  ${st.om ? `<div class="wiki"><p>${esc(st.om)}</p><div class="meta">Selskapets egen beskrivelse, fra <a href="${url(st.omU)}" rel="noopener">børsmelding ${date(st.omDato)}</a></div></div>` : st.wdesc ? `<div class="wiki"><p>${esc(st.wdesc.charAt(0).toUpperCase() + st.wdesc.slice(1))}.</p><div class="meta">Fra Wikidata</div></div>` : '<p class="meta">Selskapet har ikke tatt med en beskrivelse av seg selv i børsmeldingene vi har lest.</p>'}
  ${L.length || F.length || PT.length ? `<div class="kpis"><div><b>${L.length}</b><span>innsidehandler, 60 dager</span></div><div><b>${buy ? kr(buy) : '–'}</b><span>kjøpt av innsidere, kr</span></div><div><b>${sell ? kr(sell) : '–'}</b><span>solgt av innsidere, kr</span></div><div><b>${F.length}</b><span>flaggemeldinger, 90 dager</span></div>${PT.length ? `<div><b>${new Set(PT.map(t => t.r.navn)).size}</b><span>politikere har handlet aksjen</span></div>` : ''}${lastPrice ? `<div><b>${lastPrice.kurs.toLocaleString('nb-NO')} kr</b><span>kurs i siste innsidehandel (${sdate(lastPrice.d)})</span></div>` : ''}</div>` : '<p class="meta">Ingen innsidehandler de siste 60 dagene og ingen flaggemeldinger de siste 90 dagene.</p>'}
  ${st.marked || st.web || st.stiftet || st.bransje?.length ? `<dl class="facts slim">${st.marked ? `<dt>Notert på</dt><dd>${esc(st.marked)}${st.tick ? ` · <span class="tick">${esc(st.tick)}</span>` : ''}</dd>` : ''}${st.bransje?.length ? `<dt>Bransje</dt><dd>${esc(st.bransje.join(', '))}</dd>` : ''}${st.stiftet ? `<dt>Stiftet</dt><dd>${esc(st.stiftet)}</dd>` : ''}${st.web ? `<dt>Nettsted</dt><dd><a href="${url(st.web)}" rel="noopener">${esc(st.web.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a></dd>` : ''}</dl>` : ''}
  ${toc([L.length && ['a-ins', `Innsidere (${per.size})`], latest.length && ['a-eiere', `Store eiere (${latest.length})`], PT.length && ['a-pol', `Politikere (${PT.length})`], donationsBy(st.navn) && ['s-pf', 'Bidrag til partier'], D.aksjer?.[st.tick || st.navn]?.nr && ['a-fin', 'Økonomi'], ['a-br', 'Brønnøysund'], ['a-kilder', 'Kilder']])}
  ${L.length ? sec('a-ins', 'Innsidere som har handlet', `<div class="tw"><table><thead><tr><th>Person</th><th class="n">Handler</th><th class="n">Netto aksjer</th><th class="n hide-s">Kjøpt, kr</th><th class="n hide-s">Solgt, kr</th></tr></thead><tbody>${[...per.values()].sort((a, b) => (b.k + b.s) - (a.k + a.s)).map(p => `<tr${p.navn && insiders.has(slug(p.navn)) ? ` data-go="person-${slug(p.navn)}"` : ''}><td><div class="who">${avatar(p.navn ? ['ins:' + slug(p.navn)] : [], p.navn || '?')}<div>${p.navn ? insiderLink(p.navn) : '<span class="meta">Navn ikke lest ut</span>'}<div class="meta">${esc(p.rolle || '')}</div></div></div></td><td class="n">${p.n}</td><td class="n">${p.ant ? `<b class="${p.ant > 0 ? 'pos' : 'neg'}">${p.ant > 0 ? '+' : ''}${nf(p.ant)}</b>` : '–'}</td><td class="n hide-s">${p.k ? kr(p.k) : '–'}</td><td class="n hide-s">${p.s ? kr(p.s) : '–'}</td></tr>`).join('')}</tbody></table></div>
  <details class="more"><summary>Vis alle ${L.length} meldinger</summary><div class="tw"><table><thead><tr><th>Dato</th><th>Melding</th><th class="n">Verdi</th></tr></thead><tbody>${L.map(x => `<tr><td class="d">${sdate(x.d)}</td><td><b>${ITYPE[x.k] || '–'}</b>${x.navn ? ' · ' + insiderLink(x.navn) : ''}<div class="meta">${esc(x.tekst || x.tittel)} <a href="${url(x.u)}" rel="noopener">Les meldingen</a></div></td><td class="n">${money(x)}</td></tr>`).join('')}</tbody></table></div></details>`) : ''}
  ${latest.length ? sec('a-eiere', 'Store eiere som har flagget', `<div class="tw"><table><thead><tr><th>Eier</th><th class="n">Andel</th><th>Endring</th><th class="n hide-s">Dato</th></tr></thead><tbody>${latest.map(f => `<tr><td>${ownerLink(f.eier)}</td><td class="n"><b>${pct(f.pst)}</b></td><td>${arrow(f.retning) || '–'} <a href="${url(f.u)}" rel="noopener" class="meta">melding</a></td><td class="n hide-s">${sdate(f.d)}</td></tr>`).join('')}</tbody></table></div>
  <p class="meta">Eiere må melde fra når de passerer 5, 10, 15, 20, 25, 1/3, 50, 2/3 og 90 % av aksjene. Listen viser bare dem som har flagget de siste 90 dagene, ikke hele eierlisten.</p>`) : ''}
  ${PT.length ? sec('a-pol', 'Politikere som har handlet aksjen', (() => {
    const pp = new Map();
    for (const t of PT) { const k = t.rep || t.pep; const g = pp.get(k) || { t, n: 0, net: 0, kr: 0, d: t.d }; g.n++; g.net += (t.k === 'K' ? 1 : t.k === 'S' ? -1 : 0) * (t.ant || 0); g.kr += t.ver || 0; if (t.d > g.d) g.d = t.d; pp.set(k, g); }
    const who = t => t.r.h ? `<a href="#rep-${t.r.h}">${esc(t.r.navn)}</a>` : t.pep && govById[t.pep] ? `<a href="#statsrad-${hid(t.pep)}">${esc(t.r.navn)}</a>` : esc(t.r.navn);
    return `<ul class="feed">${[...pp.values()].sort((a, b) => b.d.localeCompare(a.d)).map(g => `<li>${avatar(g.t.r.h ? ['rep:' + g.t.rep] : ['gov:' + g.t.pep], g.t.r.navn, g.t.r.parti)}<div class="grow">${who(g.t)} <span class="meta">${g.n} ${g.n === 1 ? 'handel' : 'handler'}</span><div class="meta">${esc(g.t.r.parti)} · siste ${sdate(g.d)}</div></div><b class="n ${g.net > 0 ? 'pos' : g.net < 0 ? 'neg' : ''}">${g.net > 0 ? '+' : ''}${nf(g.net)} aksjer</b></li>`).join('')}</ul>
    ${PT.length > 3 ? `<details class="more"><summary>Vis alle ${PT.length} handler</summary><ul class="feed">${PT.map(t => `<li><div class="grow">${who(t)} ${trade(t.k).toLowerCase()} ${nf(t.ant)} aksjer<div class="meta">${sdate(t.d)}</div></div><b class="n">${kr(t.ver)}</b></li>`).join('')}</ul></details>` : ''}
    <p class="meta">Fra Stortingets og regjeringens register over aksjehandler. Netto = kjøpt minus solgt.</p>`; })()) : ''}
  ${D.aksjer?.[st.tick || st.navn]?.nr ? finBlock(D.aksjer[st.tick || st.navn].nr, 'a-fin') : ''}
  ${donationHtml(st.navn)}
  <div id="aBrreg"></div>
  ${sec('a-kilder', 'Kilder', `<div class="links">${[...L, ...F].slice(0, 1).map(x => `<a href="${url(x.u)}" rel="noopener">Siste børsmelding (NewsWeb)</a>`).join('')}</div><p class="meta">Innsidehandler og flaggemeldinger fra Oslo Børs NewsWeb. Navn, beløp og andeler leses automatisk ut av meldingsteksten og kan være feil – sjekk alltid meldingen.</p>`)}`;
  document.title = `${st.navn} – Maktkartet`;
  stockBrreg(st);
}
/** Norske selskaper: slå opp i Enhetsregisteret live (bransje, ansatte, kommune, styre og ledelse). */
async function stockBrreg(st) {
  const box = $('aBrreg'), nn = s => String(s || '').toLowerCase().replace(/\b(asa|as|ab|ltd|limited|plc|\(publ\))\b|[^a-zæøå0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  if (!/\b(ASA|AS)\b/.test(st.navn)) { box.innerHTML = sec('a-br', 'Brønnøysundregistrene', '<p class="meta">Selskapet er registrert utenfor Norge, så det finnes ikke i Enhetsregisteret.</p>'); return; }
  box.innerHTML = sec('a-br', 'Brønnøysundregistrene', '<p class="loading">Henter fra Brønnøysund …</p>');
  try {
    const h = (await brSearch(st.navn)).find(c => nn(c.navn) === nn(st.navn));
    if (!h) throw 0;
    const e = await brEnhet(h.nr), roles = (e?.personer || []).filter(p => /leder|styre|daglig/i.test(p.rolle)).slice(0, 12);
    if (location.hash.slice(1) !== 'aksje-' + st.k) return;
    box.innerHTML = sec('a-br', 'Brønnøysundregistrene', `<dl class="facts"><dt>Org.nr.</dt><dd><a href="#org-${h.nr}">${org(h.nr)}</a></dd><dt>Bransje</dt><dd>${esc(h.nar || '–')}</dd><dt>Kommune</dt><dd>${esc(h.kommune || '–')}</dd><dt>Ansatte</dt><dd>${h.ans > 0 ? nf(h.ans) : 'ikke registrert'}</dd></dl>
      ${roles.length ? `<h3>Styre og ledelse</h3><ul class="feed">${roles.map(p => `<li><div class="grow">${insiders.has(slug(p.navn)) ? `<a href="#person-${slug(p.navn)}">${esc(p.navn)}</a>` : esc(p.navn)}<div class="meta">${esc(p.rolle)}</div></div></li>`).join('')}</ul>` : ''}<p class="meta">Slått opp live i Enhetsregisteret.</p>`);
  } catch { if (location.hash.slice(1) === 'aksje-' + st.k) box.innerHTML = sec('a-br', 'Brønnøysundregistrene', '<p class="meta">Fant ikke selskapet entydig i Enhetsregisteret.</p>'); }
}
function renderOwner(o) {
  const list = [...o.list].sort((a, b) => b.d.localeCompare(a.d)), latest = [...new Map(list.map(f => [f.sel, f])).values()];
  $('v-owner').innerHTML = `<a class="back" href="#storeeiere">← Store eiere</a>
  <div class="kicker">Eier som har flagget på Oslo Børs</div><h1>${esc(o.navn)}</h1>
  <div class="kpis"><div><b>${latest.length}</b><span>selskaper</span></div><div><b>${list.length}</b><span>flaggemeldinger, 90 dager</span></div><div><b>${list.filter(f => f.retning === 'opp').length} / ${list.filter(f => f.retning === 'ned').length}</b><span>økte / reduserte</span></div></div>
  ${sec('o-sel', 'Eierandeler', `<div class="tw"><table><thead><tr><th>Selskap</th><th class="n">Siste andel</th><th>Endring</th><th class="n">Dato</th></tr></thead><tbody>${latest.map(f => { const st = stocks.get(slug(f.tick || f.sel)); return `<tr${st ? ` data-go="aksje-${st.k}"` : ''}><td>${st ? `<a href="#aksje-${st.k}">${esc(f.sel)}</a>` : esc(f.sel)}</td><td class="n"><b>${pct(f.pst)}</b></td><td>${arrow(f.retning) || '–'}</td><td class="n">${sdate(f.d)}</td></tr>`; }).join('')}</tbody></table></div>`)}
  ${sec('o-all', 'Alle meldinger', `<ul class="feed">${list.map(f => `<li><div class="grow">${esc(f.tekst || f.tittel)} <a href="${url(f.u)}" rel="noopener">Les meldingen</a><div class="meta">${esc(f.sel)} · ${sdate(f.d)}</div></div></li>`).join('')}</ul><p class="meta">Store banker som Goldman Sachs og J.P. Morgan flagger ofte fordi de holder aksjer for kunder eller i forbindelse med utlån, ikke nødvendigvis som langsiktige eiere.</p>`)}`;
  document.title = `${o.navn} – Maktkartet`;
}

const insiderLink = n => n && insiders.has(slug(n)) ? `<a href="#person-${slug(n)}">${esc(n)}</a>` : esc(n || '–');

/* ---------- oversikt (forsiden) ---------- */
const cut = (t, n) => { t = String(t || ''); return t.length > n ? t.slice(0, n).replace(/\s\S*$/, '') + ' …' : t; };
const qUrl = q => `https://www.stortinget.no/no/Saker-og-publikasjoner/Sporsmal/${q.t === 'I' ? 'Interpellasjoner/Interpellasjon/' : 'Skriftlige-sporsmal-og-svar/Skriftlig-sporsmal/'}?qnid=${encodeURIComponent(q.id)}`;
// Forsiden er bevisst enkel: inngangene til hver del og tre høydepunkter. Detaljene bor på egne sider.
function homeView() {
  const L = D.innside || [];
  $('homeLede').textContent = 'Hva politikerne eier, hvilke aksjer de handler, hvem som eier børsen og hva partiene mener. Rett fra offentlige registre, med lenke til kilden.';
  const tile = (h, n, t, txt, u) => `<a class="tile" href="#${h}"><span class="tn">${n}<small>${u}</small></span><b>${t}</b><span>${txt}</span><i aria-hidden="true">→</i></a>`;
  $('homeTiles').innerHTML = [
    tile('stortinget', nf(reps.length), 'Stortinget', 'Representantene: verv, eierandeler, spørsmål og stemmer.', 'representanter'),
    tile('regjeringen', nf(govs.length), 'Regjeringen', 'Statsrådene og hva de eier.', 'statsråder'),
    tile('handler', nf(trades.length), 'Politikernes penger', 'Aksjehandler og aksjeposter fra folkevalgte.', 'aksjehandler'),
    tile('eiere', nf(L.length), 'Børs og eiere', 'Innsidehandler og store eiere på Oslo Børs.', 'innsidehandler siste 60 dager'),
    tile('faktasjekk', nf((D.tall || []).length), 'Faktasjekk', 'Sjekk påstander mot SSB og Norges Bank, og les faktasjekker.', 'nøkkeltall'),
    tile('forklart', nf(D.dummies?.tema?.length || 0), 'Politikk forklart', 'Sakene forklart. Se hvilke partier som er enige med deg.', 'saker'),
  ].join('');
  // Tre høydepunkter: siste politikerhandel, største innsidehandel og siste spørsmål
  const t = trades[0];
  const big = [...L].filter(x => x.ver && (x.k === 'K' || x.k === 'S')).sort((a, b) => b.ver - a.ver)[0];
  const q = reps.filter(r => r.siste?.d).sort((a, b) => b.siste.d.localeCompare(a.siste.d))[0];
  const hl = (lbl, href, body, meta) => `<div class="hl"><span class="lbl">${lbl}</span>${body}<div class="meta">${meta}</div><a class="more" href="${href}">Se alle →</a></div>`;
  $('homeHl').innerHTML = [
    t && hl('Siste aksjehandel', '#handler', `<p>${t.r.h ? `<a href="#rep-${t.r.h}">${esc(t.r.navn)}</a>` : esc(t.r.navn)} ${t.k === 'K' ? '<span class="k">kjøpte</span>' : t.k === 'S' ? '<span class="s">solgte</span>' : 'handlet'} ${stockLink(t.sel)}</p>`, `${nf(t.ver)} kr · ${sdate(t.d)} · ${esc(t.r.parti)}`),
    big && hl('Største innsidehandel', '#eiere', `<p>${big.navn ? insiderLink(big.navn) : esc(big.sel)} ${big.k === 'K' ? '<span class="k">kjøpte</span>' : '<span class="s">solgte</span>'} ${stockLink(big.sel)}</p>`, `${money(big)} · ${sdate(big.d)}`),
    q && hl('Siste spørsmål til regjeringen', '#sporsmal', `<p><a href="${url(qUrl(q.siste))}" rel="noopener">${esc(cut(q.siste.tit, 110))}</a></p>`, `<a href="#rep-${q.h}">${esc(q.navn)}</a> · ${esc(q.parti)} · ${date(q.siste.d)}`),
  ].filter(Boolean).join('');
  $('homeMeta').textContent = `Oppdatert ${date(D.hentet, true)}.`;
}
// Stortinget › Spørsmål: nyeste spørsmål fra hver representant, og hvem som spør mest.
function questionsView() {
  const qs = reps.filter(r => r.siste?.d).sort((a, b) => b.siste.d.localeCompare(a.siste.d));
  const top = [...reps].filter(r => r.q).sort((a, b) => b.q - a.q).slice(0, 10), max = top[0]?.q || 1;
  $('v-questions').innerHTML = `<h1>Spørsmål til regjeringen</h1><p class="lede">Representantene kan stille skriftlige spørsmål til statsrådene, som må svare. Her er det nyeste spørsmålet fra hver representant, og hvem som spør mest.</p>
  <div class="cols2"><section class="block"><div class="bh"><h2>Nyeste spørsmål</h2></div><ul class="feed">${qs.slice(0, 40).map(r => `<li>${avatar(['rep:' + r.id], r.navn, r.parti)}<div class="grow"><a href="${url(qUrl(r.siste))}" rel="noopener">${esc(r.siste.tit)}</a><div class="meta"><a href="#rep-${r.h}">${esc(r.navn)}</a> · ${esc(r.parti)} · ${date(r.siste.d)}</div></div></li>`).join('')}</ul></section>
  <section class="block"><div class="bh"><h2>Flest spørsmål denne perioden</h2></div><ul class="feed">${top.map(r => `<li>${avatar(['rep:' + r.id], r.navn, r.parti)}<div class="grow"><a href="#rep-${r.h}">${esc(r.navn)}</a><div class="dubar"><i style="width:${(100 * r.q / max).toFixed(0)}%;background:${col(r.parti)}"></i></div></div><b class="n">${nf(r.q)}</b></li>`).join('')}</ul></section></div>`;
}
/** Profilnøkler for en partileder: representant, statsråd eller egen partileder-profil. */
function leaderKeys(p) {
  const n = String(P?.partier[p]?.leder || '').replace(/\s*\(.*$/, '').trim().toLowerCase();
  const r = reps.find(x => x.navn.toLowerCase() === n), g = govs.find(x => x.navn.toLowerCase() === n);
  return [r && 'rep:' + r.id, g && 'gov:' + g.id, 'leder:' + p].filter(Boolean);
}

/* ---------- partier ---------- */
const pname = p => D.parti[p] || p;
const short = p => p === 'A' ? 'Ap' : p;
function partyOrder() { return Object.keys(P.partier).sort((a, b) => reps.filter(r => r.parti === b).length - reps.filter(r => r.parti === a).length || (P.maling?.snitt[b] || 0) - (P.maling?.snitt[a] || 0)); }
const newsList = list => `<ul class="news">${list.map(n => `<li><a href="${url(n.url)}" rel="noopener">${esc(n.tittel)}</a><div class="meta">${esc(n.kilde)} · ${date(n.dato)}</div></li>`).join('')}</ul>`;
function partiesView() {
  if (!P) { $('v-parties').innerHTML = '<h1>Partiene</h1><p class="empty">Partiinnhold mangler.</p>'; return; }
  $('partiesLede').textContent = `De ${Object.keys(P.partier).length} partiene på Stortinget: hva de vil, hva tilhengere og kritikere sier, og siste nytt. Oppdatert ${date(P.oppdatert, true)}.`;
  const fresh = P.naa && (Date.parse(D.hentet) - Date.parse(P.oppdatert)) / 864e5 <= 7, A = P.naaAuto;
  $('now').innerHTML = (fresh ? `<h3>Akkurat nå: ${esc(P.naa.tittel)}</h3><p>${esc(P.naa.tekst)}</p><div class="meta">Kilder: ${P.naa.kilder.map(k => `<a href="${url(k.url)}" rel="noopener">${esc(k.kilde)}</a>`).join(', ')}</div>` : '')
    + (A && (A.nyheter.length || A.vedtak.length) ? `<h3>${fresh ? 'Siste døgn' : 'Akkurat nå'}</h3>${A.nyheter.length ? `<ul class="news">${A.nyheter.map(n => `<li><a href="${url(n.url)}" rel="noopener">${esc(n.tittel)}</a><div class="meta">${esc(n.kilde)} · ${date(n.dato)} · ${n.ps.map(x => `${dot(x)}${esc(short(x))}`).join(' ')}</div></li>`).join('')}</ul>` : ''}${A.vedtak.length ? `<p class="meta"><b>Sist behandlet i Stortinget:</b> ${A.vedtak.map(v => `<a href="https://www.stortinget.no/no/Saker-og-publikasjoner/Saker/Sak/?p=${encodeURIComponent(v.sak)}" rel="noopener">${esc(v.tittel)}</a> (${sdate(v.d)})`).join(' · ')}</p>` : ''}<p class="meta">Hentes automatisk hver natt.</p>` : '');
  const U = P.maling?.utvikling || [];
  $('trendTitle').hidden = !U.length;
  $('trendTable').innerHTML = U.length ? `<thead><tr><th></th>${U.map(r => `<th>${esc(r.label)}</th>`).join('')}</tr></thead><tbody>${partyOrder().map(p => `<tr><th style="text-align:left">${dot(p)}${esc(short(p))}</th>${U.map((r, i) => { const v = r.snitt[p], pv = i ? U[i - 1].snitt[p] : v, d = v - pv; return `<td title="${d > 0 ? '+' : ''}${d.toFixed(1)}">${v != null ? num(v).toFixed(1).replace('.', ',') : '–'}${i && Math.abs(d) >= 1 ? (d > 0 ? ' ▲' : ' ▼') : ''}</td>`; }).join('')}</tr>`).join('')}</tbody>` : '';
  const order = partyOrder(), tot = reps.length;
  $('pollTable').tBodies[0].innerHTML = order.map(p => {
    const seats = reps.filter(r => r.parti === p).length, sp = 100 * seats / tot, poll = P.maling?.snitt[p];
    return `<tr data-go="parti-${p}"><td><a href="#parti-${p}">${dot(p)}${esc(pname(p))}</a></td><td class="n">${seats}</td><td class="n">${poll != null ? poll.toFixed(1).replace('.', ',') + ' %' : '–'}</td><td class="hide-s"><div class="pbar" title="Andel mandater ${sp.toFixed(1)} %, målinger ${poll ?? '–'} %"><s style="width:${Math.min(100, sp * 2.5)}%;background:${col(p)}"></s><i style="width:${Math.min(100, (poll || 0) * 2.5)}%;background:${col(p)};height:4px;top:3px"></i></div></td></tr>`;
  }).join('');
  $('pollSrc').innerHTML = P.maling ? `Målinger: <a href="${url(P.maling.url)}" rel="noopener">${esc(P.maling.kilde)}</a>. I stolpen er lys farge andel mandater i dag, tynn strek er snitt på målingene.` : '';
  $('pgrid').innerHTML = order.map(p => { const x = P.partier[p]; return `<a class="pcard" style="--pc:${col(p)}" href="#parti-${p}"><div class="who">${avatar(leaderKeys(p), x.leder, p)}<div><b>${esc(pname(p))}</b><div class="meta">${esc(x.leder)} · ${esc(x.rolle)}</div></div></div><ul>${x.saker.map(s => `<li>${esc(s.tittel)}</li>`).join('')}</ul></a>`; }).join('');
}
function leaderCard(p) {
  const x = P.partier[p], keys = leaderKeys(p), pr = prof(keys), r = keys[0]?.startsWith('rep:') && byId[keys[0].slice(4)], g = keys.find(k => k.startsWith('gov:'));
  const href = g ? `#statsrad-${hid(g.slice(4))}` : r ? `#rep-${r.h}` : '';
  return `${avatar(keys, x.leder, p, 'm')}<div><div class="kicker">Partileder</div><b>${href ? `<a href="${hashLink(href)}">${esc(x.leder)}</a>` : esc(x.leder)}</b>${pr.wiki ? `<p>${esc(pr.wiki.tekst)}</p><div class="meta">${wikiSrc(pr.wiki)}</div>` : ''}${credit(pr)}</div>`;
}
function partyVotes(p) {
  if (!S()) return '';
  const vs = S().voteringer.filter(v => v.pos[p]).slice(0, 12);
  const won = S().voteringer.filter(v => v.pos[p] === 'F' && v.vedtatt || v.pos[p] === 'M' && !v.vedtatt).length, n = S().voteringer.filter(v => v.pos[p] === 'F' || v.pos[p] === 'M').length;
  const most = PORDER().filter(q => q !== p && S().enighet[p]?.[q] != null).sort((a, b) => S().enighet[p][b] - S().enighet[p][a]);
  return `<h2 id="p-stem">Slik stemmer partiet</h2><p>På vinnende side i ${n ? Math.round(100 * won / n) : 0} % av ${n} voteringer. Stemmer oftest likt med ${most.slice(0, 2).map(q => `${esc(pname(q))} (${num(S().enighet[p][q])} %)`).join(' og ')}, sjeldnest med ${esc(pname(most.at(-1)))} (${num(S().enighet[p][most.at(-1)])} %).</p>
  ${(() => { const rowf = v => `<tr><td class="n">${sdate(v.d)}</td><td>${esc(v.tittel)}<div class="meta">${esc(v.tema)}</div></td><td>${posCell(p, v.pos[p])}</td><td class="${v.vedtatt ? 'k' : 's'}">${v.vedtatt ? 'Vedtatt' : 'Forkastet'}</td></tr>`; const tbl = l => `<div class="tw"><table><thead><tr><th>Dato</th><th>Sak</th><th>Stemte</th><th>Utfall</th></tr></thead><tbody>${l.map(rowf).join('')}</tbody></table></div>`; return tbl(vs.slice(0, 6)) + (vs.length > 6 ? `<details class="more"><summary>Vis ${vs.length - 6} til</summary>${tbl(vs.slice(6))}</details>` : ''); })()}<p class="meta"><a href="#voteringer">Alle voteringer</a></p>`;
}
function partyPromises(p) {
  const L = D.lofter; if (!L) return '';
  const own = L.regjering.parti === p ? `<h2 id="p-lofter">Løfter fra valget 2025</h2>${L.regjering.lofter.map(x => `<div class="prom"><h3>${stPill(x.status)} ${esc(x.lofte)}</h3><p>${esc(x.hva)}</p><div class="meta">${srcLinks(x.kilder)}</div></div>`).join('')}` : '';
  const gj = L.gjennomslag.partier[p] ? `<h2 id="p-gj">Gjennomslag</h2><ul>${L.gjennomslag.partier[p].map(g => `<li>${g.tap ? '✗ ' : '✓ '}<a href="${url(g.u)}" rel="noopener">${esc(g.sak)}</a></li>`).join('')}</ul>` : '';
  const fk = (D.faktasjekk?.sjekker || []).filter(x => (x.p || []).includes(p));
  const fl = fk.map(x => ({ tittel: x.t, url: x.u, kilde: 'Faktisk.no', dato: x.d }));
  return own + gj + (fk.length ? `<h2 id="p-fakta">Faktasjekker</h2>${newsList(fl.slice(0, 5))}${fl.length > 5 ? `<details class="more"><summary>Vis alle ${fl.length}</summary>${newsList(fl.slice(5))}</details>` : ''}` : '');
}
function renderParty(p) {
  const x = P.partier[p], mine = reps.filter(r => r.parti === p);
  const q = mine.reduce((a, r) => a + r.q, 0), tr = trades.filter(t => t.r.parti === p).length, co = new Set(mine.flatMap(r => r.cos.map(c => c.nr))).size;
  const auto = (P.auto?.[p] || []).filter(n => !x.nyheter.some(m => m.url === n.url));
  $('v-party').innerHTML = `<a class="back" href="#partier">← Alle partier</a>
  <div class="head"><div class="badge" style="background:${col(p)}">${esc(short(p))}</div><div><h1>${esc(pname(p))}</h1><div class="meta">${esc(x.rolle)}</div></div>${followBtn('parti', p)}</div>
  <p>${esc(x.om)}</p>
  <div class="leader">${leaderCard(p)}</div>
  <div class="kpis"><div><b>${mine.length}</b><span>mandater</span></div><div><b>${P.maling?.snitt[p] != null ? P.maling.snitt[p].toFixed(1).replace('.', ',') + ' %' : '–'}</b><span>snitt på målinger</span></div><div><b>${nf(q)}</b><span>spørsmål til regjeringen</span></div><div><b>${tr}</b><span>aksjehandler, ${co} selskaper</span></div></div>
  ${toc([['p-saker', 'Saker'], S() && ['p-stem', 'Stemmegivning'], D.lofter?.regjering?.parti === p && ['p-lofter', 'Løfter'], PF()?.partier?.[p] && ['p-penger', 'Penger'], D.lofter?.gjennomslag?.partier?.[p] && ['p-gj', 'Gjennomslag'], (D.faktasjekk?.sjekker || []).some(x => (x.p || []).includes(p)) && ['p-fakta', 'Faktasjekker'], ['p-nyheter', 'Nyheter'], ['p-reps', `Representanter (${mine.length})`]])}
  <h2 id="p-saker">Partiets saker, veid</h2><p class="meta">${esc(P.metode)}</p>
  ${x.saker.map(s => `<div class="sak"><h3>${esc(s.tittel)}</h3><p>${esc(s.standpunkt)}</p><div class="weigh"><div><h4>Tilhengere sier</h4><ul>${s.for.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div><div><h4>Kritikere sier</h4><ul>${s.mot.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div></div><div class="meta" style="margin-top:8px"><a href="${url(s.kilde)}" rel="noopener">Kilde</a></div></div>`).join('')}
  ${partyVotes(p)}
  ${partyPromises(p)}
  ${partyMoney(p)}
  <h2 id="p-nyheter">Nyheter</h2>${newsList(x.nyheter)}
  ${auto.length ? `<h3>Siste fra nyhetsstrømmen</h3>${newsList(auto)}<p class="meta">Hentet automatisk hver natt. Bare overskrift og lenke vises.</p>` : ''}
  <h2 id="p-reps">Representantene</h2><div class="tw"><table class="list"><thead><tr><th>Representant</th><th class="n">Spørsmål</th><th class="n">Selskaper</th><th class="n">Handler</th></tr></thead><tbody>${[...mine].sort((a, b) => b.q - a.q).map(r => `<tr data-go="rep-${r.h}"><td><div class="who">${avatar(['rep:' + r.id], r.navn, r.parti)}<div><a href="#rep-${r.h}">${esc(r.navn)}</a><div class="meta">${esc(r.fylke)}</div></div></div></td><td class="n">${num(r.q)}</td><td class="n">${r.cos.length}</td><td class="n">${r.trades.length}</td></tr>`).join('')}</tbody></table></div>`;
  document.title = pname(p) + ' – Maktkartet';
}


/* ---------- voteringer ---------- */
const S = () => D.stemmer;
const posCell = (p, x) => `<span class="pos pos-${{ F: 'F', M: 'M', D: 'D' }[x] || '-'}" title="${esc(pname(p))}: ${x === 'F' ? 'for' : x === 'M' ? 'mot' : x === 'D' ? 'delt' : 'ikke med'}">${esc(short(p))}</span>`;
const PORDER = () => [...new Set([...ORDER, ...Object.keys(D.parti)])];
function votesView() {
  if (!S()) { $('v-votes').innerHTML = '<h1>Voteringer</h1><p class="empty">Voteringsdata mangler.</p>'; return; }
  $('votesLede').textContent = `Slik stemte partiene i de siste ${S().antall} personlige voteringene i Stortinget (${date(S().fra)} – ${date(S().til)}). Velg et parti for å se hvordan det stemte.`;
  const p = $('vp').value, f = $('vf').value;
  const list = S().voteringer.filter(v => (!p || v.pos[p]) && (f !== 'vedtatt' || v.vedtatt) && (f !== 'tapt' || !v.vedtatt) && (f !== 'tett' || Math.abs(v.for - v.mot) < 10));
  $('voteTable').tBodies[0].innerHTML = list.map(v => `<tr><td class="n">${sdate(v.d)}</td><td><a href="https://www.stortinget.no/no/Saker-og-publikasjoner/Saker/Sak/?p=${encodeURIComponent(v.sak)}" rel="noopener">${esc(v.tittel)}</a><div class="meta">${esc(v.tema)}</div>${p ? `<div style="margin-top:4px">${posCell(p, v.pos[p])} stemte ${v.pos[p] === 'F' ? 'for' : v.pos[p] === 'M' ? 'mot' : 'delt'}</div>` : ''}</td><td><b class="${v.vedtatt ? 'k' : 's'}">${v.vedtatt ? 'Vedtatt' : 'Forkastet'}</b><div class="meta">${num(v.for)}–${num(v.mot)}</div></td><td class="hide-s">${PORDER().filter(x => v.pos[x]).map(x => posCell(x, v.pos[x])).join('')}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Ingen voteringer.</td></tr>';
}
function agreeView() {
  if (!S()) return;
  $("agreeLede").textContent = `Basert på ${S().enighetN || S().antall} voteringer fra ${date(S().fra)} til ${date(S().til)}. Tallet viser hvor ofte to partier stemte likt.`;
  const ps = PORDER().filter(p => S().enighet[p]);
  $('agreeTable').innerHTML = `<thead><tr><th></th>${ps.map(p => `<th>${dot(p)}${esc(short(p))}</th>`).join('')}</tr></thead><tbody>${ps.map(a => `<tr><th style="text-align:left">${dot(a)}${esc(short(a))}</th>${ps.map(b => { const v = S().enighet[a][b]; return `<td style="background:rgb(11 79 214/${a === b ? 0 : ((v || 0) / 100) ** 2 * .8});${(v || 0) > 70 && a !== b ? 'color:#fff' : ''}">${a === b ? '–' : v == null ? '–' : num(v)}</td>`; }).join('')}</tr>`).join('')}</tbody>`;
}

/* ---------- løfter ---------- */
const STCLS = { 'Innfridd': 'ok', 'Delvis': 'part', 'Pågår': 'go', 'Bak skjema': 'late', 'Ikke innfridd': 'bad', 'Brutt': 'bad', 'Brutt og rettet': 'fix' };
const stPill = s => `<span class="st st-${STCLS[s] || 'go'}">${esc(s)}</span>`;
const srcLinks = ks => ks.map(k => `<a href="${url(k.u)}" rel="noopener">${esc(k.t)}</a>`).join(' · ');
let promStatus = '';
const promLatest = x => (x.siste?.length || x.voteringer?.length) ? `<details><summary>Siste om dette (oppdateres automatisk)</summary>${x.siste?.length ? newsList(x.siste) : ''}${x.voteringer?.length ? `<ul class="news">${x.voteringer.map(v => `<li>${esc(v.tittel)} – ${esc(v.tema)}<div class="meta">${sdate(v.d)} · <b class="${v.vedtatt ? 'k' : 's'}">${v.vedtatt ? 'Vedtatt' : 'Forkastet'}</b> ${num(v.for)}–${num(v.mot)}</div></li>`).join('')}</ul>` : ''}</details>` : '';
function promisesView() {
  const L = D.lofter; if (!L) { $('v-promises').innerHTML = '<h1>Løfter og resultater</h1><p class="empty">Mangler innhold.</p>'; return; }
  $('promLede').textContent = `${L.regjering.tittel}. ${L.metode}`;
  const sts = [...new Set(L.regjering.lofter.map(x => x.status))];
  $('promFilter').innerHTML = ['', ...sts].map(s => `<button class="filterbtn" data-st="${esc(s)}" aria-pressed="${s === promStatus}">${s ? esc(s) + ' (' + L.regjering.lofter.filter(x => x.status === s).length + ')' : 'Alle (' + L.regjering.lofter.length + ')'}</button>`).join('');
  $('promList').innerHTML = L.regjering.lofter.filter(x => !promStatus || x.status === promStatus).map(x => `<div class="prom"><h3>${stPill(x.status)} ${esc(x.lofte)}</h3><div class="meta">Lovet av: ${esc(x.lovet)}</div><p>${esc(x.hva)}</p><div class="meta">Kilder: ${srcLinks(x.kilder)}</div>${promLatest(x)}</div>`).join('');
  $('gjTitle').textContent = L.gjennomslag.tittel; $('gjText').textContent = L.gjennomslag.tekst;
  $('gjGrid').innerHTML = PORDER().filter(p => L.gjennomslag.partier[p]).map(p => `<div class="pcard" style="--pc:${col(p)}"><b><a href="#parti-${p}">${esc(pname(p))}</a></b><div class="meta">${esc(P?.partier[p]?.rolle || '')}</div><ul>${L.gjennomslag.partier[p].map(g => `<li>${g.tap ? '✗ ' : '✓ '}<a href="${url(g.u)}" rel="noopener">${esc(g.sak)}</a></li>`).join('')}</ul></div>`).join('');
}

/* ---------- kilder og metode ---------- */
// Hver kilde vises med hva den gir, hvor mye vi har fra den nå, hvor ofte den hentes og lenke. Tallene regnes ut fra dataene.
function omView() {
  const tid = d => d ? new Date(d).toLocaleString('nb-NO', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '–';
  const host = u => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return u; } };
  const warn = w => esc(w.replace(/\(?(HTTP \d+ )?https?:\/\/\S+\)?/g, (m, h) => `(${h ? h.trim() + ', ' : ''}${host(m.replace(/^\(?(HTTP \d+ )?|\)$/g, ''))})`));
  const spm = reps.reduce((a, r) => a + num(r.q), 0), outlets = [...new Set(allNews().map(n => n.kilde))].sort((a, b) => a.localeCompare(b, 'nb'));
  const card = (navn, u, hva, mengde, ofte, lisens = '') => `<div class="src"><div class="src-h"><b>${esc(navn)}</b>${u ? `<a href="${url(u)}" rel="noopener">${esc(host(u))} ↗</a>` : ''}</div><p>${hva}</p><div class="src-m">${mengde ? `<span class="chip">${mengde}</span>` : ''}<span class="chip">${esc(ofte)}</span>${lisens ? `<span class="chip">${esc(lisens)}</span>` : ''}</div></div>`;
  const grp = (t, intro, cards) => `<section class="srcg"><h2>${t}</h2>${intro ? `<p class="meta">${intro}</p>` : ''}<div class="srcs">${cards.join('')}</div></section>`;
  $('v-om').innerHTML = `<div class="hero"><h1>Kilder og metode</h1><p class="lede">Alt på Maktkartet kommer fra offentlige kilder, og vi lenker alltid til originalen. Her ser du hvor hver opplysning kommer fra, hvor mye vi har hentet, og hvor ofte den oppdateres.</p></div>
  <div class="status"><span class="pulse" aria-hidden="true"></span><div><b>Sist oppdatert ${tid(D.hentet)}</b><div class="meta">Nettstedet bygges på nytt automatisk hver tredje time. Interesseregisteret er fra ${date(D.regDato, true)}.</div></div></div>
  ${D.warnings?.length ? `<details class="card warnbox"><summary><b>${D.warnings.length} ${D.warnings.length === 1 ? 'merknad' : 'merknader'} fra siste oppdatering</b> <span class="meta">– det som ikke kunne hentes, vises fra forrige versjon</span></summary><ul>${D.warnings.map(w => `<li>${warn(w)}</li>`).join('')}</ul></details>` : ''}
  ${grp('Politikerne', '', [
    card('Stortingets åpne data', 'https://data.stortinget.no/', 'Representanter, partier, komiteer og alle spørsmål de stiller regjeringen.', `${nf(reps.length)} representanter · ${nf(spm)} spørsmål`, 'Hver tredje time', 'NLOD'),
    card('Stortingets interesseregister', D.regUrl || 'https://www.stortinget.no/no/Representanter-og-komiteer/Representantene/Okonomiske-interesser/', 'Verv, eierandeler, gaver, reiser og aksjehandler. Gjengitt ordrett slik Stortinget publiserer det.', `${nf(D.trades.length)} aksjehandler`, 'Ved hver ny utgave'),
    card('Regjeringens interesseregister', D.pep?.kilder?.regjering, 'Statsrådenes verv og eierandeler, fra regjeringsdelen av registeret.', `${nf(govs.length)} statsråder`, 'Ved hver ny utgave'),
    card('Register for statssekretærer og rådgivere', D.pep?.kilder?.statssek, 'Verv og økonomiske interesser for politisk ansatte i departementene.', `${nf(D.pep?.statssek?.length || 0)} personer`, D.pep?.kilder?.statssekDato ? 'Versjon ' + date(D.pep.kilder.statssekDato) : 'Ved hver ny utgave'),
    card('Stortingets biografier', 'https://data.stortinget.no/', 'Utdanning, yrke, verv i parti, kommune og organisasjoner, stortingsperioder, komiteer og perioder i regjering. Foreldre og fødested vises ikke.', `${nf(Object.keys(BIO || {}).length || reps.length)} biografier`, 'Hver uke', 'NLOD'),
    card('Godtgjøring', D.godtgjoring?.url, 'Hva representanter, statsråder og statsministeren får i året, slik Stortinget har vedtatt.', D.godtgjoring ? 'Fra ' + date(D.godtgjoring.fra) : '', 'Hvert år'),
    card('Voteringer', 'https://www.stortinget.no/no/Saker-og-publikasjoner/Vedtak/Voteringer/', 'Hvordan hver representant stemte. «Hvem stemmer med hvem» og oppmøte regnes ut fra dette.', `${nf(S()?.voteringer?.length || 0)} voteringer`, 'Hver tredje time', 'NLOD'),
  ])}
  ${grp('Selskaper og børs', 'Børsmeldinger tolkes automatisk. Tallene kan derfor ha feil, og hver handel lenker til den originale meldingen.', [
    card('Enhetsregisteret', 'https://data.brreg.no/enhetsregisteret/oppslag/enheter', 'Selskapsopplysninger og alle registrerte roller. Søk på selskaper hentes direkte fra Brønnøysund.', `${nf(D.cos.length)} selskaper med politikere`, 'Hver tredje time', 'NLOD'),
    card('Regnskapsregisteret', 'https://data.brreg.no/regnskapsregisteret/regnskap/', 'Driftsinntekter, resultat, egenkapital og eiendeler fra siste innsendte årsregnskap.', `${nf(Object.keys(D.regnskap || {}).length)} regnskap`, 'Hver uke', 'NLOD'),
    card('Oslo Børs: selskapene', 'https://newsweb.oslobors.no/', 'Hvilke aksjeselskaper som er notert, og selskapets egen beskrivelse fra halvårs- og årsrapportene.', `${nf([...stocks.values()].filter(s => s.notert).length)} selskaper`, 'Hver uke'),
    card('Wikidata', 'https://www.wikidata.org/', 'Nettsted, stiftelsesår og bransje for børsselskaper.', '', 'Hver uke', 'CC0'),
    card('Oslo Børs: innsidehandel', 'https://newsweb.oslobors.no/', 'Meldepliktige handler fra styremedlemmer, ledere og deres nærstående.', `${nf(D.innside?.length || 0)} handler siste 60 dager`, 'Hver tredje time'),
    card('Oslo Børs: flaggemeldinger', 'https://newsweb.oslobors.no/', 'Når noen eier mer eller mindre enn 5, 10, 15 % osv. av et børsselskap.', `${nf(D.flagging?.length || 0)} meldinger`, 'Hver tredje time'),
  ])}
  ${grp('Tall og fakta', '', [
    card('SSB – Statistikkbanken', 'https://www.ssb.no/statbank', 'Ledighet, prisvekst, BNP, boligpriser, befolkning, innvandring og lovbrudd i «Tall i debatten».', `${nf((D.tall || []).filter(t => !/Norges Bank/.test(t.kilde || '')).length)} nøkkeltall`, 'Hver tredje time', 'CC BY 4.0'),
    card('Norges Bank', 'https://www.norges-bank.no/tema/pengepolitikk/styringsrenten/', 'Styringsrenten.', '1 nøkkeltall', 'Hver tredje time'),
    card('Faktisk.no', 'https://www.faktisk.no/', 'Faktasjekker fra den uavhengige redaksjonen Faktisk.no.', `${nf(D.faktasjekk?.sjekker?.length || 0)} saker`, 'Hver tredje time'),
    card('Poll of polls', 'https://www.pollofpolls.no/', 'Gjennomsnitt av meningsmålingene for stortingsvalg.', '', 'Hver tredje time'),
  ])}
  ${grp('Partier, løfter og Politikk forklart', 'Dette er skrevet for hånd og gjennomgått på datoene som står under. Hvert standpunkt og hver status har egne kilder.', [
    card('Partiprogrammer 2025–2029', '', 'Hva partiene står for, hvem som støtter og kritiserer dem, og partienes standpunkter i Politikk forklart.', `${nf(D.dummies?.tema?.length || 0)} saker forklart`, D.dummies?.oppdatert ? 'Gjennomgått ' + date(D.dummies.oppdatert) : 'Manuelt'),
    card('Partifinansiering.no', PF()?.url || 'https://www.partifinansiering.no/', 'Bidrag til partiene fra selskaper, organisasjoner og privatpersoner. Navn på privatpersoner vises ikke, bare summen.', PF() ? `${PF().aar[0]}–${PF().aar[PF().aar.length - 1]}` : '', 'Hver dag'),
    card('Løfter og gjennomslag', '', 'Valgløfter fra 2025 sammenholdt med budsjetter, vedtak, SSB og nyheter.', '', D.lofter?.oppdatert ? 'Gjennomgått ' + date(D.lofter.oppdatert) : 'Manuelt'),
  ])}
  ${grp('Bilder og omtaler', '', [
    card('Stortingets portretter', 'https://www.stortinget.no/', 'Offisielle portretter av representanter og statsråder.', '', 'Ved endring', 'Foto: Stortinget'),
    card('Wikipedia, Wikidata og Wikimedia Commons', 'https://www.wikidata.org/', 'Kort omtale og bilde av ledere og eiere. Brukes bare når artikkelen beviselig gjelder riktig person, med riktig yrke og selskap.', `${nf(Object.keys(D.profiler || {}).length)} profiler`, 'Hver tredje time', 'CC BY-SA 4.0'),
  ])}
  ${outlets.length ? `<section class="srcg"><h2>Nyhetskilder</h2><p class="meta">Overskrifter hentes fra et bredt spekter, fra venstre til høyre, og knyttes til partiene de nevner. Bare tittel og lenke vises.</p><div class="chips">${outlets.map(o => `<span class="chip">${esc(o)}</span>`).join('')}</div></section>` : ''}
  <section class="srcg"><h2>Slik jobber vi</h2><div class="principles">
    <div><b>Ordrett fra kilden</b><p>Registertekster vises slik de står. Vi tar ikke bort noe og legger ikke til noe.</p></div>
    <div><b>Alltid lenke</b><p>Alle tall, handler og standpunkter har lenke, så du kan sjekke selv.</p></div>
    <div><b>Sikker kobling</b><p>En politiker regnes som bekreftet i et selskap bare når både navn og fødselsdato stemmer i Brønnøysund. Ellers merkes det «Oppgitt».</p></div>
    <div><b>Ingen privatpersoner</b><p>Vi viser ikke fødselsdatoer, adresser eller telefonnummer, og du kan ikke søke etter privatpersoner. Det er ikke informasjon om makt.</p></div>
  </div></section>
  <section class="card fix"><h2>Fant du en feil?</h2><p>Automatisk tolkning av registre og børsmeldinger kan bli feil. Si fra, så retter vi det.</p><a class="btn" href="https://github.com/tobiasskorstad/eye/issues/new" rel="noopener">Meld en feil</a> <a href="#personvern">Les om personvern</a></section>`;
}

/* ---------- nyheter ---------- */
function allNews() {
  if (!P) return [];
  const m = new Map();
  for (const p of Object.keys(P.partier)) {
    for (const n of [...P.partier[p].nyheter, ...(P.auto?.[p] || [])]) {
      const x = m.get(n.url) || { ...n, ps: [] };
      if (!x.ps.includes(p)) x.ps.push(p);
      m.set(n.url, x);
    }
  }
  return [...m.values()].sort((a, b) => (b.dato || '').localeCompare(a.dato || ''));
}
function newsView() {
  const all = allNews();
  $('newsLede').textContent = `${all.length} saker fra ${new Set(all.map(n => n.kilde)).size} kilder – riksmedier, regionale og alternative medier fra både høyre og venstre. Overskrifter hentes automatisk hver natt; bare tittel og lenke vises.`;
  const p = $('np').value, s = $('ns').value;
  $('newsList').innerHTML = all.filter(n => (!p || n.ps.includes(p)) && (!s || n.kilde === s)).map(n => `<li><a href="${url(n.url)}" rel="noopener">${esc(n.tittel)}</a><div class="meta">${esc(n.kilde)} · ${date(n.dato)} · ${n.ps.map(x => `${dot(x)}${esc(short(x))}`).join(' ')}</div></li>`).join('') || '<li class="empty">Ingen saker.</li>';
}

/* ---------- faktasjekk ---------- */
/** Liten kurve (SVG) av en tallserie. */
function spark(vals) {
  const v = (vals || []).filter(x => x != null); if (v.length < 2) return '';
  const lo = Math.min(...v), hi = Math.max(...v), w = 120, h = 32, sx = w / (v.length - 1), sy = hi === lo ? 0 : (h - 4) / (hi - lo);
  const pts = v.map((y, i) => `${(i * sx).toFixed(1)},${(h - 2 - (y - lo) * sy).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
}
const fmtNum = (x, d) => x == null ? '–' : Number(x).toLocaleString('nb-NO', { minimumFractionDigits: d, maximumFractionDigits: d });
function factsView() {
  const T = D.tall || [];
  $('tallGrid').innerHTML = T.map(t => {
    const unit = t.enhet === '%' ? ' %' : t.enhet === 'indeks' ? '' : '';
    const diff = t.før ? (t.enhet === '%' ? `${t.verdi >= t.før.verdi ? '+' : '−'}${fmtNum(Math.abs(t.verdi - t.før.verdi), t.des)} prosentpoeng` : t.endringPst != null ? `${t.endringPst >= 0 ? '+' : '−'}${fmtNum(Math.abs(t.endringPst), 1)} %` : '') : '';
    return `<a class="stat" href="${url(t.url)}" rel="noopener"><span class="st-t">${esc(t.tittel)}</span><b>${fmtNum(t.verdi, t.des)}${unit}</b><span class="st-u">${t.enhet !== '%' && t.enhet !== 'indeks' ? esc(t.enhet) + ' · ' : ''}${esc(t.periode)}</span>${spark(t.serie)}
      ${t.før ? `<span class="st-c">${diff ? `<b class="${/^\+/.test(diff) ? 'up' : 'down'}">${diff}</b> ` : ''}siden ${esc(t.før.periode)}${t.enhet === '%' ? ` (${fmtNum(t.før.verdi, t.des)} %)` : ''}</span>` : ''}
      <span class="st-f">${esc(t.forklaring)}</span><span class="st-k">Kilde: ${esc(t.kilde)}</span></a>`;
  }).join('') || '<p class="empty">Tallene kunne ikke hentes.</p>';
  $('tallOppd').textContent = T.length ? `Hentet ${date(D.hentet, true)}` : '';
  const F = D.faktasjekk; if (!F) return;
  const stille = F.nyeste && (Date.now() - Date.parse(F.nyeste)) / 864e5 > 30;
  $('factsLede').textContent = `${F.om}${stille ? ` Faktisk.no publiserer sjelden nå – siste sak er fra ${date(F.nyeste)}. Derfor viser vi også offisielle tall over.` : ''}`;
  const p = $('fp').value, ty = $('ft').value;
  $('factList').innerHTML = F.sjekker.filter(x => (!p || (x.p || []).includes(p)) && (!ty || (x.type || 'faktasjekk') === ty)).slice(0, 60).map(x => `<li><a href="${url(x.u)}" rel="noopener">${esc(x.t)}</a><div class="meta">Faktisk.no · ${x.type === 'artikkel' ? 'artikkel' : 'faktasjekk'} · ${x.d ? date(x.d) : 'uten dato'}${(x.p || []).length ? ' · ' + x.p.map(y => `${dot(y)}${esc(short(y))}`).join(' ') : ''}</div></li>`).join('') || '<li class="empty">Ingen treff.</li>';
  $('factCrit').innerHTML = F.kritikk.map(x => `<li><a href="${url(x.u)}" rel="noopener">${esc(x.t)}</a><div class="meta">${date(x.d)}</div></li>`).join('');
  $('factSelf').innerHTML = F.selv.map(x => `<li><a href="${url(x.u)}" rel="noopener">${esc(x.t)}</a></li>`).join('');
}

/* ---------- politikk forklart ---------- */
// Svarene holdes bare i minnet. Ingenting lagres, sendes eller legges i adressen (med mindre brukeren selv samtykker på kontoen sin).
const DU = { sel: new Set(), ans: {}, vik: {}, tab: 'test', i: 0 };
const SCALE = [[-2, 'Helt uenig'], [-1, 'Litt uenig'], [0, 'Nøytral'], [1, 'Litt enig'], [2, 'Helt enig']];
const SLABEL = Object.fromEntries(SCALE);
const ABC = () => Object.keys(D.dummies?.tema[0]?.partier || {}).sort((a, b) => pname(a).localeCompare(pname(b), 'nb'));
const DUTABS = [['test', 'Ta testen'], ['tabell', 'Partiene sak for sak'], ['storting', 'Slik styres Norge'], ['ord', 'Ordliste']];
function dummiesView() {
  const X = D.dummies; if (!X) { $('v-dummies').innerHTML = '<h1>Politikk forklart</h1><p class="empty">Mangler innhold.</p>'; return; }
  $('duTabs').innerHTML = DUTABS.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${DU.tab === k}">${l}</button>`).join('');
  $('duMethod').textContent = X.metode + ` Sist gjennomgått ${date(X.oppdatert, true)}.`;
  const p = $('duPanel');
  if (DU.tab === 'tabell') p.innerHTML = duMatrix();
  else if (DU.tab === 'storting') p.innerHTML = duBasics();
  else if (DU.tab === 'ord') p.innerHTML = `<dl class="gloss">${X.ordliste.map(o => `<div><dt>${esc(o.ord)}</dt><dd>${esc(o.forklaring)}</dd></div>`).join('')}</dl>`;
  else p.innerHTML = duTest();
  duSaveBox();
}
function duTest() {
  const T = D.dummies.tema, n = T.length, done = T.filter(t => DU.ans[t.id] != null).length;
  const dots = `<div class="qdots" aria-label="Sakene">${T.map((t, i) => `<button data-go-q="${i}" class="${DU.ans[t.id] != null ? 'done' : ''}${i === DU.i ? ' cur' : ''}" title="${esc(t.navn)}" aria-label="Sak ${i + 1}: ${esc(t.navn)}"></button>`).join('')}</div>`;
  const main = DU.i >= n ? duFinal() : duQuestion(T[DU.i], DU.i, n);
  return `<div class="qwrap"><div class="qmain"><div class="qtop"><span>${DU.i >= n ? 'Resultat' : `Sak ${DU.i + 1} av ${n}`}</span><span class="meta">${done} besvart</span></div>${dots}${main}</div>
  <aside class="qside" aria-label="Resultat så langt">${duMini()}</aside></div>`;
}
function duQuestion(t, i, n) {
  const votes = (S()?.voteringer || []).filter(v => new RegExp(t.sok, 'i').test(v.tittel + ' ' + v.tema)).slice(0, 3);
  const byPos = SCALE.map(([v, l]) => `<div><b>${l}</b>${ABC().filter(p => t.partier[p] === v).map(p => `<span title="${esc(pname(p))}${t.merk?.[p] ? ': ' + esc(t.merk[p]) : ''}">${dot(p)}${esc(short(p))}</span>`).join('') || '<span class="meta">–</span>'}</div>`).join('');
  return `<article class="q" id="du-${esc(t.id)}"><h2>${esc(t.navn)}</h2><p class="qintro">${esc(t.kort)}</p>
  <div class="pc2"><div><span class="lbl">For</span>${esc(t.for)}</div><div><span class="lbl">Mot</span>${esc(t.mot)}</div></div>
  <p class="claim">${esc(t.pastand)}</p>
  <div class="seg" role="group" aria-label="Hva mener du">${SCALE.map(([v, l]) => `<button data-a="${esc(t.id)}" data-v="${v}" aria-pressed="${DU.ans[t.id] === v}">${l}</button>`).join('')}</div>
  <div class="qnav"><label class="imp"><input type="checkbox" data-w="${esc(t.id)}" ${DU.vik[t.id] ? 'checked' : ''}> Ekstra viktig for meg</label>
  <span class="qbtn">${i > 0 ? `<button class="ghost" data-go-q="${i - 1}">← Forrige</button>` : ''}<button class="ghost" data-go-q="${i + 1}">${DU.ans[t.id] != null ? 'Neste →' : 'Hopp over →'}</button></span></div>
  <details class="qmore"><summary>Hva partiene mener</summary><div class="scale">${byPos}</div>
  ${ABC().some(p => t.merk?.[p]) ? `<ul class="notes">${ABC().filter(p => t.merk?.[p]).map(p => `<li>${dot(p)}<b>${esc(short(p))}:</b> ${esc(t.merk[p])}</li>`).join('')}</ul>` : ''}
  ${votes.length ? `<p class="lbl">Slik har de stemt nylig</p><ul class="news">${votes.map(v => `<li>${esc(v.tittel)} – ${esc(v.tema)}<div class="meta">${sdate(v.d)} · ${v.vedtatt ? 'Vedtatt' : 'Forkastet'} ${num(v.for)}–${num(v.mot)}</div><div>${PORDER().filter(x => v.pos[x]).map(x => posCell(x, v.pos[x])).join('')}</div></li>`).join('')}</ul>` : ''}
  <p class="meta">Kilder: ${srcLinks(t.kilder)}</p></details></article>`;
}
function duScores() {
  const X = D.dummies, done = X.tema.filter(t => DU.ans[t.id] != null);
  if (!done.length) return { done, list: [] };
  const list = ABC().map(p => {
    let s = 0, w = 0; const enig = [], uenig = [];
    for (const t of done) {
      const k = DU.vik[t.id] ? 2 : 1, d = Math.abs(DU.ans[t.id] - t.partier[p]);
      s += k * (1 - d / 4); w += k;
      if (d <= 1) enig.push(t.navn); else if (d >= 3) uenig.push(t.navn);
    }
    return { p, pct: Math.round(100 * s / w), enig, uenig };
  }).sort((a, b) => b.pct - a.pct || pname(a.p).localeCompare(pname(b.p), 'nb'));
  return { done, list };
}
const PNICK = p => ({ SV: 'SV', MDG: 'MDG', KrF: 'KrF' })[p] || pname(p);
const duRow = r => `<div class="rrow"><a href="#parti-${r.p}" title="${esc(pname(r.p))}">${dot(r.p)}${esc(PNICK(r.p))}</a><div class="dubar"><i style="width:${r.pct}%;background:${col(r.p)}"></i></div><b class="n">${r.pct} %</b></div>`;
function duMini() {
  const { done, list } = duScores();
  if (!done.length) return `<p class="lbl">Ditt resultat</p><p class="meta">Svar på én eller flere saker, så ser du her hvilke partier som er mest enige med deg.</p>`;
  return `<p class="lbl">Ditt resultat så langt</p><div class="mini">${list.map(duRow).join('')}</div><p class="meta">${done.length} ${done.length === 1 ? 'sak' : 'saker'} besvart. ${DU.i < D.dummies.tema.length ? `<button class="linkbtn" data-go-q="${D.dummies.tema.length}">Se hele resultatet</button>` : ''}</p>`;
}
function duFinal() {
  const { done, list } = duScores();
  if (!done.length) return `<div class="q"><h2>Du har ikke svart på noen saker ennå</h2><p><button class="btn" data-go-q="0">Start testen</button></p></div>`;
  return `<div class="q"><h2>Disse partiene er mest enige med deg</h2><p class="meta">Basert på ${done.length} av ${D.dummies.tema.length} saker. Saker du merket som ekstra viktige teller dobbelt. Dette er ikke et råd om hva du bør stemme.</p>
  <div class="final">${list.map(r => `${duRow(r)}<div class="meta why">${r.enig.length ? 'Enige om: ' + esc(r.enig.join(', ')) : ''}${r.enig.length && r.uenig.length ? ' · ' : ''}${r.uenig.length ? 'Uenige om: ' + esc(r.uenig.join(', ')) : ''}</div>`).join('')}</div>
  <p class="qbtn"><button class="ghost" data-go-q="0">Endre svarene</button><button class="ghost" id="duReset">Start på nytt</button></p></div>`;
}
// Slik styres Norge: setefordeling og regjering regnes ut fra dataene, så teksten holder seg oppdatert.
function duBasics() {
  const n = reps.length; if (!n) return '<p class="empty">Mangler data.</p>';
  const seats = PORDER().map(p => [p, reps.filter(r => r.parti === p).length]).filter(x => x[1]);
  const flertall = Math.floor(n / 2) + 1, gp = [...new Set(govs.map(g => g.parti))].filter(Boolean);
  const gs = seats.filter(([p]) => gp.includes(p)).reduce((a, x) => a + x[1], 0);
  const sml = gp.length === 1 ? pname(gp[0]) + ' styrer alene' : gp.map(pname).join(', ') + ' styrer sammen';
  return `<div class="basics"><div class="seatbar" role="img" aria-label="Setefordeling på Stortinget">${seats.map(([p, k]) => `<i style="flex:${k};background:${col(p)}" title="${esc(pname(p))}: ${k}"></i>`).join('')}<b style="left:${(100 * flertall / n).toFixed(1)}%"></b></div>
  <div class="meta seatleg">${seats.map(([p, k]) => `<a href="#parti-${esc(p)}">${dot(p)}${esc(short(p))} ${k}</a>`).join(' ')} · streken viser flertall (${flertall})</div>
  <ol class="steps">
  <li><b>Du velger Stortinget</b><span>Hvert fjerde år velger vi ${n} representanter. Et parti må ha over 4 % av stemmene for å få utjevningsmandater.</span></li>
  <li><b>Flertallet bestemmer</b><span>Det trengs ${flertall} stemmer for å vedta noe. Regjeringen kan bare sitte så lenge flertallet ikke stemmer den ut.</span></li>
  <li><b>Regjeringen styrer landet</b><span>${esc(sml)}${gs ? ` og har ${gs} av ${n} plasser` : ''}. ${gs && gs < flertall ? `Det er under ${flertall}, så det er en <i>mindretallsregjering</i> som må få med seg andre partier i hver sak.` : gs ? 'Det er flertall, så regjeringen kan få gjennom det meste selv.' : ''} <a href="#regjeringen">Se regjeringen</a></span></li>
  <li><b>Pengene fordeles i budsjettet</b><span>Hver høst legger regjeringen fram statsbudsjettet. Det er her de fleste kompromissene inngås.</span></li>
  <li><b>Slik blir en lov til</b><span>Regjeringen eller representanter foreslår, en komité behandler saken, og Stortinget stemmer. <a href="#voteringer">Se hvordan de har stemt</a></span></li></ol></div>`;
}
function duMatrix() {
  const X = D.dummies, ps = ABC(), lab = { '-2': 'Helt uenig', '-1': 'Litt uenig', 0: 'Nøytral', 1: 'Litt enig', 2: 'Helt enig' };
  return `<p class="meta">Hvor enig hvert parti er i påstanden. Grønt er enig, rødt er uenig. Hold over en rute for forklaring.</p>
  <div class="tw"><table class="mx"><thead><tr><th>Sak</th>${ps.map(p => `<th title="${esc(pname(p))}">${dot(p)}${esc(short(p))}</th>`).join('')}</tr></thead><tbody>
  ${X.tema.map((t, i) => `<tr><td><button class="linkbtn plain" data-go-q="${i}" data-tab="test">${esc(t.navn)}</button><div class="meta">${esc(t.pastand)}</div></td>${ps.map(p => { const v = t.partier[p]; return `<td class="v v${v < 0 ? 'm' : ''}${Math.abs(v)}" title="${esc(pname(p))}: ${lab[v]}${t.merk?.[p] ? ' – ' + esc(t.merk[p]) : ''}">${v > 0 ? '+' + v : v < 0 ? '−' + -v : '0'}</td>`; }).join('')}</tr>`).join('')}
  </tbody></table></div>`;
}
function duResult() { if (DU.tab === 'test') { $('duPanel').innerHTML = duTest(); duSaveBox(); } }


/* ---------- konto (Supabase, innlogging med Google/Apple) ---------- */
// Slås bare på når nettstedet er bygget med SUPABASE_URL og SUPABASE_ANON_KEY (meta eye-auth).
// Ingen tredjepartsskript: innlogging er PKCE-flyten mot Supabase Auth, data hentes via REST med brukerens token.
const AUTH = (() => { try { const a = JSON.parse(document.querySelector('meta[name="eye-auth"]')?.content || 'null'); return a && /^https:\/\/[a-z0-9]{10,40}\.supabase\.co$/.test(a.url) && /^[\w.-]{20,}$/.test(a.key) ? a : null; } catch { return null; } })();
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
const KO = { s: null, profil: null, folger: new Set(), svar: null, prov: null, melding: '' };
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function authPost(path, body) {
  const r = await fetch(AUTH.url + '/auth/v1/' + path, { method: 'POST', headers: { apikey: AUTH.key, 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit' });
  if (!r.ok) throw new Error('Innloggingen feilet'); return r.json();
}
function saveSession(s) { KO.s = s ? { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600), user: { id: s.user?.id, email: s.user?.email } } : null; store.set('eye-sesjon', KO.s); }
async function session() {
  if (!KO.s) return null;
  if (KO.s.expires_at * 1000 - Date.now() < 60_000) {
    try { saveSession(await authPost('token?grant_type=refresh_token', { refresh_token: KO.s.refresh_token })); } catch { saveSession(null); }
  }
  return KO.s;
}
async function api(path, opt = {}) {
  const s = await session(); if (!s) throw new Error('Du er ikke logget inn');
  const r = await fetch(AUTH.url + '/rest/v1/' + path, { ...opt, credentials: 'omit', headers: { apikey: AUTH.key, authorization: 'Bearer ' + s.access_token, 'content-type': 'application/json', ...(opt.headers || {}) } });
  if (r.status === 401) { saveSession(null); throw new Error('Innloggingen er utløpt'); }
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'Noe gikk galt');
  return r.status === 204 ? null : r.json().catch(() => null);
}
async function login(provider) {
  if (!['google', 'apple'].includes(provider)) return;
  const verifier = b64u(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  try { sessionStorage.setItem('eye-pkce', verifier); } catch { }
  location.href = `${AUTH.url}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(location.origin + location.pathname)}&code_challenge=${challenge}&code_challenge_method=s256`;
}
async function logout() { const s = KO.s; saveSession(null); KO.profil = null; KO.folger.clear(); KO.svar = null; if (s) fetch(AUTH.url + '/auth/v1/logout', { method: 'POST', headers: { apikey: AUTH.key, authorization: 'Bearer ' + s.access_token }, credentials: 'omit' }).catch(() => { }); kontoChanged(); }
async function loadMine() {
  const [p, f] = await Promise.all([api('profiles?select=*'), api('folger?select=type,ref')]);
  KO.profil = p?.[0] || null; KO.folger = new Set((f || []).map(x => `${x.type}:${x.ref}`));
  if (KO.profil?.samtykke_svar) {
    KO.svar = await api('svar?select=tema,svar,viktig');
    for (const x of KO.svar || []) if (!(x.tema in DU.ans)) { DU.sel.add(x.tema); DU.ans[x.tema] = x.svar; DU.vik[x.tema] = x.viktig; }
  }
}
async function kontoInit() {
  if (!AUTH) return;
  $('kontoLink').hidden = false;
  const q = new URLSearchParams(location.search), code = q.get('code');
  if (code) {
    let verifier = null; try { verifier = sessionStorage.getItem('eye-pkce'); sessionStorage.removeItem('eye-pkce'); } catch { }
    history.replaceState(null, '', location.pathname + '#konto');
    try { if (verifier) saveSession(await authPost('token?grant_type=pkce', { auth_code: code, code_verifier: verifier })); }
    catch { KO.melding = 'Innloggingen feilet. Prøv igjen.'; }
  } else if (q.get('error_description')) { KO.melding = 'Innloggingen ble avbrutt.'; history.replaceState(null, '', location.pathname + '#konto'); }
  else KO.s = store.get('eye-sesjon');
  if (KO.s) try { await loadMine(); } catch (e) { KO.melding = e.message; }
  kontoChanged(); route();
}
function kontoChanged() {
  $('kontoLink').textContent = KO.s ? 'Min side' : 'Logg inn';
  for (const b of document.querySelectorAll('[data-f]')) b.setAttribute('aria-pressed', KO.folger.has(b.dataset.f)), b.textContent = KO.folger.has(b.dataset.f) ? '★ Følger' : '☆ Følg';
  if (!$('v-konto').hidden) kontoView();
  if (D.dummies) dummiesView();
}
function followBtn(type, ref) { if (!AUTH) return ''; const k = `${type}:${ref}`, on = KO.folger.has(k); return `<button class="follow" data-f="${esc(k)}" aria-pressed="${on}">${on ? '★ Følger' : '☆ Følg'}</button>`; }
async function toggleFollow(k) {
  if (!KO.s) { KO.melding = 'Logg inn for å følge politikere, partier og selskaper.'; location.hash = 'konto'; return; }
  const [type, ref] = k.split(':'), on = KO.folger.has(k);
  try {
    if (on) { await api(`folger?type=eq.${encodeURIComponent(type)}&ref=eq.${encodeURIComponent(ref)}`, { method: 'DELETE' }); KO.folger.delete(k); }
    else { await api('folger', { method: 'POST', headers: { prefer: 'return=minimal,resolution=ignore-duplicates' }, body: JSON.stringify({ type, ref }) }); KO.folger.add(k); }
  } catch (e) { alertBox(e.message); }
  kontoChanged();
}
function alertBox(m) { KO.melding = m; if (!$('v-konto').hidden) kontoView(); }
const followName = (type, ref) => type === 'rep' ? byId[ref]?.navn || ref : type === 'parti' ? pname(ref) : byNr[ref]?.navn || D.cos.find(c => c.nr === ref)?.navn || 'Org.nr. ' + org(ref);
const hashLink = h => /^#[\w-]*$/.test(h) ? h : '#';
const followHref = (type, ref) => type === 'rep' ? `#rep-${byId[ref]?.h || ''}` : type === 'parti' ? `#parti-${ref}` : `#org-${ref}`;
async function kontoView() {
  const v = $('v-konto'); document.title = 'Min side – Maktkartet';
  if (!AUTH) { v.innerHTML = '<h1>Konto</h1><p class="empty">Brukerkontoer er ikke slått på ennå.</p>'; return; }
  const msg = KO.melding ? `<p class="card" role="status">${esc(KO.melding)}</p>` : ''; KO.melding = '';
  if (!KO.s) {
    if (!KO.prov) KO.prov = await fetch(AUTH.url + '/auth/v1/settings', { headers: { apikey: AUTH.key }, credentials: 'omit' }).then(r => r.json()).then(s => s.external || {}).catch(() => ({ google: true }));
    v.innerHTML = `<h1>Logg inn</h1>${msg}<p class="lede">Med en konto kan du følge politikere, partier og selskaper og se hva som er nytt siden sist. Du kan også lagre svarene dine i Politikk forklart, hvis du vil.</p>
    <div class="login">${KO.prov.google ? '<button data-login="google">Fortsett med Google</button>' : ''}${KO.prov.apple ? '<button class="apple" data-login="apple">Fortsett med Apple</button>' : ''}${!KO.prov.google && !KO.prov.apple ? '<p class="empty">Ingen innloggingsmåter er slått på ennå.</p>' : ''}</div>
    <p class="meta">Vi får e-postadressen din fra Google eller Apple, aldri passordet. Les <a href="#personvern">personvernerklæringen</a>.</p>`;
    return;
  }
  const seen = KO.profil?.sist_sett || '1970-01-01', mine = [...KO.folger].map(k => k.split(':'));
  const feed = (D.endringer || []).filter(e => KO.folger.has(`${e.type}:${e.ref}`) || (e.type === 'rep' && KO.folger.has(`parti:${e.parti}`))).slice(0, 50);
  v.innerHTML = `<h1>Min side</h1>${msg}<p class="meta">Logget inn som ${esc(KO.s.user?.email || '')}</p>
  <div class="card"><h2>Nytt siden sist</h2>${!mine.length ? '<p class="empty">Du følger ingenting ennå. Trykk «☆ Følg» på en politiker, et parti eller et selskap.</p>' : feed.length ? `<ul class="news">${feed.map(e => `<li class="${e.d > seen.slice(0, 10) ? 'new' : ''}"><a href="${e.lenke?.startsWith('#') ? hashLink(e.lenke) : url(e.lenke)}">${esc(e.tekst)}</a><div class="meta">${date(e.d)}</div></li>`).join('')}</ul>` : '<p class="empty">Ingenting nytt de siste 60 dagene.</p>'}</div>
  <div class="card"><h2>Du følger</h2>${mine.length ? `<ul>${mine.map(([t, r]) => `<li><a href="${hashLink(followHref(t, r))}">${esc(followName(t, r))}</a> <button class="filterbtn" data-f="${esc(t + ':' + r)}">Slutt å følge</button></li>`).join('')}</ul>` : '<p class="empty">Ingenting ennå.</p>'}
  <label class="imp"><input type="checkbox" id="koEpost" ${KO.profil?.epostvarsler ? 'checked' : ''}> Send meg e-post når det skjer noe nytt (maks én om dagen)</label></div>
  <div class="card"><h2>Svar i Politikk forklart</h2>${KO.profil?.samtykke_svar ? `<p>Du har gitt samtykke ${date(KO.profil.samtykke_svar.slice(0, 10))}. ${KO.svar?.length || 0} svar er lagret.</p><button class="danger" id="koTrekk">Trekk samtykke og slett svarene</button>` : '<p>Svarene dine lagres ikke. Du kan slå på lagring nederst i <a href="#forklart">Politikk forklart</a>.</p>'}</div>
  <div class="card"><h2>Dine data</h2><p><button class="filterbtn" id="koEksport">Last ned alt vi har om deg</button> <button class="filterbtn" id="koUt">Logg ut</button></p><p><button class="danger" id="koSlett">Slett kontoen min</button></p><p class="meta"><a href="#personvern">Personvern</a></p></div>`;
  if (KO.profil) api(`profiles?id=eq.${KO.s.user.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ sist_sett: new Date().toISOString() }) }).catch(() => { });
}
async function kontoClick(e) {
  const t = e.target;
  if (t.dataset.login) return login(t.dataset.login);
  if (t.closest('[data-f]')) return toggleFollow(t.closest('[data-f]').dataset.f);
  if (t.id === 'koUt') return logout();
  if (t.id === 'koEksport') {
    const data = { konto: KO.s.user, profil: KO.profil, folger: [...KO.folger], svar: KO.profil?.samtykke_svar ? await api('svar?select=*') : [] };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); a.download = 'mine-eye-data.json'; a.click(); return;
  }
  if (t.id === 'koTrekk') { await setConsent(false); return; }
  if (t.id === 'koSlett' && confirm('Slette kontoen og alt som er lagret? Dette kan ikke angres.')) {
    try { await api('rpc/slett_meg', { method: 'POST', body: '{}' }); saveSession(null); KO.folger.clear(); KO.profil = null; KO.melding = 'Kontoen og alle data er slettet.'; kontoChanged(); } catch (err) { alertBox(err.message); }
  }
}
async function setConsent(on) {
  try {
    await api(`profiles?id=eq.${KO.s.user.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ samtykke_svar: on ? new Date().toISOString() : null }) });
    await loadMine(); if (on) await duAutoSave(true); else KO.svar = [];
  } catch (e) { KO.melding = e.message; }
  kontoChanged();
}
let duTimer;
async function duAutoSave(now) {
  if (!KO.s || !KO.profil?.samtykke_svar) return;
  clearTimeout(duTimer);
  const run = async () => {
    const rows = Object.entries(DU.ans).filter(([t]) => DU.sel.has(t)).map(([tema, svar]) => ({ tema, svar, viktig: !!DU.vik[tema], lagret: new Date().toISOString() }));
    if (rows.length) await api('svar', { method: 'POST', headers: { prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify(rows) }).catch(() => { });
    KO.svar = rows;
  };
  if (now) return run(); duTimer = setTimeout(run, 800);
}
function duSaveBox() {
  const box = $('duSave'); if (!box) return;
  if (!AUTH) { box.innerHTML = ''; return; }
  box.innerHTML = !KO.s ? `<p class="meta">Vil du lagre svarene? <a href="#konto">Logg inn</a>. Uten konto forsvinner de når du lukker siden.</p>`
    : KO.profil?.samtykke_svar ? `<p class="meta">Svarene dine lagres på kontoen din. <a href="#konto">Endre på Min side</a>.</p>`
    : `<div class="card"><label class="imp"><input type="checkbox" id="duConsent"> Jeg samtykker til at Maktkartet lagrer svarene mine. Jeg forstår at de viser politiske meninger, og at jeg kan slette dem når som helst.</label></div>`;
}

/* ---------- aksjehandler ---------- */
function tradesView() {
  const n = new Set(trades.map(t => t.rep || t.pep)).size, sum = trades.reduce((a, t) => a + t.ver, 0);
  const big = [...trades].sort((a, b) => b.ver - a.ver)[0];
  $('tk').innerHTML = `<div><b>${trades.length}</b><span>handler</span></div><div><b>${n}</b><span>personer</span></div><div><b>${nf(Math.round(sum / 1e5) / 10)} mill. kr</b><span>samlet verdi</span></div>${big ? `<div><b>${nf(big.ver)} kr</b><span>største: ${esc(big.r.navn)}, ${esc(big.sel)}</span></div>` : ''}`;
  const t = $('tt').value, pf = $('tpp').value;
  // Aksjene politikerne handler mest: antall personer og handler per selskap
  const by = new Map();
  for (const x of trades) { const k = coKey(x.sel); const g = by.get(k) || { sel: x.sel, who: new Set(), n: 0, kr: 0 }; g.who.add(x.r.navn); g.n++; g.kr += x.ver || 0; by.set(k, g); }
  $('tTop').innerHTML = sec('t-top', 'Mest handlet av politikere', `<ul class="feed">${[...by.values()].sort((a, b) => b.who.size - a.who.size || b.n - a.n).slice(0, 8).map(g => `<li><div class="grow"><b>${stockLink(g.sel)}</b><div class="meta">${[...g.who].join(', ')}</div></div><b class="n">${g.n} ${g.n === 1 ? 'handel' : 'handler'}</b></li>`).join('')}</ul>`);
  $('tradeTable').tBodies[0].innerHTML = trades.filter(x => (!t || x.k === t) && (!pf || x.r.parti === pf)).map(x => `<tr${x.r.h ? ` data-go="rep-${x.r.h}"` : x.pep && govById[x.pep] ? ` data-go="statsrad-${hid(x.pep)}"` : ''}><td class="n">${sdate(x.d)}</td><td><div class="who">${avatar(x.r.h ? ['rep:' + x.rep] : ['gov:' + x.pep], x.r.navn, x.r.parti)}<div>${x.r.h ? `<a href="#rep-${x.r.h}">${esc(x.r.navn)}</a>` : x.pep && govById[x.pep] ? `<a href="#statsrad-${hid(x.pep)}">${esc(x.r.navn)}</a>` : esc(x.r.navn)}<div class="meta">${dot(x.r.parti)}${esc(x.r.parti)}${x.r.rolle ? ' · ' + esc(x.r.rolle) : ''}</div></div></div></td><td class="hide-s">${trade(x.k)}</td><td><span class="show-s">${trade(x.k)} </span>${stockLink(x.sel)}</td><td class="n hide-s">${nf(x.ant)}</td><td class="n">${nf(x.ver)}</td></tr>`).join('')
    || '<tr><td colspan="6" class="empty">Ingen handler.</td></tr>';
}

/* ---------- innsidehandel (Oslo Børs) ---------- */
const ITYPE = { K: '<span class="k">Kjøp</span>', S: '<span class="s">Salg</span>', T: 'Tildeling', U: '–' };
function insiderView() {
  const L = D.innside || [], t = $('it').value, q = $('iq').value.trim().toLowerCase(), pol = $('ip').checked;
  const k = L.filter(x => x.k === 'K'), s = L.filter(x => x.k === 'S');
  $('ik').innerHTML = `<div><b>${L.length}</b><span>meldinger siste 60 dager</span></div><div><b>${k.length}</b><span>kjøp</span></div><div><b>${s.length}</b><span>salg</span></div><div><b>${L.filter(x => x.pol).length}</b><span>nevner en politiker</span></div>`;
  const list = L.filter(x => (!t || x.k === t) && (!pol || x.pol) && (!q || (x.sel + ' ' + x.tekst + ' ' + x.tittel).toLowerCase().includes(q)));
  $('insTable').tBodies[0].innerHTML = list.slice(0, 300).map(x => `<tr><td class="d">${sdate(x.d)}</td><td><b>${stocks.has(slug(x.tick || x.sel)) ? `<a href="#aksje-${slug(x.tick || x.sel)}">${esc(x.sel)}</a>` : esc(x.sel)}</b><div class="meta">${ITYPE[x.k] || '–'}${x.navn ? ' · ' + insiderLink(x.navn) : ''}${x.rolle ? ', ' + esc(x.rolle) : ''}</div></td><td>${esc(x.tekst || x.tittel)} <a href="${url(x.u)}" rel="noopener">Les meldingen</a>${x.pol ? `<div>${x.pol.map(p => `<span class="chip ok">${esc(p.navn)} · ${esc(p.gruppe)}</span>`).join(' ')}</div>` : ''}</td><td class="n hide-s">${money(x)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Ingen meldinger.</td></tr>';
}

/* ---------- eiere og innsidere ---------- */
const kr = n => n >= 1e9 ? nf(Math.round(n / 1e8) / 10) + ' mrd.' : n >= 1e6 ? nf(Math.round(n / 1e5) / 10) + ' mill.' : nf(n);
function flaggingView() {
  const r = $('fr').value, q = $('fq').value.trim().toLowerCase();
  const list = (D.flagging || []).filter(f => (!r || f.retning === r) && (!q || (f.sel + ' ' + (f.eier || '') + ' ' + f.tekst).toLowerCase().includes(q)));
  $('flagTable').tBodies[0].innerHTML = list.slice(0, 300).map(f => `<tr><td class="d">${sdate(f.d)}</td><td><b>${stocks.has(slug(f.tick || f.sel)) ? `<a href="#aksje-${slug(f.tick || f.sel)}">${esc(f.sel)}</a>` : esc(f.sel)}</b></td><td>${ownerLink(f.eier)}${f.retning ? `<div class="meta">${f.retning === 'opp' ? '<span class="k">▲ økte</span>' : '<span class="s">▼ reduserte</span>'}</div>` : ''}</td><td class="n">${f.pst != null ? String(f.pst).replace('.', ',') + ' %' : '–'}</td><td class="hide-s">${esc(f.tekst || f.tittel)} <a href="${url(f.u)}" rel="noopener">Les meldingen</a></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Ingen meldinger.</td></tr>';
}

/* ---------- biografi og godtgjøring (Stortinget) ---------- */
// Full biografi ligger i en egen fil (bio.json) og lastes først når noen åpner en profil.
let BIO = null, bioP = null;
async function loadBio() {
  if (BIO) return BIO;
  if (D.bio) return (BIO = D.bio);
  bioP ||= fetch('bio.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : {})).catch(() => ({}));
  return (BIO = await bioP);
}
const VTYPE = { parti: 'Partiverv', kommune: 'Kommunestyre og kommune', fylke: 'Fylkesting og fylke', offentlig: 'Offentlige verv', organisasjon: 'Organisasjoner', 'organisasjoner': 'Organisasjoner', annet: 'Andre verv' };
const yrs = (f, t) => f ? ` <span class="meta">(${f}${t === f ? '' : '–' + (t || '')})</span>` : '';
const CURP = () => { const y = new Date().getFullYear(); return String(y - ((y - 2025) % 4 + 4) % 4); }; // startåret for perioden, f.eks. «2025»
/** Er personen komitéleder nå? (gir 7 % tillegg i godtgjøringen) */
const komLeder = b => (b?.kom || []).find(k => k[4] === 'KOMI' && /^leder$/i.test(k[1]) && !k[3] && String(k[5]).startsWith(CURP()));
function bioHtml(b) {
  const list = (items, n = 6) => items.length <= n ? `<ul class="blist">${items.join('')}</ul>` : `<ul class="blist">${items.slice(0, n).join('')}</ul><details class="more"><summary>Vis alle ${items.length}</summary><ul class="blist">${items.slice(n).join('')}</ul></details>`;
  const uy = k => b.uy.filter(x => x[0] === k).sort((a, c) => (c[2] || 0) - (a[2] || 0)).map(x => `<li>${esc(x[1])}${yrs(x[2], x[3])}</li>`);
  const per = [...b.per].reverse().map(x => `<li>${esc(x[0])} · ${esc(x[3] || 'Representant')}, ${esc(x[2])} <span class="meta">(${esc(x[1])})</span></li>`);
  const kom = [...b.kom].sort((a, c) => String(c[5]).localeCompare(String(a[5])) || (a[4] === 'KOMI' ? -1 : 1)).map(x => `<li>${esc(x[1] || 'Medlem')}, ${esc(x[0])} <span class="meta">${esc(x[5])}</span></li>`);
  const groups = {};
  for (const v of b.verv) (groups[v[0] || 'annet'] ||= []).push(v);
  const vg = Object.entries(groups).map(([t, l]) => `<div><h3>${esc(VTYPE[t] || t.charAt(0).toUpperCase() + t.slice(1))}</h3>${list(l.sort((a, c) => (c[4] || 0) - (a[4] || 0)).map(v => `<li>${esc([v[3], v[1]].filter(Boolean).join(', '))}${v[2] ? ` <span class="meta">${esc(v[2])}</span>` : ''}${yrs(v[4], v[5])}</li>`), 5)}</div>`).join('');
  const ans = b.ans?.[0] ? `${b.ans[0]} år${b.ans[1] ? ` og ${b.ans[1]} dager` : ''}` : '';
  return `<div class="bgrid">
    ${uy('u').length ? `<div><h3>Utdanning</h3>${list(uy('u'))}</div>` : ''}
    ${uy('y').length ? `<div><h3>Yrke</h3>${list(uy('y'))}</div>` : ''}
    ${per.length ? `<div><h3>På Stortinget${ans ? ` <span class="meta">· ${ans} til sammen</span>` : ''}</h3>${list(per, 4)}</div>` : ''}
    ${b.regj?.length ? `<div><h3>I regjering</h3><ul class="blist">${b.regj.map(r => `<li>${date(r[0])} – ${r[1] ? date(r[1]) : 'nå'}</li>`).join('')}</ul></div>` : ''}
    ${kom.length ? `<div><h3>Komiteer og delegasjoner</h3>${list(kom, 5)}</div>` : ''}
    </div>${vg ? `<div class="bgrid">${vg}</div>` : ''}<p class="meta">Fra Stortingets offisielle biografi. Foreldre, fødested og fødselsdato vises ikke.</p>`;
}
async function fillBio(id, box) {
  const want = location.hash; const el = $(box); if (!el) return;
  el.innerHTML = sec('s-bio', 'Biografi', '<p class="loading">Henter biografien …</p>');
  const b = (await loadBio())[id];
  if (location.hash !== want || !$(box)) return;
  $(box).innerHTML = b ? sec('s-bio', 'Biografi', bioHtml(b)) : '';
  const om = $('godtg'); if (om && b && komLeder(b) && D.godtgjoring) om.insertAdjacentHTML('beforeend', ` <span class="meta">Pluss ${D.godtgjoring.komiteleder} % som leder av ${esc(komLeder(b)[0])}.</span>`);
}
/** Godtgjøring fra Stortinget (fast, vedtatt av Stortinget hvert år). */
function payHtml(kind) {
  const G = D.godtgjoring; if (!G) return '';
  const v = kind === 'pm' ? G.statsminister : kind === 'gov' ? G.statsrad : G.representant;
  return `<dt>Godtgjøring</dt><dd id="godtg">${nf(v)} kr i året <span class="meta">fra ${date(G.fra, true)} (<a href="${url(G.url)}" rel="noopener">Stortinget</a>).</span></dd>`;
}

/** Selskapssiden lenker til børssiden når selskapet er notert. */
const listedLink = (nr, navn) => { const a = Object.values(D.aksjer || {}).find(a => a.nr === nr) || null, st = a ? stocks.get(slug(a.tick || a.navn)) : stockByName(navn); return st?.notert ? `<p class="card">Børsnotert${st.marked ? ' på ' + esc(st.marked) : ''}${st.tick ? ` (<span class="tick">${esc(st.tick)}</span>)` : ''}. <a href="#aksje-${st.k}">Se innsidehandler, store eiere og mer →</a></p>` : ''; };
/* ---------- penger til partiene (partifinansiering.no) ---------- */
const PF = () => D.partifin;
const PFTYPE = 'Bidrag fra privatpersoner vises bare som sum, fordi de viser politisk tilhørighet. Navnene står hos partifinansiering.no.';
function partyMoney(p) {
  const F = PF()?.partier?.[p]; if (!F) return '';
  const yrs = PF().aar, max = Math.max(...yrs.map(y => F.aar[y]?.sum || 0), 1);
  return `<h2 id="p-penger">Penger til partiet</h2>
  <div class="tw"><table class="mxs"><thead><tr><th>År</th><th class="n">Bidrag i alt</th><th class="n hide-s">Fra organisasjoner og selskaper</th><th class="n hide-s">Fra privatpersoner</th><th></th></tr></thead><tbody>
  ${[...yrs].reverse().map(y => { const a = F.aar[y] || { sum: 0, org: 0, priv: 0, privN: 0 }; return `<tr><td>${y}${PF().kilder[y] === 'valgår' ? ' <span class="meta">valgår</span>' : ''}</td><td class="n"><b>${money2(a.sum)}</b></td><td class="n hide-s">${money2(a.org)}</td><td class="n hide-s">${money2(a.priv)} <span class="meta">(${a.privN})</span></td><td class="hide-s" style="width:30%"><div class="dubar"><i style="width:${(100 * a.sum / max).toFixed(0)}%;background:${col(p)}"></i></div></td></tr>`; }).join('')}
  </tbody></table></div>
  ${F.topp?.length ? `<h3>Største givere ${yrs[0]}–${yrs[yrs.length - 1]}</h3><ul class="feed cols-2">${F.topp.slice(0, 12).map(g => `<li><div class="grow">${donorLink(g.navn)}</div><b class="n">${money2(g.sum)}</b></li>`).join('')}</ul>` : ''}
  <p class="meta">Fra <a href="${url(PF().url)}" rel="noopener">partifinansiering.no</a>, alle partiledd. ${PFTYPE}</p>`;
}
const donorLink = n => { const c = cos.find(x => coKey(x.navn) === coKey(n)), st = stockByName(n); return c ? `<a href="#org-${c.nr}">${esc(n)}</a>` : st ? `<a href="#aksje-${st.k}">${esc(n)}</a>` : esc(n); };
/** Bidrag fra et bestemt selskap eller en organisasjon (samme navn). */
const donationsBy = navn => (PF()?.givere || []).find(g => coKey(g.navn) === coKey(navn));
const donationHtml = navn => { const g = donationsBy(navn); if (!g) return ''; return sec('s-pf', 'Bidrag til partier', `<p>Har gitt <b>${money2(g.sum)}</b> til politiske partier ${PF().aar[0]}–${PF().aar[PF().aar.length - 1]}.</p><ul class="feed">${Object.entries(g.partier).sort((a, b) => b[1] - a[1]).map(([p, s]) => `<li><div class="grow"><a href="#parti-${p}">${dot(p)}${esc(pname(p))}</a></div><b class="n">${money2(s)}</b></li>`).join('')}</ul><p class="meta">Fra <a href="${url(PF().url)}" rel="noopener">partifinansiering.no</a>. Koblet på navn.</p>`); };
function moneyView() {
  const F = PF(); const v = $('v-money');
  if (!F) { v.innerHTML = '<h1>Penger til partiene</h1><p class="empty">Data mangler.</p>'; return; }
  const yrs = F.aar, last = yrs[yrs.length - 1], ps = PORDER().filter(p => F.partier[p]);
  const tot = y => ps.reduce((a, p) => a + (F.partier[p].aar[y]?.sum || 0), 0), max = Math.max(...ps.map(p => F.partier[p].aar[last]?.sum || 0), 1);
  v.innerHTML = `<h1>Penger til partiene</h1><p class="lede">Partiene må melde fra om bidrag de får fra selskaper, organisasjoner og privatpersoner. Her ser du hvem som gir mest, og til hvem.</p>
  <div class="kpis"><div><b>${money2(tot(last))}</b><span>til stortingspartiene i ${last}</span></div><div><b>${nf(F.givere.length)}${F.givere.length >= 400 ? '+' : ''}</b><span>organisasjoner og selskaper har gitt</span></div><div><b>${yrs[0]}–${last}</b><span>år med data</span></div></div>
  <div class="cols2"><section class="block"><div class="bh"><h2>Bidrag per parti, ${last}</h2></div>${ps.sort((a, b) => (F.partier[b].aar[last]?.sum || 0) - (F.partier[a].aar[last]?.sum || 0)).map(p => { const a = F.partier[p].aar[last] || { sum: 0 }; return `<div class="rrow"><a href="#parti-${p}">${dot(p)}${esc(PNICK(p))}</a><div class="dubar"><i style="width:${(100 * a.sum / max).toFixed(0)}%;background:${col(p)}"></i></div><b class="n">${kr(a.sum)}</b></div>`; }).join('')}
  <p class="meta">${F.kilder[last] === 'valgår' ? 'Valgår: bidrag meldt fortløpende.' : 'Hele året.'} Alle partiledd (sentralt, fylke, kommune og ungdom).</p></section>
  <section class="block"><div class="bh"><h2>Største givere ${yrs[0]}–${last}</h2></div><ul class="feed">${F.givere.slice(0, 25).map(g => `<li><div class="grow">${donorLink(g.navn)}<div class="meta">${Object.entries(g.partier).sort((a, b) => b[1] - a[1]).map(([p, s]) => `${dot(p)}${esc(short(p))} ${kr(s)}`).join(' · ')}</div></div><b class="n">${kr(g.sum)}</b></li>`).join('')}</ul></section></div>
  <p class="meta">Kilde: <a href="${url(F.url)}" rel="noopener">partifinansiering.no</a> (Kommunal- og distriktsdepartementet og SSB). ${PFTYPE}</p>`;
}

/* ---------- børsen: ren oversikt og alle selskaper ---------- */
const MKT = { 'Oslo Børs': 'Oslo Børs', 'Euronext Expand': 'Expand', 'Euronext Growth': 'Growth' };
function bourseView() {
  const L = D.innside || [], F = D.flagging || [];
  const sum = l => l.reduce((a, x) => a + (x.ver || 0), 0), listed = [...stocks.values()].filter(s => s.notert);
  $('ok').innerHTML = `<a href="#borsselskaper"><b>${listed.length}</b><span>selskaper på børsen</span></a><a href="#innside"><b>${kr(sum(L.filter(x => x.k === 'K')))}</b><span>kjøpt av innsidere, 60 dager</span></a><a href="#innside"><b>${kr(sum(L.filter(x => x.k === 'S')))}</b><span>solgt av innsidere</span></a><a href="#storeeiere"><b>${F.length}</b><span>flaggemeldinger, 90 dager</span></a>`;
  const grp = new Map();
  for (const x of L) if (x.ver && (x.k === 'K' || x.k === 'S')) { const k = `${x.navn || ''}|${x.sel}|${x.k}`, g = grp.get(k) || { ...x, sum: 0, n: 0 }; g.sum += x.ver; g.n++; if (x.d > g.d) g.d = x.d; grp.set(k, g); }
  const row = x => `<li>${avatar(x.navn ? ['ins:' + slug(x.navn)] : [], x.navn || x.sel)}<div class="grow">${x.navn ? insiderLink(x.navn) : '–'}<div class="meta">${stockLink(x.sel)}${x.rolle ? ' · ' + esc(x.rolle) : ''}${x.n > 1 ? ` · ${x.n} handler` : ''}</div></div><b class="n">${kr(x.sum)}</b></li>`;
  const top = k => [...grp.values()].filter(x => x.k === k).sort((a, b) => b.sum - a.sum).slice(0, 6);
  const act = [...stocks.values()].filter(s => s.ins.length).sort((a, b) => b.ins.length - a.ins.length).slice(0, 6);
  const own = new Map(); for (const f of F.filter(f => f.eier)) { const o = own.get(f.eier) || { eier: f.eier, sel: new Set() }; o.sel.add(f.sel); own.set(f.eier, o); }
  $('bourseDash').innerHTML = `<div class="cols2 even">
    ${sec('b-kjop', 'Største kjøp', `<ul class="feed">${top('K').map(row).join('')}</ul>`, '<a href="#innside">Alle →</a>')}
    ${sec('b-salg', 'Største salg', `<ul class="feed">${top('S').map(row).join('')}</ul>`, '<a href="#innside">Alle →</a>')}
    ${sec('b-akt', 'Mest innsidehandel', `<ul class="feed">${act.map(s => `<li><div class="grow"><a href="#aksje-${s.k}">${esc(s.navn)}</a><div class="meta">${esc([s.tick, MKT[s.marked]].filter(Boolean).join(' · '))}</div></div><b class="n">${s.ins.length} handler</b></li>`).join('')}</ul>`, '<a href="#borsselskaper">Alle selskaper →</a>')}
    ${sec('b-eiere', 'Mest aktive storeiere', `<ul class="feed">${[...own.values()].sort((a, b) => b.sel.size - a.sel.size).slice(0, 6).map(o => `<li><div class="grow">${ownerLink(o.eier)}<div class="meta">${[...o.sel].slice(0, 3).map(s => esc(s)).join(', ')}${o.sel.size > 3 ? ' …' : ''}</div></div><b class="n">${o.sel.size} selsk.</b></li>`).join('')}</ul>`, '<a href="#storeeiere">Alle →</a>')}
  </div>`;
}
function listedView() {
  const q = $('lq').value.trim().toLowerCase(), m = $('lm').value, so = $('ls').value;
  const all = [...stocks.values()].filter(s => s.notert);
  const fin = s => { const nr = D.aksjer?.[s.tick || s.navn]?.nr; return nr ? RS(nr) : null; };
  const list = all.filter(s => (!m || s.marked === m) && (!q || (s.navn + ' ' + (s.tick || '') + ' ' + (s.bransje || []).join(' ')).toLowerCase().includes(q)))
    .sort((a, b) => so === 'inn' ? (fin(b)?.inn || -1) - (fin(a)?.inn || -1) : so === 'ins' ? b.ins.length - a.ins.length : a.navn.localeCompare(b.navn, 'nb'));
  $('lk').textContent = `${list.length} av ${all.length} selskaper`;
  $('listTable').tBodies[0].innerHTML = list.map(s => { const f = fin(s); return `<tr data-go="aksje-${s.k}"><td><a href="#aksje-${s.k}"><b>${esc(s.navn)}</b></a><div class="meta">${s.tick ? `<span class="tick">${esc(s.tick)}</span> ` : ''}${esc((s.bransje || []).join(', '))}</div></td><td class="hide-s">${esc(MKT[s.marked] || '–')}</td><td class="n">${f?.inn != null ? money2(f.inn, f.valuta) : '<span class="zero">–</span>'}</td><td class="n hide-s">${s.ins.length || '<span class="zero">0</span>'}</td></tr>`; }).join('') || '<tr><td colspan="4" class="empty">Ingen treff.</td></tr>';
}

/* ---------- aksjeposter (alle PEP) ---------- */
function holdingsView() {
  const g = $('hg').value, p = $('hp').value, q = $('hq').value.trim().toLowerCase(), only = $('hh').checked;
  const groups = [...new Set(holdings.map(x => x.gruppe))];
  $('hk').innerHTML = groups.map(gr => { const l = holdings.filter(x => x.gruppe === gr); return `<div><b>${l.filter(x => x.eier).length} av ${l.length}</b><span>${esc(gr)}: oppgir aksjer eller eierandeler</span></div>`; }).join('');
  const list = holdings.filter(x => (!g || x.gruppe === g) && (!p || x.parti === p) && (!only || x.eier) && (!q || (x.navn + ' ' + x.tekst).toLowerCase().includes(q)))
    .sort((a, b) => b.eier - a.eier || a.navn.localeCompare(b.navn, 'nb'));
  $('holdTable').tBodies[0].innerHTML = list.slice(0, 400).map(x => `<tr${x.h ? ` data-go="rep-${x.h}"` : x.g ? ` data-go="statsrad-${x.g}"` : ''}><td><div class="who">${avatar(x.rid ? ['rep:' + x.rid] : x.gid ? ['gov:' + x.gid] : [], x.navn, x.parti)}<div>${x.h ? `<a href="#rep-${x.h}">${esc(x.navn)}</a>` : x.g ? `<a href="#statsrad-${x.g}">${esc(x.navn)}</a>` : `<b>${esc(x.navn)}</b>`}<div class="meta">${esc(x.rolle)} · ${dot(x.parti)}${esc(x.parti)}</div></div></div></td><td>${x.tekst ? linkStocks(x.tekst) : `<span class="meta">${x.mangler ? 'Står ikke i registeret' : 'Ingen oppgitt'}</span>`}</td></tr>`).join('') || '<tr><td colspan="2" class="empty">Ingen treff.</td></tr>';
}

/* ---------- selskaper ---------- */
const polChips = ids => ids.map(i => { const r = byId[i]; return r ? `<a class="chip" href="#rep-${r.h}">${dot(r.parti)}${esc(r.navn)}</a>` : ''; }).join('');
function cosView() {
  const withRole = cos.filter(c => Object.keys(c.roles || {}).length).length;
  $('ck').innerHTML = `<div><b>${cos.length}</b><span>selskaper og organisasjoner</span></div><div><b>${new Set(cos.flatMap(c => c.ids)).size}</b><span>representanter</span></div><div><b>${withRole}</b><span>med rolle bekreftet</span></div>`;
  const f = $('cf').value, s = $('cs').value;
  const list = cos.filter(c => (f !== 'rolle' || Object.keys(c.roles || {}).length) && (f !== 'flagg' || c.flag))
    .sort((a, b) => s === 'inn' ? (RS(b.nr)?.inn || -1) - (RS(a.nr)?.inn || -1) : s === 'ans' ? b.ans - a.ans : s === 'rep' ? b.ids.length - a.ids.length || a.navn.localeCompare(b.navn, 'nb') : a.navn.localeCompare(b.navn, 'nb'));
  $('coTable').tBodies[0].innerHTML = list.map(c => `<tr data-go="org-${org(c.nr).replace(/ /g, '')}"><td><a href="#org-${org(c.nr).replace(/ /g, '')}">${esc(c.navn)}</a><div class="meta">${org(c.nr)} · ${esc(FORM[c.form] || c.form)}${flag(c.flag) ? ' · ' + flag(c.flag) : ''}</div></td><td class="hide-s">${esc(c.kommune || '–')}</td><td class="n">${RS(c.nr)?.inn != null ? `${money2(RS(c.nr).inn, RS(c.nr).valuta)}<div class="meta">${RS(c.nr).aar}</div>` : '–'}</td><td class="n hide-s">${c.ans > 0 ? nf(c.ans) : '–'}</td><td>${polChips(c.ids)}</td></tr>`).join('');
}
async function liveSearch(q) {
  const box = $('live');
  if (q.length < 2) { box.innerHTML = '<p class="empty">Skriv minst to tegn.</p>'; return; }
  box.innerHTML = '<p class="loading">Søker …</p>';
  try {
    let d;
    if (SERVER) { const r = await fetch('/api/sok?q=' + encodeURIComponent(q.slice(0, 80))); d = await r.json(); if (!r.ok) throw new Error(d.feil); }
    else d = { treff: (await brSearch(q.slice(0, 80))).map(c => ({ ...c, politikere: (byNr[c.nr]?.ids || []).map(id => byId[id]) })) };
    box.innerHTML = d.treff.length ? `<div class="res">${d.treff.map(c => `<a href="#org-${org(c.nr).replace(/ /g, '')}"><span><b>${esc(c.navn)}</b><br><span class="meta">${org(c.nr)} · ${esc(c.kommune || '–')} · ${esc(c.nar || c.formNavn || '')}${flag(c.flag) ? ' · ' + flag(c.flag) : ''}</span></span><span>${(c.politikere || []).map(p => `<span class="chip ok">${dot(p.parti)}${esc(p.navn)}</span>`).join('')}</span></a>`).join('')}</div>` : '<p class="empty">Ingen treff.</p>';
  } catch (e) { box.innerHTML = `<p class="empty">${esc(e.message || 'Søket feilet')}</p>`; }
}
/* ---------- årsregnskap (Regnskapsregisteret, hentet i bygget) ---------- */
const RS = nr => D.regnskap?.[String(nr || '').replace(/\D/g, '')] || null;
const money2 = (v, cur = 'NOK') => v == null ? '–' : `${v < 0 ? '−' : ''}${kr(Math.abs(v))} ${cur === 'NOK' ? 'kr' : esc(cur)}`;
const chg = (a, b) => a != null && b ? `<span class="${a >= b ? 'pos' : 'neg'}">${a >= b ? '▲' : '▼'} ${Math.abs(Math.round(100 * (a - b) / Math.abs(b)))} %</span>` : '';
/** Nøkkeltall fra siste årsregnskap, med endring fra året før. */
function finBlock(nr, id = 'fin') {
  const r = RS(nr), n9 = String(nr || '').replace(/\D/g, '');
  if (!r) return sec(id, 'Økonomi', `<p class="meta">Har ikke levert årsregnskap til Regnskapsregisteret, eller Maktkartet har ikke hentet det. <a href="https://virksomhet.brreg.no/nb/oppslag/enheter/${n9}" rel="noopener">Se hos Brønnøysundregistrene</a></p>`);
  const f = r.forrige || {}, margin = r.inn ? Math.round(100 * r.drift / r.inn) : null, ekAndel = r.eiend ? Math.round(100 * r.ek / r.eiend) : null;
  return sec(id, `Økonomi ${r.aar}`, `<div class="kpis fin">
    <div><b>${money2(r.inn, r.valuta)}</b><span>driftsinntekter ${chg(r.inn, f.inn)}</span></div>
    <div><b class="${r.drift < 0 ? 'neg' : ''}">${money2(r.drift, r.valuta)}</b><span>driftsresultat${margin != null && r.inn > 0 ? ` (margin ${margin} %)` : ''}</span></div>
    <div><b class="${r.res < 0 ? 'neg' : ''}">${money2(r.res, r.valuta)}</b><span>årsresultat ${chg(r.res, f.res)}</span></div>
    <div><b>${money2(r.ek, r.valuta)}</b><span>egenkapital${ekAndel != null ? ` (${ekAndel} % av eiendelene)` : ''}</span></div>
    <div><b>${money2(r.gjeld, r.valuta)}</b><span>gjeld</span></div>
  </div>
  ${f.aar ? `<p class="meta">Året før (${f.aar}): driftsinntekter ${money2(f.inn, r.valuta)}, årsresultat ${money2(f.res, r.valuta)}.</p>` : ''}
  <p class="meta">Årsregnskap for ${r.aar}${r.type === 'konsern' ? ' (konsern)' : ''} fra Regnskapsregisteret${r.revidert === false ? ', ikke revidert' : ''}. <a href="https://virksomhet.brreg.no/nb/oppslag/enheter/${n9}" rel="noopener">Hele regnskapet hos Brønnøysundregistrene</a></p>`);
}

function orgHtml(c, personer, pols) {
  const roleRows = (personer || []).map(p => { const r = p.rep && byId[p.rep]; return `<tr><td>${r ? `<a class="rep" href="#rep-${r.h}">${esc(p.navn)}</a> ${dot(r.parti)}<span class="meta">${esc(r.parti)}</span>` : esc(p.navn)}</td><td>${esc(p.rolle)}</td></tr>`; }).join('');
  const declOnly = pols.filter(p => !(personer || []).some(x => x.rep === p.id));
  return `<a class="back" href="#selskaper">← Selskaper</a><div class="head"><h1>${esc(c.navn)}</h1>${followBtn('org', c.nr)}</div><div class="meta">Org.nr. ${org(c.nr)} · ${esc(FORM[c.form] || c.formNavn || c.form)}</div>
  <dl class="facts"><dt>Kommune</dt><dd>${esc(c.kommune || '–')}</dd><dt>Bransje</dt><dd>${esc(c.nar || '–')}</dd><dt>Ansatte</dt><dd>${c.ans > 0 ? nf(c.ans) : 'Ikke registrert'}</dd><dt>Registrert</dt><dd>${esc(c.ar || '–')}</dd><dt>Status</dt><dd>${flag(c.flag) || 'Aktiv'}</dd></dl>
  ${finBlock(c.nr)}
  ${listedLink(c.nr, c.navn)}
  ${donationHtml(c.navn)}
  <h2>Roller</h2>${roleRows ? `<table><thead><tr><th>Navn</th><th>Rolle</th></tr></thead><tbody>${roleRows}</tbody></table>` : `<p class="empty">${c.nRoller ? `${c.nRoller} roller registrert. Henter navn fra Brønnøysund …` : 'Ingen personroller registrert.'}</p>`}
  ${declOnly.length ? `<h3>Oppgitt i interesseregisteret av</h3><p>${polChips(declOnly.map(p => p.id))}</p>` : ''}
  <div class="links"><a href="https://virksomhet.brreg.no/nb/oppslag/enheter/${org(c.nr).replace(/ /g, '')}">Brønnøysundregistrene</a></div>`;
}
async function renderOrg(nr) {
  if (!/^\d{9}$/.test(nr)) return;
  const v = $('v-org'), local = byNr[nr];
  const localPols = local ? local.ids.map(id => ({ id })) : [];
  v.innerHTML = local ? orgHtml(local, local.personer, localPols) : '<p class="loading">Henter fra Brønnøysund …</p>';
  document.title = (local ? local.navn : 'Selskap') + ' – Maktkartet';
  try {
    let e;
    if (SERVER) { const r = await fetch('/api/enhet/' + nr); e = await r.json(); if (!r.ok) throw new Error(e.feil); }
    else { e = await brEnhet(nr); if (!e) throw new Error('Fant ikke enheten i Brønnøysund'); }
    if (location.hash.slice(1) === 'org-' + nr) { v.innerHTML = orgHtml(e, e.personer, e.politikere || []); document.title = e.navn + ' – Maktkartet'; }
  } catch (err) { if (!local) v.innerHTML = `<a class="back" href="#selskaper">← Selskaper</a><p class="empty">${esc(err.message || 'Fant ikke selskapet')}</p>`; }
}

/* ---------- global søk ---------- */
let gi = -1;
function closeSearch() { $('gres').hidden = true; $('gq').setAttribute('aria-expanded', 'false'); gi = -1; }
function globalSearch() {
  const q = $('gq').value.trim().toLowerCase(), box = $('gres');
  if (!q) return closeSearch();
  const words = q.split(/\s+/);
  const rs = reps.filter(r => words.every(w => r.key.includes(w))).slice(0, 6);
  const cs = cos.filter(c => words.every(w => c.key.includes(w))).slice(0, 5);
  const gs = govs.filter(g => words.every(w => (g.navn + ' ' + g.tittel + ' ' + g.dep).toLowerCase().includes(w))).slice(0, 5);
  const is = [...insiders.values()].filter(x => words.every(w => (x.navn + ' ' + x.list.map(i => i.sel).join(' ')).toLowerCase().includes(w))).slice(0, 5);
  const ss = [...stocks.values()].filter(st => words.every(w => (st.navn + ' ' + (st.tick || '')).toLowerCase().includes(w))).slice(0, 5);
  const ps = P ? Object.keys(P.partier).filter(p => words.every(w => (pname(p) + ' ' + short(p) + ' ' + P.partier[p].leder).toLowerCase().includes(w))) : [];
  box.innerHTML = (ps.length ? '<div class="h">Partier</div>' + ps.map(p => `<a href="#parti-${p}"><span>${dot(p)}${esc(pname(p))}</span><span class="meta">${esc(P.partier[p].leder)}</span></a>`).join('') : '') + (gs.length ? '<div class="h">Regjeringen</div>' + gs.map(g => `<a href="#statsrad-${hid(g.id)}"><span class="who">${avatar(govKeys(g), g.navn, g.parti)}${esc(g.navn)}</span><span class="meta">${esc(g.tittel)}</span></a>`).join('') : '') + (rs.length ? '<div class="h">Representanter</div>' + rs.map(r => `<a href="#rep-${r.h}"><span class="who">${avatar(['rep:' + r.id], r.navn, r.parti)}${esc(r.navn)}</span><span class="meta">${esc(r.parti)} · ${esc(r.fylke)}</span></a>`).join('') : '') +
    (ss.length ? '<div class="h">Aksjer på Oslo Børs</div>' + ss.map(st => `<a href="#aksje-${st.k}"><span>${esc(st.navn)}</span><span class="meta">${esc(st.tick || '')} · ${st.ins.length} innsidehandler</span></a>`).join('') : '') +
    (is.length ? '<div class="h">Innsidere på Oslo Børs</div>' + is.map(x => `<a href="#person-${x.s}"><span class="who">${avatar(['ins:' + x.s], x.navn)}${esc(x.navn)}</span><span class="meta">${esc([...new Set(x.list.map(i => i.sel))].slice(0, 2).join(', '))}</span></a>`).join('') : '') +
    (cs.length ? '<div class="h">Selskaper koblet til politikere</div>' + cs.map(c => `<a href="#org-${org(c.nr).replace(/ /g, '')}"><span>${esc(c.navn)}</span><span class="meta">${org(c.nr)}</span></a>`).join('') : '') +
    `<div class="h">Hele Enhetsregisteret</div><button type="button" data-live><span>Søk «${esc($('gq').value.trim())}» i Brønnøysund</span><span class="meta">→</span></button>`;
  box.hidden = false; $('gq').setAttribute('aria-expanded', 'true'); gi = -1;
}
function goLive() {
  const q = $('gq').value.trim(); $('lq').value = q; closeSearch();
  if (location.hash !== '#selskaper') location.hash = 'selskaper';
  liveSearch(q);
}

/* ---------- oppstart ---------- */
(async () => {
  try { prepare(await load()); } catch (e) { $('repsLede').textContent = 'Kunne ikke laste data. Prøv igjen om litt.'; return; }
  $('repsLede').textContent = `${reps.length} representanter. Klikk et sete eller en rad for å se verv, selskaper, aksjehandler og spørsmål. Oppdatert ${date(D.hentet, true)}.`;
  $('foot').textContent = `Data fra Stortinget, Stortingets interesseregister (${date(D.regDato, true)}) og Brønnøysundregistrene. Oppdatert ${date(D.hentet, true)}.`;
  omView();
  [...new Set(reps.map(r => r.fylke))].sort((a, b) => a.localeCompare(b, 'nb')).forEach(f => $('fy').add(new Option(f, f)));
  Object.entries(D.kom).sort((a, b) => a[1].localeCompare(b[1], 'nb')).forEach(([k, v]) => $('ko').add(new Option(v, k)));
  for (const sel of ['vp', 'np', 'fp']) PORDER().filter(p => D.parti[p]).forEach(p => $(sel).add(new Option(pname(p), p)));
  [...new Set(allNews().map(n => n.kilde))].sort().forEach(s => $('ns').add(new Option(s, s)));
  homeView(); questionsView(); govView(); chamber(); repList(); tradesView(); cosView(); partiesView(); votesView(); agreeView(); promisesView(); newsView(); factsView(); dummiesView();
  $('v-dummies').addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]'), go = e.target.closest('[data-go-q]'), a = e.target.closest('[data-a]');
    const top = () => { const el = $('duTabs'); if (el.getBoundingClientRect().top < 0 || el.getBoundingClientRect().top > innerHeight * .6) el.scrollIntoView({ block: 'start' }); };
    if (tab) DU.tab = tab.dataset.tab;
    if (go) DU.i = Math.max(0, Math.min(D.dummies.tema.length, Number(go.dataset.goQ)));
    if (tab || go) { dummiesView(); top(); return; }
    if (a) {
      const id = a.dataset.a; DU.ans[id] = Number(a.dataset.v); DU.sel.add(id); duAutoSave();
      for (const b of a.parentNode.children) b.setAttribute('aria-pressed', b === a);
      setTimeout(() => { if (D.dummies.tema[DU.i]?.id === id) { DU.i++; duResult(); top(); } }, 260);
    } else if (e.target.id === 'duReset') { DU.sel.clear(); DU.ans = {}; DU.vik = {}; DU.i = 0; dummiesView(); top(); }
  });
  $('v-dummies').addEventListener('change', e => { const w = e.target.dataset.w; if (w) { DU.vik[w] = e.target.checked; DU.sel.add(w); $('duPanel').querySelector('.qside').innerHTML = duMini(); duAutoSave(); } });
  kontoInit();
  document.addEventListener('click', e => { if (e.target.closest('#v-konto, [data-f], [data-login]')) kontoClick(e); });
  $('v-dummies').addEventListener('change', e => { if (e.target.id === 'duConsent' && e.target.checked) setConsent(true); });
  $('v-konto').addEventListener('change', async e => {
    if (e.target.id !== 'koEpost') return;
    try { await api(`profiles?id=eq.${KO.s.user.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ epostvarsler: e.target.checked }) }); KO.profil.epostvarsler = e.target.checked; }
    catch (err) { e.target.checked = !e.target.checked; alertBox(err.message); }
  });
  [...new Set(holdings.map(x => x.gruppe))].forEach(g => $('hg').add(new Option(g, g)));
  PORDER().filter(p => D.parti[p]).forEach(p => $('hp').add(new Option(pname(p), p)));
  holdingsView(); ['hg', 'hp', 'hq', 'hh'].forEach(id => $(id).addEventListener('input', holdingsView));
  insiderView(); ['it', 'iq', 'ip'].forEach(id => $(id).addEventListener('input', insiderView));
  bourseView(); listedView(); moneyView(); flaggingView(); ['fr', 'fq'].forEach(id => $(id).addEventListener('input', flaggingView));
  ['lq', 'lm', 'ls'].forEach(id => $(id).addEventListener('input', listedView));
  ['vp', 'vf'].forEach(id => $(id).addEventListener('input', votesView));
  ['np', 'ns'].forEach(id => $(id).addEventListener('input', newsView));
  $('fp').addEventListener('input', factsView); $('ft').addEventListener('input', factsView);
  $('promFilter').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { promStatus = b.dataset.st; promisesView(); } });

  $('leg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; off.has(b.dataset.p) ? off.delete(b.dataset.p) : off.add(b.dataset.p); legend(); repList(); });
  ['fy', 'ko', 'so'].forEach(id => $(id).addEventListener('input', repList));
  [...new Set(trades.map(x => x.r.parti))].sort().forEach(p => $('tpp').add(new Option(pname(p), p)));
  $('tt').addEventListener('input', tradesView); $('tpp').addEventListener('input', tradesView);
  ['cf', 'cs'].forEach(id => $(id).addEventListener('input', cosView));
  $('liveForm').addEventListener('submit', e => { e.preventDefault(); liveSearch($('lq').value.trim()); });
  document.addEventListener('click', e => {
    const j = e.target.closest('[data-jump]');
    if (j) { e.preventDefault(); document.getElementById(j.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const tr = e.target.closest('tr[data-go]');
    if (tr && !e.target.closest('a')) location.hash = tr.dataset.go;
    if (e.target.closest('[data-live]')) goLive();
    if (!e.target.closest('.search')) closeSearch();
  });
  $('gq').addEventListener('input', globalSearch);
  $('gq').addEventListener('focus', () => $('gq').value && globalSearch());
  $('gq').addEventListener('keydown', e => {
    const items = [...$('gres').querySelectorAll('a,button')];
    if (e.key === 'Escape') return closeSearch();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); gi = (gi + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items.forEach((x, i) => x.classList.toggle('on', i === gi)); return; }
    if (e.key === 'Enter') { e.preventDefault(); const t = items[gi >= 0 ? gi : 0]; if (!t) return; if (t.dataset.live !== undefined) goLive(); else { location.hash = t.getAttribute('href').slice(1); $('gq').blur(); } }
  });
  addEventListener('hashchange', route);
  route();
})();
