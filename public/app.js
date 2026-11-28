// EYE – ingen rammeverk. All tekst fra data går gjennom esc(), alle lenker gjennom url().
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
const VIEWS = ['home', 'gov', 'minister', 'person', 'stock', 'owner', 'owners', 'flagging', 'insider', 'holdings', 'konto', 'personvern', 'reps', 'rep', 'votes', 'agree', 'parties', 'party', 'promises', 'news', 'dummies', 'trades', 'cos', 'org', 'facts', 'om'];
const SECTIONS = {
  st: [['stortinget', 'Representanter'], ['voteringer', 'Voteringer'], ['enighet', 'Hvem stemmer med hvem']],
  pa: [['partier', 'Oversikt'], ['lofter', 'Løfter og resultater'], ['nyheter', 'Nyheter']],
  pe: [['handler', 'Aksjehandler'], ['aksjeposter', 'Aksjeposter'], ['selskaper', 'Selskaper']],
  ei: [['eiere', 'Toppliste'], ['storeeiere', 'Store eiere'], ['innside', 'Alle innsidehandler']],
  fa: [], om: [], du: [], ko: [], ov: [], rg: [],
};
const HASHVIEW = { oversikt: ['home', 'ov'], regjeringen: ['gov', 'rg'], stortinget: ['reps', 'st'], voteringer: ['votes', 'st'], enighet: ['agree', 'st'], partier: ['parties', 'pa'], lofter: ['promises', 'pa'], nyheter: ['news', 'pa'], handler: ['trades', 'pe'], aksjeposter: ['holdings', 'pe'], innside: ['insider', 'ei'], eiere: ['owners', 'ei'], storeeiere: ['flagging', 'ei'], selskaper: ['cos', 'pe'], faktasjekk: ['facts', 'fa'], forklart: ['dummies', 'du'], om: ['om', 'om'], konto: ['konto', 'ko'], personvern: ['personvern', 'ko'] };
function show(v, sec, sub) {
  for (const x of VIEWS) $('v-' + x).hidden = x !== v;
  for (const a of document.querySelectorAll('#mainnav a')) a.dataset.s === sec ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  $('subnav').innerHTML = (SECTIONS[sec] || []).map(([h, l]) => `<a href="#${h}"${h === sub ? ' aria-current="page"' : ''}>${l}</a>`).join('');
}
function route() {
  const h = decodeURIComponent(location.hash.slice(1)) || 'oversikt'; let m;
  closeSearch();
  if ((m = h.match(/^rep-(\w+)$/)) && byH[m[1]]) { renderRep(byH[m[1]]); show('rep', 'st', 'stortinget'); }
  else if ((m = h.match(/^parti-(\w+)$/)) && P?.partier[m[1]]) { renderParty(m[1]); show('party', 'pa', 'partier'); }
  else if ((m = h.match(/^org-(\d{9})$/))) { renderOrg(m[1]); show('org', 'pe', 'selskaper'); }
  else if ((m = h.match(/^statsrad-(\w+)$/)) && govByH[m[1]]) { renderMinister(govByH[m[1]]); show('minister', 'rg', 'regjeringen'); }
  else if ((m = h.match(/^person-([a-z0-9-]+)$/)) && insiders.has(m[1])) { renderPerson(insiders.get(m[1])); show('person', 'ei', 'eiere'); }
  else if ((m = h.match(/^aksje-([a-z0-9-]+)$/)) && stocks.has(m[1])) { renderStock(stocks.get(m[1])); show('stock', 'ei', 'eiere'); }
  else if ((m = h.match(/^eier-([a-z0-9-]+)$/)) && owners.has(m[1])) { renderOwner(owners.get(m[1])); show('owner', 'ei', 'storeeiere'); }
  else { const [v, s] = HASHVIEW[h] || HASHVIEW.oversikt; if (v === 'konto') kontoView(); show(v, s, HASHVIEW[h] ? h : 'oversikt'); document.title = 'EYE – Stortinget, penger og makt'; }
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
  <p class="meta">Netto = kjøpt minus solgt i perioden EYE har data for. Det er ikke nødvendigvis hele beholdningen; den står i interesseregisteret.</p>
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
  ${toc([['s-om', 'Om'], r.cos.length && ['s-cos', `Selskaper (${r.cos.length})`], r.trades.length && ['s-tr', `Aksjehandler (${r.trades.length})`], ['s-reg', 'Interesseregisteret'], ['s-q', 'Spørsmål'], ['s-lenker', 'Kilder']])}
  <div class="cols">
  ${sec('s-om', 'Om', `<dl class="facts">
    <dt>Parti</dt><dd>${partyLink}</dd><dt>Valgdistrikt</dt><dd>${esc(r.fylke)}</dd>
    <dt>Komité</dt><dd>${r.kom.length ? r.kom.map(k => esc(D.kom[k] || k)).join(', ') : '–'}</dd>
    <dt>Født</dt><dd>${esc(r.fodt || '–')}</dd>
    <dt>På Stortinget</dt><dd>${num(r.per)} ${r.per === 1 ? 'periode' : 'perioder'}${r.forst ? ` (første i ${esc(r.forst)})` : ''}</dd>
    ${r.utd ? `<dt>Utdanning</dt><dd>${esc(r.utd)}</dd>` : ''}${r.yrke ? `<dt>Yrke</dt><dd>${esc(r.yrke)}</dd>` : ''}
    ${om ? `<dt>Voteringer</dt><dd>Stemte i ${om[0] - om[1]} av ${om[0]} personlige voteringer. <span class="meta">I vanlige voteringer stemmer ofte bare rundt 101 representanter etter avtale mellom partiene, så tallet viser ikke fravær alene.</span></dd>` : ''}
  </dl>`)}
  ${sec('s-q', 'Spørsmål til regjeringen', `${r.q ? `<p>${num(r.q)} spørsmål denne perioden. Mest til ${r.top.map(t => `${esc(t.til)} (${num(t.n)})`).join(', ')}.</p>` : '<p class="empty">Ingen spørsmål denne perioden.</p>'}
  ${r.siste ? `<p><span class="meta">Siste, ${date(r.siste.d)} (${QTYPE[r.siste.t] || ''}):</span><br>«${esc(r.siste.tit)}» <a href="https://www.stortinget.no/no/Saker-og-publikasjoner/Sporsmal/${r.siste.t === 'I' ? 'Interpellasjoner/Interpellasjon/' : 'Skriftlige-sporsmal-og-svar/Skriftlig-sporsmal/'}?qnid=${encodeURIComponent(r.siste.id)}">Les svaret</a></p>` : ''}`)}
  </div>
  ${r.cos.length ? sec('s-cos', 'Selskaper', `<div class="tw"><table class="list"><thead><tr><th>Selskap</th><th>Rolle i Brønnøysund</th><th class="n">Eier (fra registeret)</th><th class="n hide-s">Ansatte</th></tr></thead><tbody>${coRows}</tbody></table></div>
  <p class="meta">Selskapene representanten har oppgitt i interesseregisteret. Rolle hentes fra Brønnøysundregistrene. Eierandel leses automatisk fra § 9 i interesseregisteret – sjekk teksten nederst på siden.</p>`) : ''}
  ${r.trades.length ? sec('s-tr', 'Aksjehandler', tradeBlock(r.trades)) : ''}
  ${sec('s-reg', 'Interesseregisteret', `${rg.ingen ? '<p>Har ingen registreringspliktige interesser.</p>' : paras.length ? `<dl class="facts reg">${paras.map(k => `<dt>§ ${k} ${PARA[k] || ''}</dt><dd>${esc(rg[k])}</dd>`).join('')}</dl>` : `<p class="empty">Ingen oppføringer.</p>`}
  <p class="meta">Ordrett fra Stortingets register, ajourført ${date(D.regDato, true)}.</p>`)}
  ${sec('s-lenker', 'Kilder', `<div class="links"><a href="https://www.stortinget.no/no/Representanter-og-komiteer/Representantene/Representant/?perid=${encodeURIComponent(r.id)}">Stortingets side</a>${D.regUrl ? `<a href="${url(D.regUrl)}">Interesseregisteret (PDF)</a>` : ''}${prof(['rep:' + r.id]).wiki ? `<a href="${url(prof(['rep:' + r.id]).wiki.url)}" rel="noopener">Wikipedia</a>` : ''}</div>`)}`;
  document.title = `${r.navn} – EYE`;
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
  <div class="kpis"><div><b>${g.trades.length}</b><span>aksjehandler meldt</span></div><div><b>${paras.length}</b><span>registrerte interesser</span></div></div>
  ${g.trades.length ? sec('s-tr', 'Aksjehandler', tradeBlock(g.trades)) : ''}
  ${sec('s-reg', 'Interesseregisteret', !reg ? '<p class="empty">Står ikke i registeret ennå.</p>' : reg.ingen ? '<p>Har ingen registreringspliktige interesser.</p>' : paras.length ? `<dl class="facts reg">${paras.map(k => `<dt>§ ${k} ${PARA[k] || ''}</dt><dd>${esc(reg[k])}</dd>`).join('')}</dl><p class="meta">Ordrett fra regjeringsdelen av Stortingets register, ajourført ${date(D.regDato, true)}.</p>` : '<p class="empty">Ingen oppføringer.</p>')}
  ${sec('s-lenker', 'Kilder', `<div class="links">${D.regUrl ? `<a href="${url(D.regUrl)}">Interesseregisteret (PDF)</a>` : ''}<a href="https://www.regjeringen.no/no/om-regjeringa/" rel="noopener">Regjeringen.no</a>${prof(govKeys(g)).wiki ? `<a href="${url(prof(govKeys(g)).wiki.url)}" rel="noopener">Wikipedia</a>` : ''}</div>`)}`;
  document.title = `${g.navn} – EYE`;
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
  document.title = `${x.navn} – EYE`;
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
  $('v-stock').innerHTML = `<a class="back" href="#eiere">← Børs og eiere</a>
  <div class="hrow"><div><div class="kicker">Børsnotert${st.tick ? ` · <span class="tick">${esc(st.tick)}</span>` : ''}</div><h1>${esc(st.navn)}</h1></div></div>
  ${st.om ? `<div class="wiki"><p>${esc(st.om)}</p><div class="meta">Selskapets egen beskrivelse, fra <a href="${url(st.omU)}" rel="noopener">børsmelding ${date(st.omDato)}</a></div></div>` : '<p class="meta">Selskapet har ikke tatt med en beskrivelse av seg selv i børsmeldingene vi har lest.</p>'}
  <div class="kpis"><div><b>${L.length}</b><span>innsidehandler, 60 dager</span></div><div><b>${buy ? kr(buy) : '–'}</b><span>kjøpt av innsidere, kr</span></div><div><b>${sell ? kr(sell) : '–'}</b><span>solgt av innsidere, kr</span></div><div><b>${F.length}</b><span>flaggemeldinger, 90 dager</span></div>${PT.length ? `<div><b>${new Set(PT.map(t => t.r.navn)).size}</b><span>politikere har handlet aksjen</span></div>` : ''}${lastPrice ? `<div><b>${lastPrice.kurs.toLocaleString('nb-NO')} kr</b><span>kurs i siste innsidehandel (${sdate(lastPrice.d)})</span></div>` : ''}</div>
  ${toc([L.length && ['a-ins', `Innsidere (${per.size})`], latest.length && ['a-eiere', `Store eiere (${latest.length})`], PT.length && ['a-pol', `Politikere (${PT.length})`], D.aksjer?.[st.tick || st.navn]?.nr && ['a-fin', 'Økonomi'], ['a-br', 'Brønnøysund'], ['a-kilder', 'Kilder']])}
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
  <div id="aBrreg"></div>
  ${sec('a-kilder', 'Kilder', `<div class="links">${[...L, ...F].slice(0, 1).map(x => `<a href="${url(x.u)}" rel="noopener">Siste børsmelding (NewsWeb)</a>`).join('')}</div><p class="meta">Innsidehandler og flaggemeldinger fra Oslo Børs NewsWeb. Navn, beløp og andeler leses automatisk ut av meldingsteksten og kan være feil – sjekk alltid meldingen.</p>`)}`;
  document.title = `${st.navn} – EYE`;
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
  document.title = `${o.navn} – EYE`;
}

