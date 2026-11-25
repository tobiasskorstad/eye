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

let D, reps, byId, byH, cos, byNr, trades, P, holdings = [];

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
  const PFIX = { Ap: 'A', Frp: 'FrP', Høyre: 'H' }, pp = p => PFIX[p] || p;
  const gov = Object.fromEntries((D.pep?.regjering || []).map(g => [g.id, { navn: g.navn, parti: pp(g.parti), rolle: g.tittel, trades: [] }]));
  trades = [...D.trades.map(t => ({ ...t, r: byId[t.rep] })), ...(D.pep?.trades || []).map(t => ({ ...t, r: gov[t.pep] }))].filter(t => t.r).sort((a, b) => b.d.localeCompare(a.d));
  const NONE = /^(nei|ingen|har ingen|jeg har ingen|-|x)\b/i;
  holdings = [
    ...reps.map(r => ({ navn: r.navn, h: r.h, parti: r.parti, gruppe: 'Stortinget', rolle: r.vara ? 'Vararepresentant' : 'Stortingsrepresentant', tekst: r.reg?.['9'] || '' })),
    ...(D.pep?.regjering || []).map(g => ({ navn: g.navn, parti: pp(g.parti), gruppe: 'Regjeringen', rolle: g.tittel, tekst: g.reg ? g.reg['9'] || '' : '' })),
    ...(D.pep?.statssek || []).map(s => ({ navn: s.navn, parti: pp(s.parti), gruppe: 'Statssekretærer og politiske rådgivere', rolle: 'Statssekretær eller politisk rådgiver', tekst: s.felt?.aksjer || '' })),
  ].map(x => ({ ...x, eier: !!x.tekst && !NONE.test(x.tekst.trim()) }));
  trades.forEach(t => t.r.trades.push(t));
  cos = D.cos.map(c => ({ ...c, ids: [...new Set([...(c.decl || []), ...Object.keys(c.roles || {})])].filter(i => byId[i]) }));
  cos.forEach(c => c.ids.forEach(i => byId[i].cos.push(c)));
  byNr = Object.fromEntries(cos.map(c => [c.nr, c]));
  P = D.partier || null;
  reps.forEach(r => r.key = (r.navn + ' ' + r.fylke + ' ' + r.parti).toLowerCase());
  cos.forEach(c => c.key = (c.navn + ' ' + c.nr).toLowerCase());
}