const insiderLink = n => n && insiders.has(slug(n)) ? `<a href="#person-${slug(n)}">${esc(n)}</a>` : esc(n || '–');

/* ---------- oversikt (forsiden) ---------- */
const cut = (t, n) => { t = String(t || ''); return t.length > n ? t.slice(0, n).replace(/\s\S*$/, '') + ' …' : t; };
function homeView() {
  const L = D.innside || [], fk = D.faktasjekk?.sjekker || [];
  $('homeLede').textContent = `EYE samler det som står i offentlige registre om Stortinget, regjeringen og de største pengene på Oslo Børs, og lenker alltid til kilden. Oppdatert ${date(D.hentet, true)}.`;
  $('homeKpis').innerHTML = `<a href="#stortinget"><b>${reps.length}</b><span>stortingsrepresentanter</span></a><a href="#regjeringen"><b>${govs.length}</b><span>statsråder</span></a><a href="#handler"><b>${trades.length}</b><span>aksjehandler fra politikere</span></a><a href="#aksjeposter"><b>${holdings.length}</b><span>aksjeposter hos politisk eksponerte</span></a><a href="#innside"><b>${L.length}</b><span>innsidehandler siste 60 dager</span></a>`;
  const gl = [...govs].sort((a, b) => govRank(a.tittel) - govRank(b.tittel) || a.tittel.localeCompare(b.tittel, 'nb'));
  $('homeGov').innerHTML = gl.length ? sec('h-gov', 'Regjeringen', `<div class="strip">${gl.slice(0, 8).map(g => `<a href="#statsrad-${hid(g.id)}" title="${esc(g.navn)}, ${esc(g.tittel)}">${avatar(govKeys(g), g.navn, g.parti, 'm')}<b>${esc(g.navn)}</b><span>${esc(g.tittel)}</span></a>`).join('')}</div>`, `<a href="#regjeringen">Alle ${gl.length} →</a>`) : '';
  const card = (title, link, body) => `<section class="block"><div class="bh"><h2>${title}</h2>${link}</div>${body}</section>`;
  const row = (av, main, meta, right = '') => `<li>${av}<div class="grow">${main}<div class="meta">${meta}</div></div>${right ? `<b class="n">${right}</b>` : ''}</li>`;
  const tr = trades.slice(0, 6);
  // Største innsidehandler: samme person, selskap og retning slås sammen (f.eks. fem kjøp på rad blir én linje)
  const grp = new Map();
  for (const x of L) if (x.ver && (x.k === 'K' || x.k === 'S')) {
    const k = `${x.navn || ''}|${x.sel}|${x.k}`, g = grp.get(k) || { ...x, sum: 0, n: 0, d: x.d };
    g.sum += x.ver; g.n++; if (x.d > g.d) g.d = x.d; grp.set(k, g);
  }
  const big = [...grp.values()].sort((a, b) => b.sum - a.sum).slice(0, 6);
  // Siste spørsmål til regjeringen (nyeste per representant)
  const qs = reps.filter(r => r.siste?.d).sort((a, b) => b.siste.d.localeCompare(a.siste.d)).slice(0, 6);
  const qUrl = q => `https://www.stortinget.no/no/Saker-og-publikasjoner/Sporsmal/${q.t === 'I' ? 'Interpellasjoner/Interpellasjon/' : 'Skriftlige-sporsmal-og-svar/Skriftlig-sporsmal/'}?qnid=${encodeURIComponent(q.id)}`;
  const A = P?.naaAuto?.nyheter || [];
  const order = P ? partyOrder() : [];
  const fkNew = fk.filter(x => x.d).slice(0, 5), stille = D.faktasjekk?.nyeste && (Date.now() - Date.parse(D.faktasjekk.nyeste)) / 864e5 > 30;
  $('homeDash').innerHTML = [
    tr.length && card('Siste aksjehandler fra politikere', '<a href="#handler">Alle →</a>', `<ul class="feed">${tr.map(t => row(avatar(t.r.h ? ['rep:' + t.rep] : ['gov:' + t.pep], t.r.navn, t.r.parti), `${t.r.h ? `<a href="#rep-${t.r.h}">${esc(t.r.navn)}</a>` : t.pep && govById[t.pep] ? `<a href="#statsrad-${hid(t.pep)}">${esc(t.r.navn)}</a>` : esc(t.r.navn)} ${trade(t.k).toLowerCase()} ${esc(t.sel)}`, `${sdate(t.d)} · ${esc(t.r.parti)}`, kr(t.ver))).join('')}</ul>`),
    big.length && card('Største innsidehandler på børsen', '<a href="#eiere">Toppliste →</a>', `<ul class="feed">${big.map(x => row(avatar(x.navn ? ['ins:' + slug(x.navn)] : [], x.navn || x.sel), `${x.navn ? insiderLink(x.navn) : esc(x.sel)} <span class="meta">${x.n > 1 ? `${x.n} ${x.k === 'K' ? 'kjøp' : 'salg'}` : ITYPE[x.k]}</span>`, `${esc(x.rolle ? x.rolle + ', ' : '')}${stocks.has(slug(x.tick || x.sel)) ? `<a href="#aksje-${slug(x.tick || x.sel)}">${esc(x.sel)}</a>` : esc(x.sel)} · ${x.n > 1 ? 'siste ' : ''}${sdate(x.d)}`, kr(x.sum))).join('')}</ul><p class="meta">Siste 60 dager. Flere handler fra samme person i samme selskap er slått sammen.</p>`),
    qs.length && card('Siste spørsmål til regjeringen', '<a href="#stortinget">Alle representanter →</a>', `<ul class="feed">${qs.map(r => row(avatar(['rep:' + r.id], r.navn, r.parti), `<a href="${url(qUrl(r.siste))}" rel="noopener">${esc(cut(r.siste.tit, 110))}</a>`, `<a href="#rep-${r.h}">${esc(r.navn)}</a> · ${esc(r.parti)} · ${date(r.siste.d)}`)).join('')}</ul>`),
    A.length && card('Akkurat nå i nyhetene', '<a href="#nyheter">Alle nyheter →</a>', `<ul class="feed">${A.slice(0, 5).map(n => row('', `<a href="${url(n.url)}" rel="noopener">${esc(n.tittel)}</a>`, `${esc(n.kilde)} · ${n.ps.map(x => dot(x) + esc(short(x))).join(' ')}`)).join('')}</ul>`),
    order.length && card('Partiene', '<a href="#partier">Mer →</a>', `<ul class="feed">${order.map(p => { const x = P.partier[p], lk = leaderKeys(p), seats = reps.filter(r => r.parti === p).length, poll = P.maling?.snitt[p]; return row(avatar(lk, x.leder, p), `<a href="#parti-${p}">${esc(pname(p))}</a>`, `${esc(x.leder)} · ${seats} mandater`, poll != null ? poll.toFixed(1).replace('.', ',') + ' %' : ''); }).join('')}</ul>${P.maling ? `<p class="meta">Til høyre: snitt på målingene (${esc(P.maling.kilde)}).</p>` : ''}`),
    (D.tall || []).length && card('Tall i debatten', '<a href="#faktasjekk">Alle tall →</a>', `<ul class="feed">${D.tall.filter(t => ['ledighet', 'prisvekst', 'rente', 'bnp'].includes(t.id)).map(t => row('', `<a href="${url(t.url)}" rel="noopener">${esc(t.tittel)}</a>`, `${esc(t.periode)}${t.før ? ` · ${esc(t.før.periode)}: ${fmtNum(t.før.verdi, t.des)} %` : ''}`, `${fmtNum(t.verdi, t.des)} %`)).join('')}</ul><p class="meta">Fra SSB og Norges Bank.</p>`),
    fkNew.length && card('Nytt fra Faktisk.no', '<a href="#faktasjekk">Alle →</a>', `<ul class="feed">${fkNew.map(x => row('', `<a href="${url(x.u)}" rel="noopener">${esc(x.t)}</a>`, `${x.type === 'artikkel' ? 'Artikkel' : 'Faktasjekk'} · ${date(x.d)}${(x.p || []).length ? ' · ' + x.p.map(y => dot(y) + esc(short(y))).join(' ') : ''}`)).join('')}</ul>${stille ? `<p class="meta">Faktisk.no har ikke publisert noe nytt siden ${date(D.faktasjekk.nyeste)}.</p>` : ''}`),
  ].filter(Boolean).join('');
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
  ${toc([['p-saker', 'Saker'], S() && ['p-stem', 'Stemmegivning'], D.lofter?.regjering?.parti === p && ['p-lofter', 'Løfter'], D.lofter?.gjennomslag?.partier?.[p] && ['p-gj', 'Gjennomslag'], (D.faktasjekk?.sjekker || []).some(x => (x.p || []).includes(p)) && ['p-fakta', 'Faktasjekker'], ['p-nyheter', 'Nyheter'], ['p-reps', `Representanter (${mine.length})`]])}
  <h2 id="p-saker">Partiets saker, veid</h2><p class="meta">${esc(P.metode)}</p>
  ${x.saker.map(s => `<div class="sak"><h3>${esc(s.tittel)}</h3><p>${esc(s.standpunkt)}</p><div class="weigh"><div><h4>Tilhengere sier</h4><ul>${s.for.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div><div><h4>Kritikere sier</h4><ul>${s.mot.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div></div><div class="meta" style="margin-top:8px"><a href="${url(s.kilde)}" rel="noopener">Kilde</a></div></div>`).join('')}
  ${partyVotes(p)}
  ${partyPromises(p)}
  <h2 id="p-nyheter">Nyheter</h2>${newsList(x.nyheter)}
  ${auto.length ? `<h3>Siste fra nyhetsstrømmen</h3>${newsList(auto)}<p class="meta">Hentet automatisk hver natt. Bare overskrift og lenke vises.</p>` : ''}
  <h2 id="p-reps">Representantene</h2><div class="tw"><table class="list"><thead><tr><th>Representant</th><th class="n">Spørsmål</th><th class="n">Selskaper</th><th class="n">Handler</th></tr></thead><tbody>${[...mine].sort((a, b) => b.q - a.q).map(r => `<tr data-go="rep-${r.h}"><td><div class="who">${avatar(['rep:' + r.id], r.navn, r.parti)}<div><a href="#rep-${r.h}">${esc(r.navn)}</a><div class="meta">${esc(r.fylke)}</div></div></div></td><td class="n">${num(r.q)}</td><td class="n">${r.cos.length}</td><td class="n">${r.trades.length}</td></tr>`).join('')}</tbody></table></div>`;
  document.title = pname(p) + ' – EYE';
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

/* ---------- politikk for dummies ---------- */
// Svarene holdes bare i minnet. Ingenting lagres, sendes eller legges i adressen.
const DU = { sel: new Set(), ans: {}, vik: {} };
const SCALE = [[-2, 'Helt uenig'], [-1, 'Litt uenig'], [0, 'Nøytral'], [1, 'Litt enig'], [2, 'Helt enig']];
const SLABEL = Object.fromEntries(SCALE);
const ABC = () => Object.keys(D.dummies?.tema[0]?.partier || {}).sort((a, b) => pname(a).localeCompare(pname(b), 'nb'));
function dummiesView() {
  const X = D.dummies; if (!X) { $('v-dummies').innerHTML = '<h1>Politikk for dummies</h1><p class="empty">Mangler innhold.</p>'; return; }
  $('duLede').textContent = X.om;
  $('duMethod').textContent = X.metode + ` Sist gjennomgått ${date(X.oppdatert, true)}.`;
  duBasics(); duMatrix();
  $('duWords').innerHTML = X.ordliste.map(o => `<dt>${esc(o.ord)}</dt><dd>${esc(o.forklaring)}</dd>`).join('');
  $('duTopics').innerHTML = X.tema.map(t => `<button class="tbtn" data-t="${esc(t.id)}" aria-pressed="${DU.sel.has(t.id)}">${esc(t.navn)}</button>`).join('') + `<button class="tbtn" data-t="*">Alle</button>`;
  const chosen = X.tema.filter(t => DU.sel.has(t.id));
  $('duCards').innerHTML = chosen.length ? `<h2>2. Hva mener du?</h2><p class="meta" id="duProg"></p>` + chosen.map(t => duCard(t)).join('') : '<p class="empty">Velg minst én sak over.</p>';
  duResult();
}
function duCard(t) {
  const votes = (S()?.voteringer || []).filter(v => new RegExp(t.sok, 'i').test(v.tittel + ' ' + v.tema)).slice(0, 3);
  const byPos = SCALE.map(([v, l]) => `<div><b>${l}</b>${ABC().filter(p => t.partier[p] === v).map(p => `<span title="${esc(pname(p))}${t.merk?.[p] ? ': ' + esc(t.merk[p]) : ''}">${dot(p)}${esc(short(p))}</span>`).join('')}</div>`).join('');
  return `<div class="du" id="du-${esc(t.id)}"><h3>${esc(t.navn)}</h3><p>${esc(t.kort)}</p>
  <div class="two"><div><b>Argument for:</b> ${esc(t.for)}</div><div><b>Argument mot:</b> ${esc(t.mot)}</div></div>
  <p class="claim">«${esc(t.pastand)}»</p>
  <div class="seg" role="group" aria-label="Hva mener du">${SCALE.map(([v, l]) => `<button data-a="${esc(t.id)}" data-v="${v}" aria-pressed="${DU.ans[t.id] === v}">${l}</button>`).join('')}</div>
  <label class="imp"><input type="checkbox" data-w="${esc(t.id)}" ${DU.vik[t.id] ? 'checked' : ''}> Dette er ekstra viktig for meg</label>
  <details><summary>Hva partiene mener</summary><div class="scale">${byPos}</div>
  <ul>${ABC().filter(p => t.merk?.[p]).map(p => `<li>${dot(p)}<b>${esc(pname(p))}:</b> ${esc(t.merk[p])}</li>`).join('')}</ul>
  ${votes.length ? `<p><b>Slik har de stemt nylig</b> (hentes automatisk):</p><ul class="news">${votes.map(v => `<li>${esc(v.tittel)} – ${esc(v.tema)}<div class="meta">${sdate(v.d)} · ${v.vedtatt ? 'Vedtatt' : 'Forkastet'} ${num(v.for)}–${num(v.mot)}</div><div>${PORDER().filter(x => v.pos[x]).map(x => posCell(x, v.pos[x])).join('')}</div></li>`).join('')}</ul>` : ''}
  <p class="meta">Kilder: ${srcLinks(t.kilder)}</p></details></div>`;
}
function duScores() {
  const X = D.dummies, done = X.tema.filter(t => DU.sel.has(t.id) && DU.ans[t.id] != null);
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
// Norsk politikk på ett minutt: setefordeling og regjering regnes ut fra dataene, så teksten holder seg oppdatert.
function duBasics() {
  const n = reps.length; if (!n) { $('duBasics').innerHTML = ''; return; }
  const seats = PORDER().map(p => [p, reps.filter(r => r.parti === p).length]).filter(x => x[1]);
  const flertall = Math.floor(n / 2) + 1, gp = [...new Set(govs.map(g => g.parti))].filter(Boolean);
  const gs = seats.filter(([p]) => gp.includes(p)).reduce((a, x) => a + x[1], 0);
  const sml = gp.length === 1 ? pname(gp[0]) + ' styrer alene' : gp.map(pname).join(', ') + ' styrer sammen';
  $('duBasics').innerHTML = `<details class="card basics"><summary><b>Norsk politikk på ett minutt</b> <span class="meta">– hvem bestemmer hva?</span></summary>
  <div class="seatbar" role="img" aria-label="Setefordeling på Stortinget">${seats.map(([p, k]) => `<i style="flex:${k};background:${col(p)}" title="${esc(pname(p))}: ${k}"></i>`).join('')}<b style="left:${(100 * flertall / n).toFixed(1)}%"></b></div>
  <div class="meta seatleg">${seats.map(([p, k]) => `<a href="#parti-${esc(p)}">${dot(p)}${esc(short(p))} ${k}</a>`).join(' ')} · streken viser flertall (${flertall})</div>
  <ol class="steps">
  <li><b>Du velger Stortinget.</b> Hvert fjerde år velger vi ${n} representanter. Et parti må ha over 4 % av stemmene for å få utjevningsmandater.</li>
  <li><b>Stortinget gir og tar makt.</b> Det trengs ${flertall} stemmer for å vedta noe. Regjeringen kan bare sitte så lenge den ikke får flertallet mot seg.</li>
  <li><b>Regjeringen styrer landet.</b> ${esc(sml)}${gs ? ` og har ${gs} av ${n} plasser` : ''}. ${gs && gs < flertall ? `Det er under ${flertall}, så regjeringen er en <i>mindretallsregjering</i> og må få med seg andre partier i hver sak.` : gs ? 'Det er flertall, så regjeringen kan få gjennom det meste selv.' : ''} <a href="#regjeringen">Se regjeringen</a>.</li>
  <li><b>Pengene bestemmes i budsjettet.</b> Hver høst legger regjeringen fram statsbudsjettet. Det er her de fleste kompromissene inngås.</li>
  <li><b>Lover blir til slik:</b> regjeringen eller representanter foreslår → en komité på Stortinget behandler saken → Stortinget stemmer. <a href="#voteringer">Se hvordan de har stemt</a>.</li></ol></details>`;
}
function duMatrix() {
  const X = D.dummies, ps = ABC(), lab = { '-2': 'Helt uenig', '-1': 'Litt uenig', 0: 'Nøytral', 1: 'Litt enig', 2: 'Helt enig' };
  $('duMatrix').innerHTML = `<details class="card"><summary><b>Alle partiene på alle sakene</b> <span class="meta">– oversikt over påstandene</span></summary>
  <div class="tw"><table class="list mx"><thead><tr><th>Påstand</th>${ps.map(p => `<th title="${esc(pname(p))}">${esc(short(p))}</th>`).join('')}</tr></thead><tbody>
  ${X.tema.map(t => `<tr><td><b>${esc(t.navn)}</b><div class="meta">${esc(t.pastand)}</div></td>${ps.map(p => { const v = t.partier[p]; return `<td class="v v${v < 0 ? 'm' : ''}${Math.abs(v)}" title="${esc(pname(p))}: ${lab[v]}${t.merk?.[p] ? ' – ' + esc(t.merk[p]) : ''}">${v > 0 ? '+' + v : v < 0 ? '−' + -v : '0'}</td>`; }).join('')}</tr>`).join('')}
  </tbody></table></div><p class="meta">+2 = helt enig, −2 = helt uenig i påstanden. Hold over en rute for forklaring. Kildene står under hver sak.</p></details>`;
}
function duResult() {
  duSaveBox();
  const { done, list } = duScores();
  const sel = D.dummies.tema.filter(t => DU.sel.has(t.id)), left = sel.filter(t => DU.ans[t.id] == null);
  if ($('duProg')) $('duProg').innerHTML = sel.length ? `Du har svart på ${sel.length - left.length} av ${sel.length}.${left.length ? ` <button class="linkbtn" data-next="${esc(left[0].id)}">Neste: ${esc(left[0].navn)} ↓</button>` : ' Se resultatet under.'}` : '';
  $('duResult').innerHTML = done.length ? `<div class="dures"><h2>3. Disse partiene er mest enige med deg</h2>
  <p class="meta">Basert på ${done.length} ${done.length === 1 ? 'sak' : 'saker'}. Jo flere saker du svarer på, jo mer treffsikkert. Dette er ikke et råd om hva du bør stemme.</p>
  ${list.map(r => `<div class="row2"><a href="#parti-${r.p}">${dot(r.p)}${esc(pname(r.p))}</a><div class="dubar"><i style="width:${r.pct}%;background:${col(r.p)}"></i></div><b class="n">${r.pct} %</b></div>
  <div class="meta" style="margin:-2px 0 8px">${r.enig.length ? 'Enige om: ' + esc(r.enig.join(', ')) : ''}${r.enig.length && r.uenig.length ? ' · ' : ''}${r.uenig.length ? 'Uenige om: ' + esc(r.uenig.join(', ')) : ''}</div>`).join('')}
  <button class="filterbtn" id="duReset">Start på nytt</button></div>` : '';
}


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
  const v = $('v-konto'); document.title = 'Min side – EYE';
  if (!AUTH) { v.innerHTML = '<h1>Konto</h1><p class="empty">Brukerkontoer er ikke slått på ennå.</p>'; return; }
  const msg = KO.melding ? `<p class="card" role="status">${esc(KO.melding)}</p>` : ''; KO.melding = '';
  if (!KO.s) {
    if (!KO.prov) KO.prov = await fetch(AUTH.url + '/auth/v1/settings', { headers: { apikey: AUTH.key }, credentials: 'omit' }).then(r => r.json()).then(s => s.external || {}).catch(() => ({ google: true }));
    v.innerHTML = `<h1>Logg inn</h1>${msg}<p class="lede">Med en konto kan du følge politikere, partier og selskaper og se hva som er nytt siden sist. Du kan også lagre svarene dine i Politikk for dummies, hvis du vil.</p>
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
  <div class="card"><h2>Svar i Politikk for dummies</h2>${KO.profil?.samtykke_svar ? `<p>Du har gitt samtykke ${date(KO.profil.samtykke_svar.slice(0, 10))}. ${KO.svar?.length || 0} svar er lagret.</p><button class="danger" id="koTrekk">Trekk samtykke og slett svarene</button>` : '<p>Svarene dine lagres ikke. Du kan slå på lagring nederst i <a href="#forklart">Politikk for dummies</a>.</p>'}</div>
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
    : `<div class="card"><label class="imp"><input type="checkbox" id="duConsent"> Jeg samtykker til at EYE lagrer svarene mine. Jeg forstår at de viser politiske meninger, og at jeg kan slette dem når som helst.</label></div>`;
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
function ownersView() {
  const L = D.innside || [], F = D.flagging || [];
  const sum = l => l.reduce((a, x) => a + (x.ver || 0), 0);
  $('ok').innerHTML = `<div><b>${kr(sum(L.filter(x => x.k === 'K')))}</b><span>kjøpt av innsidere, 60 dager</span></div><div><b>${kr(sum(L.filter(x => x.k === 'S')))}</b><span>solgt av innsidere</span></div><div><b>${new Set(L.map(x => x.sel)).size}</b><span>selskaper med innsidehandel</span></div><div><b>${F.length}</b><span>flaggemeldinger, 90 dager</span></div>`;
  $('topTrades').tBodies[0].innerHTML = L.filter(x => x.ver && (x.k === 'K' || x.k === 'S')).sort((a, b) => b.ver - a.ver).slice(0, 25).map(x => `<tr><td class="n">${sdate(x.d)}</td><td><div class="who">${avatar(x.navn ? ['ins:' + slug(x.navn)] : [], x.navn || '?')}<div>${insiderLink(x.navn)}<div class="meta">${ITYPE[x.k]}${x.rolle ? ' · ' + esc(x.rolle) : ''}</div></div></div></td><td>${stocks.has(slug(x.tick || x.sel)) ? `<a href="#aksje-${slug(x.tick || x.sel)}">${esc(x.sel)}</a>` : esc(x.sel)} <a href="${url(x.u)}" rel="noopener" class="meta">melding</a></td><td class="n">${kr(x.ver)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Ingen data.</td></tr>';
  const people = new Map();
  for (const x of L.filter(x => x.navn)) {
    const p = people.get(x.navn) || { navn: x.navn, roller: new Set(), n: 0, k: 0, s: 0, pol: x.pol };
    p.roller.add(`${x.rolle || ''} ${x.sel}`.trim()); p.n++; if (x.k === 'K') p.k += x.ver || 0; if (x.k === 'S') p.s += x.ver || 0; people.set(x.navn, p);
  }
  $('topPeople').tBodies[0].innerHTML = [...people.values()].sort((a, b) => (b.k + b.s) - (a.k + a.s) || b.n - a.n).slice(0, 30).map(p => `<tr data-go="person-${slug(p.navn)}"><td><div class="who">${avatar(['ins:' + slug(p.navn)], p.navn)}<div><b>${insiderLink(p.navn)}</b>${p.pol ? ' <span class="chip ok">politiker</span>' : ''}</div></div></td><td>${esc([...p.roller].join(' · '))}</td><td class="n">${p.n}</td><td class="n">${p.k ? kr(p.k) : '–'}</td><td class="n hide-s">${p.s ? kr(p.s) : '–'}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Ingen data.</td></tr>';
  const owners = new Map();
  for (const f of F.filter(f => f.eier)) { const o = owners.get(f.eier) || { eier: f.eier, sel: new Map() }; o.sel.set(f.sel, f); owners.set(f.eier, o); }
  $('topOwners').tBodies[0].innerHTML = [...owners.values()].sort((a, b) => b.sel.size - a.sel.size).slice(0, 20).map(o => `<tr><td><b>${ownerLink(o.eier)}</b></td><td>${[...o.sel.values()].map(f => `${stocks.has(slug(f.tick || f.sel)) ? `<a href="#aksje-${slug(f.tick || f.sel)}">${esc(f.sel)}</a>` : esc(f.sel)}${f.pst != null ? ` (${String(f.pst).replace('.', ',')} %${f.retning === 'opp' ? ' ▲' : f.retning === 'ned' ? ' ▼' : ''})` : ''}`).join(', ')}</td></tr>`).join('') || '<tr><td colspan="2" class="empty">Ingen data.</td></tr>';
}
function flaggingView() {
  const r = $('fr').value, q = $('fq').value.trim().toLowerCase();
  const list = (D.flagging || []).filter(f => (!r || f.retning === r) && (!q || (f.sel + ' ' + (f.eier || '') + ' ' + f.tekst).toLowerCase().includes(q)));
  $('flagTable').tBodies[0].innerHTML = list.slice(0, 300).map(f => `<tr><td class="d">${sdate(f.d)}</td><td><b>${stocks.has(slug(f.tick || f.sel)) ? `<a href="#aksje-${slug(f.tick || f.sel)}">${esc(f.sel)}</a>` : esc(f.sel)}</b></td><td>${ownerLink(f.eier)}${f.retning ? `<div class="meta">${f.retning === 'opp' ? '<span class="k">▲ økte</span>' : '<span class="s">▼ reduserte</span>'}</div>` : ''}</td><td class="n">${f.pst != null ? String(f.pst).replace('.', ',') + ' %' : '–'}</td><td class="hide-s">${esc(f.tekst || f.tittel)} <a href="${url(f.u)}" rel="noopener">Les meldingen</a></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Ingen meldinger.</td></tr>';
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
  if (!r) return sec(id, 'Økonomi', `<p class="meta">Har ikke levert årsregnskap til Regnskapsregisteret, eller EYE har ikke hentet det. <a href="https://virksomhet.brreg.no/nb/oppslag/enheter/${n9}" rel="noopener">Se hos Brønnøysundregistrene</a></p>`);
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
  <h2>Roller</h2>${roleRows ? `<table><thead><tr><th>Navn</th><th>Rolle</th></tr></thead><tbody>${roleRows}</tbody></table>` : `<p class="empty">${c.nRoller ? `${c.nRoller} roller registrert. Henter navn fra Brønnøysund …` : 'Ingen personroller registrert.'}</p>`}
  ${declOnly.length ? `<h3>Oppgitt i interesseregisteret av</h3><p>${polChips(declOnly.map(p => p.id))}</p>` : ''}
  <div class="links"><a href="https://virksomhet.brreg.no/nb/oppslag/enheter/${org(c.nr).replace(/ /g, '')}">Brønnøysundregistrene</a></div>`;
}
async function renderOrg(nr) {
  if (!/^\d{9}$/.test(nr)) return;
  const v = $('v-org'), local = byNr[nr];
  const localPols = local ? local.ids.map(id => ({ id })) : [];
  v.innerHTML = local ? orgHtml(local, local.personer, localPols) : '<p class="loading">Henter fra Brønnøysund …</p>';
  document.title = (local ? local.navn : 'Selskap') + ' – EYE';
  try {
    let e;
    if (SERVER) { const r = await fetch('/api/enhet/' + nr); e = await r.json(); if (!r.ok) throw new Error(e.feil); }
    else { e = await brEnhet(nr); if (!e) throw new Error('Fant ikke enheten i Brønnøysund'); }
    if (location.hash.slice(1) === 'org-' + nr) { v.innerHTML = orgHtml(e, e.personer, e.politikere || []); document.title = e.navn + ' – EYE'; }
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
  $('omMeta').textContent = `Sist oppdatert ${date(D.hentet, true)}.${D.warnings?.length ? ' Merknader fra siste oppdatering: ' + D.warnings.join('; ') + '.' : ''}`;
  [...new Set(reps.map(r => r.fylke))].sort((a, b) => a.localeCompare(b, 'nb')).forEach(f => $('fy').add(new Option(f, f)));
  Object.entries(D.kom).sort((a, b) => a[1].localeCompare(b[1], 'nb')).forEach(([k, v]) => $('ko').add(new Option(v, k)));
  for (const sel of ['vp', 'np', 'fp']) PORDER().filter(p => D.parti[p]).forEach(p => $(sel).add(new Option(pname(p), p)));
  [...new Set(allNews().map(n => n.kilde))].sort().forEach(s => $('ns').add(new Option(s, s)));
  homeView(); govView(); chamber(); repList(); tradesView(); cosView(); partiesView(); votesView(); agreeView(); promisesView(); newsView(); factsView(); dummiesView();
  $('v-dummies').addEventListener('click', e => {
    const t = e.target.closest('[data-t]'), a = e.target.closest('[data-a]');
    if (t) { const id = t.dataset.t; if (id === '*') D.dummies.tema.forEach(x => DU.sel.add(x.id)); else DU.sel.has(id) ? DU.sel.delete(id) : DU.sel.add(id); dummiesView(); }
    else if (a) { DU.ans[a.dataset.a] = Number(a.dataset.v); for (const b of a.parentNode.children) b.setAttribute('aria-pressed', b === a); duResult(); duAutoSave(); }
    else if (e.target.dataset.next) document.getElementById('du-' + e.target.dataset.next)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (e.target.id === 'duReset') { DU.sel.clear(); DU.ans = {}; DU.vik = {}; dummiesView(); scrollTo(0, 0); }
  });
  $('v-dummies').addEventListener('change', e => { const w = e.target.dataset.w; if (w) { DU.vik[w] = e.target.checked; duResult(); duAutoSave(); } });
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
  ownersView(); flaggingView(); ['fr', 'fq'].forEach(id => $(id).addEventListener('input', flaggingView));
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