/* ---------- visninger og faner ---------- */
const VIEWS = ['holdings', 'konto', 'personvern', 'reps', 'rep', 'votes', 'agree', 'parties', 'party', 'promises', 'news', 'dummies', 'trades', 'cos', 'org', 'facts', 'om'];
const SECTIONS = {
  st: [['stortinget', 'Representanter'], ['voteringer', 'Voteringer'], ['enighet', 'Hvem stemmer med hvem']],
  pa: [['partier', 'Oversikt'], ['lofter', 'Løfter og resultater'], ['nyheter', 'Nyheter']],
  pe: [['handler', 'Aksjehandler'], ['aksjeposter', 'Aksjeposter'], ['selskaper', 'Selskaper']],
  fa: [], om: [], du: [], ko: [],
};
const HASHVIEW = { stortinget: ['reps', 'st'], voteringer: ['votes', 'st'], enighet: ['agree', 'st'], partier: ['parties', 'pa'], lofter: ['promises', 'pa'], nyheter: ['news', 'pa'], handler: ['trades', 'pe'], aksjeposter: ['holdings', 'pe'], selskaper: ['cos', 'pe'], faktasjekk: ['facts', 'fa'], forklart: ['dummies', 'du'], om: ['om', 'om'], konto: ['konto', 'ko'], personvern: ['personvern', 'ko'] };
function show(v, sec, sub) {
  for (const x of VIEWS) $('v-' + x).hidden = x !== v;
  for (const a of document.querySelectorAll('#mainnav a')) a.dataset.s === sec ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  $('subnav').innerHTML = (SECTIONS[sec] || []).map(([h, l]) => `<a href="#${h}"${h === sub ? ' aria-current="page"' : ''}>${l}</a>`).join('');
}
function route() {
  const h = decodeURIComponent(location.hash.slice(1)) || 'stortinget'; let m;
  closeSearch();
  if ((m = h.match(/^rep-(\w+)$/)) && byH[m[1]]) { renderRep(byH[m[1]]); show('rep', 'st', 'stortinget'); }
  else if ((m = h.match(/^parti-(\w+)$/)) && P?.partier[m[1]]) { renderParty(m[1]); show('party', 'pa', 'partier'); }
  else if ((m = h.match(/^org-(\d{9})$/))) { renderOrg(m[1]); show('org', 'pe', 'selskaper'); }
  else { const [v, s] = HASHVIEW[h] || HASHVIEW.stortinget; if (v === 'konto') kontoView(); show(v, s, HASHVIEW[h] ? h : 'stortinget'); document.title = 'EYE – Stortinget, penger og makt'; }
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
  $('repTable').tBodies[0].innerHTML = list.map(r => `<tr data-go="rep-${r.h}"><td><a href="#rep-${r.h}">${esc(r.navn)}</a><div class="meta">${esc(r.fylke)}</div></td><td>${dot(r.parti)}${esc(r.parti)}</td><td class="n">${z(r.q)}</td><td class="n">${z(r.cos.length)}</td><td class="n">${z(r.trades.length)}</td></tr>`).join('')
    || '<tr><td colspan="5" class="empty">Ingen treff.</td></tr>';
}

function renderRep(r) {
  const ini = r.navn.split(' ').filter(Boolean);
  const rg = r.reg;
  const paras = PARA_ORDER.filter(k => rg[k]);
  const coRows = [...r.cos].sort((a, b) => (b.roles?.[r.id] ? 1 : 0) - (a.roles?.[r.id] ? 1 : 0) || b.ans - a.ans).map(c => {
    const ro = c.roles?.[r.id];
    return `<tr data-go="org-${org(c.nr).replace(/ /g, '')}"><td><a href="#org-${org(c.nr).replace(/ /g, '')}">${esc(c.navn)}</a><div class="meta">${esc(c.kommune || '–')}${flag(c.flag) ? ' · ' + flag(c.flag) : ''}</div></td><td>${ro ? ro.map(x => `<span class="chip ok">${esc(x)}</span>`).join('') : '<span class="chip">Oppgitt</span>'}</td><td class="n">${c.ans > 0 ? nf(c.ans) : '–'}</td></tr>`;
  }).join('');
  const sum = r.trades.reduce((a, t) => a + t.ver, 0);
  $('v-rep').innerHTML = `<a class="back" href="#stortinget">← Alle representanter</a>
  <div class="head"><div class="badge" style="background:${col(r.parti)}">${esc((ini[0][0] + ini.at(-1)[0]).toUpperCase())}</div><div><h1>${esc(r.navn)}</h1><div class="meta">${P?.partier[r.parti] ? `<a href="#parti-${r.parti}">${esc(D.parti[r.parti] || r.parti)}</a>` : esc(D.parti[r.parti] || r.parti)} · ${esc(r.fylke)}${r.vara ? ' · møtende vararepresentant' : ''}</div></div>${followBtn('rep', r.id)}</div>
  <div class="kpis"><div><b>${num(r.q)}</b><span>spørsmål til regjeringen</span></div><div><b>${r.cos.length}</b><span>selskaper og organisasjoner</span></div><div><b>${r.trades.length}</b><span>aksjehandler${sum ? `, ${nf(sum)} kr` : ''}</span></div></div>
  <dl class="facts">
    <dt>Komité</dt><dd>${r.kom.length ? r.kom.map(k => esc(D.kom[k] || k)).join(', ') : '–'}</dd>
    <dt>Født</dt><dd>${esc(r.fodt || '–')}</dd>
    <dt>På Stortinget</dt><dd>${num(r.per)} ${r.per === 1 ? 'periode' : 'perioder'}${r.forst ? ` (første i ${esc(r.forst)})` : ''}</dd>
    ${S()?.oppmote[r.id] ? `<dt>Voteringer</dt><dd>Stemte i ${S().oppmote[r.id][0] - S().oppmote[r.id][1]} av ${S().oppmote[r.id][0]} personlige voteringer. <span class="meta">I vanlige voteringer stemmer ofte bare rundt 101 representanter etter avtale mellom partiene, så tallet viser ikke fravær alene.</span></dd>` : ''}
    ${r.utd ? `<dt>Utdanning</dt><dd>${esc(r.utd)}</dd>` : ''}${r.yrke ? `<dt>Yrke</dt><dd>${esc(r.yrke)}</dd>` : ''}
  </dl>
  ${r.cos.length ? `<h2>Selskaper</h2><div class="tw"><table class="list"><thead><tr><th>Selskap</th><th>Rolle i Brønnøysund</th><th class="n">Ansatte</th></tr></thead><tbody>${coRows}</tbody></table></div>` : ''}
  ${r.trades.length ? `<h2>Aksjehandler</h2><div class="tw"><table><thead><tr><th>Dato</th><th>Handel</th><th>Selskap</th><th class="n hide-s">Antall</th><th class="n">Verdi, kr</th></tr></thead><tbody>${r.trades.map(t => `<tr><td class="n">${sdate(t.d)}</td><td>${trade(t.k)}</td><td>${esc(t.sel)}</td><td class="n hide-s">${nf(t.ant)}</td><td class="n">${nf(t.ver)}</td></tr>`).join('')}</tbody></table></div>` : ''}
  <h2>Interesseregisteret</h2>
  ${rg.ingen ? '<p>Har ingen registreringspliktige interesser.</p>' : paras.length ? `<dl class="facts reg">${paras.map(k => `<dt>§ ${k} ${PARA[k] || ''}</dt><dd>${esc(rg[k])}</dd>`).join('')}</dl>` : `<p class="empty">Ingen oppføringer.</p>`}
  <p class="meta">Ordrett fra Stortingets register, ajourført ${date(D.regDato, true)}.</p>
  <h2>Spørsmål til regjeringen</h2>
  ${r.q ? `<p>${num(r.q)} spørsmål denne perioden. Mest til ${r.top.map(t => `${esc(t.til)} (${num(t.n)})`).join(', ')}.</p>` : '<p class="empty">Ingen spørsmål denne perioden.</p>'}
  ${r.siste ? `<p>Siste, ${date(r.siste.d)} (${QTYPE[r.siste.t] || ''}): «${esc(r.siste.tit)}» <a href="https://www.stortinget.no/no/Saker-og-publikasjoner/Sporsmal/${r.siste.t === 'I' ? 'Interpellasjoner/Interpellasjon/' : 'Skriftlige-sporsmal-og-svar/Skriftlig-sporsmal/'}?qnid=${encodeURIComponent(r.siste.id)}">Les svaret</a></p>` : ''}
  <div class="links"><a href="https://www.stortinget.no/no/Representanter-og-komiteer/Representantene/Representant/?perid=${encodeURIComponent(r.id)}">Stortingets side</a>${D.regUrl ? `<a href="${url(D.regUrl)}">Interesseregisteret (PDF)</a>` : ''}</div>`;
  document.title = `${r.navn} – EYE`;
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
  $('pgrid').innerHTML = order.map(p => { const x = P.partier[p]; return `<a class="pcard" style="--pc:${col(p)}" href="#parti-${p}"><b>${esc(pname(p))}</b><div class="meta">${esc(x.leder)} · ${esc(x.rolle)}</div><ul>${x.saker.map(s => `<li>${esc(s.tittel)}</li>`).join('')}</ul></a>`; }).join('');
}
function partyVotes(p) {
  if (!S()) return '';
  const vs = S().voteringer.filter(v => v.pos[p]).slice(0, 12);
  const won = S().voteringer.filter(v => v.pos[p] === 'F' && v.vedtatt || v.pos[p] === 'M' && !v.vedtatt).length, n = S().voteringer.filter(v => v.pos[p] === 'F' || v.pos[p] === 'M').length;
  const most = PORDER().filter(q => q !== p && S().enighet[p]?.[q] != null).sort((a, b) => S().enighet[p][b] - S().enighet[p][a]);
  return `<h2>Slik stemmer partiet</h2><p>På vinnende side i ${n ? Math.round(100 * won / n) : 0} % av ${n} voteringer. Stemmer oftest likt med ${most.slice(0, 2).map(q => `${esc(pname(q))} (${num(S().enighet[p][q])} %)`).join(' og ')}, sjeldnest med ${esc(pname(most.at(-1)))} (${num(S().enighet[p][most.at(-1)])} %).</p>
  <div class="tw"><table><thead><tr><th>Dato</th><th>Sak</th><th>Stemte</th><th>Utfall</th></tr></thead><tbody>${vs.map(v => `<tr><td class="n">${sdate(v.d)}</td><td>${esc(v.tittel)}<div class="meta">${esc(v.tema)}</div></td><td>${posCell(p, v.pos[p])}</td><td class="${v.vedtatt ? 'k' : 's'}">${v.vedtatt ? 'Vedtatt' : 'Forkastet'}</td></tr>`).join('')}</tbody></table></div><p class="meta"><a href="#voteringer">Alle voteringer</a></p>`;
}
function partyPromises(p) {
  const L = D.lofter; if (!L) return '';
  const own = L.regjering.parti === p ? `<h2>Løfter fra valget 2025</h2>${L.regjering.lofter.map(x => `<div class="prom"><h3>${stPill(x.status)} ${esc(x.lofte)}</h3><p>${esc(x.hva)}</p><div class="meta">${srcLinks(x.kilder)}</div></div>`).join('')}` : '';
  const gj = L.gjennomslag.partier[p] ? `<h2>Gjennomslag</h2><ul>${L.gjennomslag.partier[p].map(g => `<li>${g.tap ? '✗ ' : '✓ '}<a href="${url(g.u)}" rel="noopener">${esc(g.sak)}</a></li>`).join('')}</ul>` : '';
  const fk = (D.faktasjekk?.sjekker || []).filter(x => (x.p || []).includes(p));
  return own + gj + (fk.length ? `<h2>Faktasjekker</h2>${newsList(fk.map(x => ({ tittel: x.t, url: x.u, kilde: 'Faktisk.no', dato: x.d })))}` : '');
}
function renderParty(p) {
  const x = P.partier[p], mine = reps.filter(r => r.parti === p);
  const q = mine.reduce((a, r) => a + r.q, 0), tr = trades.filter(t => t.r.parti === p).length, co = new Set(mine.flatMap(r => r.cos.map(c => c.nr))).size;
  const auto = (P.auto?.[p] || []).filter(n => !x.nyheter.some(m => m.url === n.url));
  $('v-party').innerHTML = `<a class="back" href="#partier">← Alle partier</a>
  <div class="head"><div class="badge" style="background:${col(p)}">${esc(short(p))}</div><div><h1>${esc(pname(p))}</h1><div class="meta">${esc(x.leder)} · ${esc(x.rolle)}</div></div>${followBtn('parti', p)}</div>
  <p>${esc(x.om)}</p>
  <div class="kpis"><div><b>${mine.length}</b><span>mandater</span></div><div><b>${P.maling?.snitt[p] != null ? P.maling.snitt[p].toFixed(1).replace('.', ',') + ' %' : '–'}</b><span>snitt på målinger</span></div><div><b>${nf(q)}</b><span>spørsmål til regjeringen</span></div><div><b>${tr}</b><span>aksjehandler, ${co} selskaper</span></div></div>
  <h2>Partiets saker, veid</h2><p class="meta">${esc(P.metode)}</p>
  ${x.saker.map(s => `<div class="sak"><h3>${esc(s.tittel)}</h3><p>${esc(s.standpunkt)}</p><div class="weigh"><div><h4>Tilhengere sier</h4><ul>${s.for.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div><div><h4>Kritikere sier</h4><ul>${s.mot.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div></div><div class="meta" style="margin-top:8px"><a href="${url(s.kilde)}" rel="noopener">Kilde</a></div></div>`).join('')}
  ${partyVotes(p)}
  ${partyPromises(p)}
  <h2>Nyheter</h2>${newsList(x.nyheter)}
  ${auto.length ? `<h3>Siste fra nyhetsstrømmen</h3>${newsList(auto)}<p class="meta">Hentet automatisk hver natt. Bare overskrift og lenke vises.</p>` : ''}
  <h2>Representantene</h2><div class="tw"><table class="list"><thead><tr><th>Representant</th><th class="n">Spørsmål</th><th class="n">Selskaper</th><th class="n">Handler</th></tr></thead><tbody>${[...mine].sort((a, b) => b.q - a.q).map(r => `<tr data-go="rep-${r.h}"><td><a href="#rep-${r.h}">${esc(r.navn)}</a><div class="meta">${esc(r.fylke)}</div></td><td class="n">${num(r.q)}</td><td class="n">${r.cos.length}</td><td class="n">${r.trades.length}</td></tr>`).join('')}</tbody></table></div>`;
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
function factsView() {
  const F = D.faktasjekk; if (!F) { $('v-facts').innerHTML = '<h1>Faktasjekk</h1><p class="empty">Mangler innhold.</p>'; return; }
  $('factsLede').textContent = F.om;
  const p = $('fp').value;
  $('factList').innerHTML = F.sjekker.filter(x => !p || (x.p || []).includes(p)).map(x => `<li><a href="${url(x.u)}" rel="noopener">${esc(x.t)}</a><div class="meta">Faktisk.no · ${date(x.d)}${(x.p || []).length ? ' · ' + x.p.map(y => `${dot(y)}${esc(short(y))}`).join(' ') : ''}</div></li>`).join('') || '<li class="empty">Ingen faktasjekker for valget.</li>';
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
  $('duWords').innerHTML = X.ordliste.map(o => `<dt>${esc(o.ord)}</dt><dd>${esc(o.forklaring)}</dd>`).join('');
  $('duTopics').innerHTML = X.tema.map(t => `<button class="tbtn" data-t="${esc(t.id)}" aria-pressed="${DU.sel.has(t.id)}">${esc(t.navn)}</button>`).join('') + `<button class="tbtn" data-t="*">Alle</button>`;
  const chosen = X.tema.filter(t => DU.sel.has(t.id));
  $('duCards').innerHTML = chosen.length ? `<h2>2. Hva mener du?</h2>` + chosen.map(t => duCard(t)).join('') : '<p class="empty">Velg minst én sak over.</p>';
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
function duResult() {
  duSaveBox();
  const { done, list } = duScores();
  $('duResult').innerHTML = done.length ? `<div class="res"><h2>3. Disse partiene er mest enige med deg</h2>
  <p class="meta">Basert på ${done.length} ${done.length === 1 ? 'sak' : 'saker'}. Jo flere saker du svarer på, jo mer treffsikkert. Dette er ikke et råd om hva du bør stemme.</p>
  ${list.map(r => `<div class="row2"><a href="#parti-${r.p}">${dot(r.p)}${esc(pname(r.p))}</a><div class="bar"><i style="width:${r.pct}%;background:${col(r.p)}"></i></div><b class="n">${r.pct} %</b></div>
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
  const t = $('tt').value;
  $('tradeTable').tBodies[0].innerHTML = trades.filter(x => !t || x.k === t).map(x => `<tr${x.r.h ? ` data-go="rep-${x.r.h}"` : ''}><td class="n">${sdate(x.d)}</td><td>${x.r.h ? `<a href="#rep-${x.r.h}">${esc(x.r.navn)}</a>` : esc(x.r.navn)} ${dot(x.r.parti)}<span class="meta">${esc(x.r.parti)}${x.r.rolle ? ' · ' + esc(x.r.rolle) : ''}</span></td><td class="hide-s">${trade(x.k)}</td><td><span class="show-s">${trade(x.k)} </span>${esc(x.sel)}</td><td class="n hide-s">${nf(x.ant)}</td><td class="n">${nf(x.ver)}</td></tr>`).join('')
    || '<tr><td colspan="6" class="empty">Ingen handler.</td></tr>';
}

/* ---------- aksjeposter (alle PEP) ---------- */
function holdingsView() {
  const g = $('hg').value, p = $('hp').value, q = $('hq').value.trim().toLowerCase(), only = $('hh').checked;
  const groups = [...new Set(holdings.map(x => x.gruppe))];
  $('hk').innerHTML = groups.map(gr => { const l = holdings.filter(x => x.gruppe === gr); return `<div><b>${l.filter(x => x.eier).length} av ${l.length}</b><span>${esc(gr)}: oppgir aksjer eller eierandeler</span></div>`; }).join('');
  const list = holdings.filter(x => (!g || x.gruppe === g) && (!p || x.parti === p) && (!only || x.eier) && (!q || (x.navn + ' ' + x.tekst).toLowerCase().includes(q)))
    .sort((a, b) => b.eier - a.eier || a.navn.localeCompare(b.navn, 'nb'));
  $('holdTable').tBodies[0].innerHTML = list.slice(0, 400).map(x => `<tr><td>${x.h ? `<a href="#rep-${x.h}">${esc(x.navn)}</a>` : esc(x.navn)} ${dot(x.parti)}<span class="meta">${esc(x.parti)}</span><div class="meta show-s">${esc(x.rolle)}</div></td><td class="hide-s">${esc(x.rolle)}</td><td>${x.tekst ? esc(x.tekst) : '<span class="meta">Ingenting oppgitt</span>'}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">Ingen treff.</td></tr>';
}

/* ---------- selskaper ---------- */
const polChips = ids => ids.map(i => { const r = byId[i]; return r ? `<a class="chip" href="#rep-${r.h}">${dot(r.parti)}${esc(r.navn)}</a>` : ''; }).join('');
function cosView() {
  const withRole = cos.filter(c => Object.keys(c.roles || {}).length).length;
  $('ck').innerHTML = `<div><b>${cos.length}</b><span>selskaper og organisasjoner</span></div><div><b>${new Set(cos.flatMap(c => c.ids)).size}</b><span>representanter</span></div><div><b>${withRole}</b><span>med rolle bekreftet</span></div>`;
  const f = $('cf').value, s = $('cs').value;
  const list = cos.filter(c => (f !== 'rolle' || Object.keys(c.roles || {}).length) && (f !== 'flagg' || c.flag))
    .sort((a, b) => s === 'ans' ? b.ans - a.ans : s === 'rep' ? b.ids.length - a.ids.length || a.navn.localeCompare(b.navn, 'nb') : a.navn.localeCompare(b.navn, 'nb'));
  $('coTable').tBodies[0].innerHTML = list.map(c => `<tr data-go="org-${org(c.nr).replace(/ /g, '')}"><td><a href="#org-${org(c.nr).replace(/ /g, '')}">${esc(c.navn)}</a><div class="meta">${org(c.nr)} · ${esc(FORM[c.form] || c.form)}${flag(c.flag) ? ' · ' + flag(c.flag) : ''}</div></td><td>${esc(c.kommune || '–')}</td><td class="n">${c.ans > 0 ? nf(c.ans) : '–'}</td><td>${polChips(c.ids)}</td></tr>`).join('');
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
function orgHtml(c, personer, pols) {
  const roleRows = (personer || []).map(p => { const r = p.rep && byId[p.rep]; return `<tr><td>${r ? `<a class="rep" href="#rep-${r.h}">${esc(p.navn)}</a> ${dot(r.parti)}<span class="meta">${esc(r.parti)}</span>` : esc(p.navn)}</td><td>${esc(p.rolle)}</td></tr>`; }).join('');
  const declOnly = pols.filter(p => !(personer || []).some(x => x.rep === p.id));
  return `<a class="back" href="#selskaper">← Selskaper</a><div class="head"><h1>${esc(c.navn)}</h1>${followBtn('org', c.nr)}</div><div class="meta">Org.nr. ${org(c.nr)} · ${esc(FORM[c.form] || c.formNavn || c.form)}</div>
  <dl class="facts"><dt>Kommune</dt><dd>${esc(c.kommune || '–')}</dd><dt>Bransje</dt><dd>${esc(c.nar || '–')}</dd><dt>Ansatte</dt><dd>${c.ans > 0 ? nf(c.ans) : 'Ikke registrert'}</dd><dt>Registrert</dt><dd>${esc(c.ar || '–')}</dd><dt>Status</dt><dd>${flag(c.flag) || 'Aktiv'}</dd></dl>
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
  const ps = P ? Object.keys(P.partier).filter(p => words.every(w => (pname(p) + ' ' + short(p) + ' ' + P.partier[p].leder).toLowerCase().includes(w))) : [];
  box.innerHTML = (ps.length ? '<div class="h">Partier</div>' + ps.map(p => `<a href="#parti-${p}"><span>${dot(p)}${esc(pname(p))}</span><span class="meta">${esc(P.partier[p].leder)}</span></a>`).join('') : '') + (rs.length ? '<div class="h">Representanter</div>' + rs.map(r => `<a href="#rep-${r.h}"><span>${dot(r.parti)}${esc(r.navn)}</span><span class="meta">${esc(r.fylke)}</span></a>`).join('') : '') +
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
  chamber(); repList(); tradesView(); cosView(); partiesView(); votesView(); agreeView(); promisesView(); newsView(); factsView(); dummiesView();
  $('v-dummies').addEventListener('click', e => {
    const t = e.target.closest('[data-t]'), a = e.target.closest('[data-a]');
    if (t) { const id = t.dataset.t; if (id === '*') D.dummies.tema.forEach(x => DU.sel.add(x.id)); else DU.sel.has(id) ? DU.sel.delete(id) : DU.sel.add(id); dummiesView(); }
    else if (a) { DU.ans[a.dataset.a] = Number(a.dataset.v); for (const b of a.parentNode.children) b.setAttribute('aria-pressed', b === a); duResult(); duAutoSave(); }
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
  ['vp', 'vf'].forEach(id => $(id).addEventListener('input', votesView));
  ['np', 'ns'].forEach(id => $(id).addEventListener('input', newsView));
  $('fp').addEventListener('input', factsView);
  $('promFilter').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { promStatus = b.dataset.st; promisesView(); } });

  $('leg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; off.has(b.dataset.p) ? off.delete(b.dataset.p) : off.add(b.dataset.p); legend(); repList(); });
  ['fy', 'ko', 'so'].forEach(id => $(id).addEventListener('input', repList));
  $('tt').addEventListener('input', tradesView);
  ['cf', 'cs'].forEach(id => $(id).addEventListener('input', cosView));
  $('liveForm').addEventListener('submit', e => { e.preventDefault(); liveSearch($('lq').value.trim()); });
  document.addEventListener('click', e => {
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
