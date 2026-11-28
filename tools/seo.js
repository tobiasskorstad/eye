// Statiske sider for søkemotorer og deling. Nettstedet er én side der innholdet tegnes i nettleseren (#rep-…), og
// slike adresser finner ikke Google. Her lager vi én vanlig HTML-side per politiker, statsråd, parti, børsselskap,
// selskap og dommer, med tittel, beskrivelse, forhåndsvisning for deling og en kort oppsummering. Sidene trenger ikke
// JavaScript; «Se hele profilen» åpner den vanlige siden.
//
// Personvern: bare offentlige roller (folkevalgte, regjeringen, dommere) og selskaper får egne sider. Innsidere og
// eiere fra børsmeldinger får ikke egne sider, og navn på private personer vises ikke.
import fs from 'node:fs/promises';
import path from 'node:path';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const slug = s => String(s || '').toLowerCase().normalize('NFKD').replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const hid = id => String(id).replace(/[^\wÅØÆåøæ]/g, '').replace(/Å/g, 'AA').replace(/Ø/g, 'OE').replace(/Æ/g, 'AE');
const nf = n => Number(n).toLocaleString('nb-NO');
const kr = n => n == null ? '–' : nf(Math.round(n)) + ' kr';
const date = d => { try { return new Date(d).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Oslo' }); } catch { return d; } };
const cut = (s, n = 155) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + ' …'; };
const PARA = { 2: 'Styreverv mv.', 3: 'Selvstendig næring', 4: 'Lønnet stilling', 5: 'Tidligere arbeidsgiver', 6: 'Framtidig arbeidsgiver', 7: 'Økonomisk støtte', 8: 'Eiendom i næring', 9: 'Selskapsinteresser', '9a': 'Gjeld', 10: 'Utenlandsreiser', 11: 'Gaver', 15: 'Andre forhold' };
const ORG = /\b(as|asa|ab|ltd|limited|plc|inc|llc|lp|sa|se|nv|ag|gmbh|fund|fond|fondet|bank|capital|management|partners|holding|holdings|invest|investments|securities|group|trust|asset|advisors|kapitalforvaltning)\b|(fond|fondet|banken|pensjon|forsikring|kasse|stiftelse)\b/i;

const LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#ff7a1a"/><path d="M7 22.5 13 12l6 7 6-10" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7" cy="22.5" r="2.4" fill="#fff"/><circle cx="13" cy="12" r="2.4" fill="#fff"/><circle cx="19" cy="19" r="2.4" fill="#fff"/><circle cx="25" cy="9" r="2.4" fill="#fff"/></svg>';
const NAV = [['oversikt', 'Oversikt'], ['stortinget', 'Stortinget'], ['regjeringen', 'Regjeringen'], ['dommere', 'Dommere'], ['partier', 'Partier'], ['handler', 'Politikernes penger'], ['eiere', 'Børs og eiere'], ['oljefondet', 'Oljefondet'], ['faktasjekk', 'Faktasjekk'], ['forklart', 'Politikk forklart'], ['om', 'Kilder']];

/** Lager alle de statiske sidene. Returnerer { lenker: { '#hash': 'sti/' }, urls: [...] } til sitemap og deling. */
export async function buildStatic({ data, out, site, csp, cssName, favicon, kontakt, now = new Date() }) {
  const pages = [], used = new Set(), lenker = {};
  const take = (dir, s) => { let p = `${dir}/${s || 'side'}/`, i = 2; while (used.has(p)) p = `${dir}/${s}-${i++}/`; used.add(p); return p; };
  const add = (dir, name, hash, build, label = name) => { const p = take(dir, slug(name)); if (hash) lenker[hash] = p; pages.push({ p, hash, build, label }); return p; };
  const pname = p => data.parti?.[p] || p;

  // ---------- byggesteiner ----------
  const layout = ({ p, hash, title, desc, h1, kicker, body, type = 'article', ld, crumbs = [], foto }) => {
    const pre = '../'.repeat(p.split('/').filter(Boolean).length), url = site + '/' + p, app = pre + (hash || '#oversikt');
    const meld = `https://github.com/tobiasskorstad/eye/issues/new?template=feil.yml&title=${encodeURIComponent('Feil på ' + h1)}&side=${encodeURIComponent(url)}`;
    const ldAll = [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [['Maktkartet', site + '/'], ...crumbs, [h1, url]].map(([n, u], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: u })) }, ...(ld ? [ld] : [])];
    return `<!DOCTYPE html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<link rel="icon" href="${favicon}">
<meta name="theme-color" content="#0f1318">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:site_name" content="Maktkartet">
<meta property="og:locale" content="nb_NO">
<meta property="og:type" content="${type === 'profile' ? 'profile' : 'article'}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(site)}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="${pre}${cssName}">
${ldAll.map(x => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body class="static">
<header class="top"><div class="bar"><a class="brand" href="${pre}">${LOGO}Maktkartet</a><a class="sopen" href="${pre}#oversikt">Søk i Maktkartet</a></div>
<nav aria-label="Hovedmeny" id="mainnav">${NAV.map(([h, l]) => `<a href="${pre}#${h}">${l}</a>`).join('')}</nav></header>
<main id="main">
<div class="crumbs" role="navigation" aria-label="Brødsmuler"><a href="${pre}">Maktkartet</a>${crumbs.map(([n, u]) => ` › <a href="${pre}${u.slice(site.length + 1)}">${esc(n)}</a>`).join('')}</div>
<div class="shead">${foto?.foto ? `<figure><img src="${pre}${esc(foto.foto)}" alt="${esc(h1)}" width="120" height="150"><figcaption>Foto: ${esc(foto.fotoKilde || '')}</figcaption></figure>` : ''}<div>${kicker ? `<p class="kicker">${kicker}</p>` : ''}<h1>${esc(h1)}</h1></div></div>
${body}
<p class="cta"><a class="btn" href="${app}">Se hele siden i Maktkartet →</a></p>
<p class="meta">Alle opplysninger er hentet fra offentlige registre, sist ${date(data.hentet)}. Ser du noe som er feil? <a href="${esc(meld)}" rel="noopener">Meld feil</a>${kontakt?.epost ? ` eller skriv til <a href="mailto:${esc(kontakt.epost)}">${esc(kontakt.epost)}</a>` : ''}. Se også <a href="${pre}rettelser/">rettelser</a>.</p>
</main>
<footer><div class="fwrap"><div><b class="fbrand">Maktkartet</b><p>Makt og penger i Norge, fra offentlige kilder.</p></div><nav aria-label="Bunnmeny" class="flinks"><a href="${pre}#om">Kilder og metode</a><a href="${pre}#personvern">Personvern</a><a href="${pre}rettelser/">Rettelser</a><a href="${pre}alle/">Alle sider</a></nav></div></footer>
</body>
</html>
`;
  };
  const facts = rows => { rows = rows.filter(r => r && r[1] != null && r[1] !== ''); return rows.length ? `<dl class="facts">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>` : ''; };
  const block = (title, html) => html ? `<section class="block"><div class="bh"><h2>${esc(title)}</h2></div>${html}</section>` : '';
  const ul = items => items.length ? `<ul class="feed">${items.join('')}</ul>` : '';
  const li = (main, meta = '', right = '') => `<li><div class="grow">${main}${meta ? `<div class="meta">${meta}</div>` : ''}</div>${right ? `<b class="n">${right}</b>` : ''}</li>`;
  const link = (from, to, text) => `<a href="${'../'.repeat(from.split('/').filter(Boolean).length)}${to}">${esc(text)}</a>`;

  // ---------- data som brukes på tvers ----------
  const reps = data.reps || [], byId = Object.fromEntries(reps.map(r => [r.id, r]));
  const govs = data.pep?.regjering || [];
  const trades = [...(data.trades || []).map(t => ({ ...t, who: byId[t.rep]?.navn, hash: byId[t.rep] && '#rep-' + hid(t.rep) })), ...(data.pep?.trades || []).map(t => ({ ...t, who: govs.find(g => g.id === t.pep)?.navn, hash: '#statsrad-' + hid(t.pep) }))].filter(t => t.who).sort((a, b) => String(b.d).localeCompare(String(a.d)));
  const coKey = s => String(s || '').toLowerCase().replace(/\((publ)\)|\b(asa|as|ab|ltd|limited|plc|sa|se|n\.v\.|inc|corp|holdings?|group)\b\.?/g, '').replace(/[^a-zæøåäö0-9]/g, '');
  const cosFor = id => (data.cos || []).filter(c => (c.decl || []).includes(id) || c.roles?.[id]);
  const tradeList = (p, list) => ul(list.slice(0, 15).map(t => li(`<b>${t.k === 'S' ? 'Solgte' : 'Kjøpte'}</b> ${esc(t.sel)}`, `${date(t.d)}${t.ant ? ` · ${nf(t.ant)} aksjer` : ''}`, t.ver ? kr(t.ver) : '')));

  // ---------- Stortinget ----------
  const repPath = {};
  for (const r of reps) repPath[r.id] = add('stortinget', r.navn, '#rep-' + hid(r.id), p => {
    const bio = data.bio?.[r.id], tr = trades.filter(t => t.rep === r.id), cs = cosFor(r.id);
    const rolle = r.vara ? 'Vararepresentant' : 'Stortingsrepresentant';
    const reg = Object.entries(r.reg || {}).filter(([, v]) => v && !/^(nei|ingen)\b/i.test(v));
    const desc = cut(`${r.navn} (${pname(r.parti)}) er ${rolle.toLowerCase()} fra ${r.fylke}. Se verv, eierinteresser${tr.length ? `, ${tr.length} aksjehandler` : ''} og spørsmål til regjeringen, rett fra Stortingets registre.`);
    return layout({ p, hash: '#rep-' + hid(r.id), type: 'profile', title: `${r.navn} (${r.parti}) – verv, aksjer og interesser | Maktkartet`, desc, h1: r.navn,
      kicker: `${esc(rolle)} · ${link(p, partyPath[r.parti] || '', pname(r.parti))} · ${esc(r.fylke)}`,
      crumbs: [['Stortinget', site + '/stortinget/']], foto: data.profiler?.['rep:' + r.id],
      ld: { '@context': 'https://schema.org', '@type': 'Person', name: r.navn, jobTitle: rolle, affiliation: { '@type': 'Organization', name: pname(r.parti) }, memberOf: { '@type': 'GovernmentOrganization', name: 'Stortinget' } },
      body: facts([['Parti', esc(pname(r.parti))], ['Valgkrets', esc(r.fylke)], ['Komiteer', esc((r.kom || []).map(k => data.kom?.[k] || k).join(', '))], ['Yrke', esc(r.yrke)], ['Utdanning', esc(r.utd)], ['Spørsmål til regjeringen', r.q ? nf(r.q) : null], ['Første gang på Stortinget', r.forst]])
        + block('Fra interesseregisteret', reg.length ? reg.map(([k, v]) => `<h3>${esc(PARA[k] || '§ ' + k)}</h3><p>${esc(v)}</p>`).join('') + `<p class="meta">Gjengitt ordrett fra <a href="https://www.stortinget.no/no/Representanter-og-komiteer/Representantene/Okonomiske-interesser/" rel="noopener">Stortingets register over økonomiske interesser</a>, ${date(data.regDato)}.</p>` : '<p>Ingen registrerte interesser.</p>')
        + block('Aksjehandler', tradeList(p, tr))
        + block('Selskaper', ul(cs.map(c => li(link(p, `selskap/${c.nr}/`, c.navn), esc([c.roles?.[r.id]?.join(', '), c.kommune].filter(Boolean).join(' · '))))))
        + (bio?.verv?.length ? block('Verv', ul(bio.verv.slice(0, 12).map(v => li(esc(`${v[3] ? v[3] + ', ' : ''}${v[1]}${v[2] ? ' ' + v[2] : ''}`), esc(`${v[4] || ''}–${v[5] || ''}`))))) : ''),
    });
  });

  // ---------- regjeringen ----------
  for (const g of govs) add('regjeringen', g.navn, '#statsrad-' + hid(g.id), p => {
    const tr = trades.filter(t => t.pep === g.id), reg = Object.entries(g.reg || {}).filter(([, v]) => v && !/^(nei|ingen)\b/i.test(v));
    return layout({ p, hash: '#statsrad-' + hid(g.id), type: 'profile', title: `${g.navn}, ${String(g.tittel).toLowerCase()} – verv og aksjer | Maktkartet`,
      desc: cut(`${g.navn} (${pname(g.parti)}) er ${String(g.tittel).toLowerCase()}. Verv, eierinteresser og aksjehandler fra regjeringens interesseregister.`), h1: g.navn,
      kicker: `${esc(g.tittel)} · ${esc(pname(g.parti))}`, crumbs: [['Regjeringen', site + '/regjeringen/']], foto: data.profiler?.['gov:' + g.id],
      ld: { '@context': 'https://schema.org', '@type': 'Person', name: g.navn, jobTitle: g.tittel, affiliation: { '@type': 'Organization', name: pname(g.parti) } },
      body: facts([['Departement', esc(g.dep)], ['Parti', esc(pname(g.parti))]])
        + block('Fra interesseregisteret', reg.length ? reg.map(([k, v]) => `<h3>${esc(PARA[k] || '§ ' + k)}</h3><p>${esc(v)}</p>`).join('') : '<p>Opplysningene er ikke registrert eller ikke hentet ennå.</p>')
        + block('Aksjehandler', tradeList(p, tr)),
    });
  });

  // ---------- partier ----------
  const partyPath = {};
  for (const [k, navn] of Object.entries(data.parti || {})) partyPath[k] = add('partier', navn, '#parti-' + hid(k), p => {
    const P = data.partier?.partier?.[k] || {}, ms = reps.filter(r => r.parti === k && !r.vara), pf = data.partifin?.partier?.[k];
    return layout({ p, hash: '#parti-' + hid(k), title: `${navn} – representanter, saker og penger | Maktkartet`,
      desc: cut(`${navn}${P.leder ? ', ledet av ' + P.leder : ''}. ${P.om || ''} ${ms.length} representanter på Stortinget.`), h1: navn,
      kicker: esc(P.rolle || 'Parti'), crumbs: [['Partier', site + '/partier/']],
      ld: { '@context': 'https://schema.org', '@type': 'PoliticalParty', name: navn, ...(P.leder ? { member: { '@type': 'Person', name: P.leder, jobTitle: 'Partileder' } } : {}) },
      body: (P.om ? `<p class="lede">${esc(P.om)}</p>` : '') + facts([['Leder', esc(P.leder)], ['Representanter på Stortinget', ms.length || null]])
        + block('Sakene', ul((P.saker || []).map(s => li(`<b>${esc(s.tittel)}</b>`, esc(cut(s.standpunkt, 240))))))
        + (pf ? block('Penger til partiet', `<p>Se bidrag til partiet fra organisasjoner og bedrifter, fra <a href="https://www.partifinansiering.no/" rel="noopener">partifinansiering.no</a>, i ${link(p, 'partier/', 'oversikten')}.</p>`) : '')
        + block('Representantene', ul(ms.map(r => li(link(p, repPath[r.id], r.navn), esc(r.fylke))))),
    });
  });

  // ---------- selskaper med politikere ----------
  for (const c of data.cos || []) {
    const p = `selskap/${c.nr}/`; used.add(p); lenker['#org-' + c.nr] = p;
    pages.push({ p, hash: '#org-' + c.nr, label: c.navn, build: p => {
      const ids = [...new Set([...(c.decl || []), ...Object.keys(c.roles || {})])].filter(i => byId[i]), rg = data.regnskap?.[c.nr];
      return layout({ p, hash: '#org-' + c.nr, title: `${c.navn} (${c.nr}) – politikere med roller og eierskap | Maktkartet`,
        desc: cut(`${c.navn}, org.nr. ${c.nr}${c.kommune ? ', ' + c.kommune : ''}. ${ids.length} ${ids.length === 1 ? 'politiker har' : 'politikere har'} rolle i eller eierskap i selskapet.${rg?.inntekter != null ? ' Driftsinntekter ' + kr(rg.inntekter) + '.' : ''}`),
        h1: c.navn, kicker: `Selskap · org.nr. ${esc(c.nr)}`, crumbs: [['Selskaper', site + '/alle/']],
        ld: { '@context': 'https://schema.org', '@type': 'Organization', name: c.navn, taxID: c.nr, ...(c.hjemmeside ? { url: /^https?:/.test(c.hjemmeside) ? c.hjemmeside : 'https://' + c.hjemmeside } : {}) },
        body: facts([['Organisasjonsform', esc(c.formNavn || c.form)], ['Kommune', esc(c.kommune)], ['Bransje', esc(c.nar)], ['Registrert', esc(c.ar)], ['Ansatte', c.ans > 0 ? nf(c.ans) : null], ['Driftsinntekter', rg?.inntekter != null ? kr(rg.inntekter) + (rg.aar ? ` (${rg.aar})` : '') : null], ['Resultat', rg?.resultat != null ? kr(rg.resultat) : null]])
          + block('Politikere', ul(ids.map(i => li(link(p, repPath[i], byId[i].navn), esc([pname(byId[i].parti), c.roles?.[i]?.join(', ') || 'Oppgitt i interesseregisteret'].join(' · '))))))
          + `<p class="meta">Kilde: <a href="https://data.brreg.no/enhetsregisteret/oppslag/enheter/${esc(c.nr)}" rel="noopener">Enhetsregisteret</a> og Stortingets interesseregister.</p>`,
      });
    } });
  }

  // ---------- børsselskaper ----------
  const shortBy = Object.fromEntries((data.short?.liste || []).map(s => [coKey(s.navn), s]));
  const seen = new Set();
  for (const a of Object.values(data.aksjer || {})) {
    if (!a?.navn || !a.notert) continue; const k = slug(a.tick || a.navn); if (seen.has(k)) continue; seen.add(k);
    add('aksjer', a.navn, '#aksje-' + k, p => {
      const ins = (data.innside || []).filter(x => coKey(x.sel) === coKey(a.navn)), fl = (data.flagging || []).filter(x => coKey(x.sel) === coKey(a.navn) || (a.tick && x.tick === a.tick));
      const pol = trades.filter(t => coKey(t.sel) === coKey(a.navn)), sh = shortBy[coKey(a.navn)];
      const om = a.wdesc || a.om || '';
      return layout({ p, hash: '#aksje-' + k, title: `${a.navn}${a.tick ? ` (${a.tick})` : ''} – innsidehandel, store eiere og politikere | Maktkartet`,
        desc: cut(`${a.navn} er notert på ${a.marked || 'Oslo Børs'}. Innsidehandler, flaggemeldinger, shortposisjoner og politikere som har handlet aksjen.${om ? ' ' + om : ''}`),
        h1: a.navn, kicker: `Børsselskap${a.tick ? ' · ' + esc(a.tick) : ''} · ${esc(a.marked || 'Oslo Børs')}`, crumbs: [['Børsselskaper', site + '/aksjer/']],
        ld: { '@context': 'https://schema.org', '@type': 'Corporation', name: a.navn, ...(a.tick ? { tickerSymbol: a.tick } : {}), ...(a.web ? { url: a.web } : {}), ...(a.stiftet ? { foundingDate: String(a.stiftet) } : {}) },
        body: (om ? `<p class="lede">${esc(cut(om, 600))}</p>` : '') + facts([['Marked', esc(a.marked)], ['Ticker', esc(a.tick)], ['Bransje', esc(a.bransje)], ['Stiftet', esc(a.stiftet)], ['Nettsted', a.web && /^https?:\/\//.test(a.web) ? `<a href="${esc(a.web)}" rel="noopener nofollow">${esc(a.web.replace(/^https?:\/\/(www\.)?/, ''))}</a>` : null], ['Shortet', sh?.pst ? `${String(sh.pst).replace('.', ',')} % av aksjene` : null], ['Innsidehandler siste 60 dager', ins.length || null]])
          + block('Politikere som har handlet aksjen', ul(pol.slice(0, 15).map(t => li(`${esc(t.who)} <b>${t.k === 'S' ? 'solgte' : 'kjøpte'}</b>`, date(t.d), t.ver ? kr(t.ver) : ''))))
          + block('Store eiere (flaggemeldinger)', ul(fl.filter(f => ORG.test(f.eier || '')).slice(0, 10).map(f => li(esc(f.eier), date(f.d), f.pst != null ? String(f.pst).replace('.', ',') + ' %' : '')))),
      });
    });
  }

  // ---------- dommere ----------
  const aktiv = x => !x.slutt;
  for (const j of data.dommere?.liste || []) {
    if (!j.navn || !j.id || !(j.inv || j.selskap || j.forening || j.offentlig || j.virksomhet || j.politisk)) continue;
    add('dommere', `${j.navn}-${j.id}`, '#dommer-' + j.id, p => {
      const inv = (j.inv || []).filter(aktiv), sel = (j.selskap || []).filter(aktiv), andre = [...(j.forening || []), ...(j.offentlig || []), ...(j.politisk || [])].filter(aktiv);
      return layout({ p, hash: '#dommer-' + j.id, type: 'profile', title: `${j.navn}, ${j.tittel || 'dommer'} – verv og investeringer | Maktkartet`,
        desc: cut(`${j.navn} er ${j.tittel || 'dommer'}${j.domstol ? ' i ' + j.domstol : ''}. ${inv.length} registrerte investeringer og ${sel.length} selskapsverv, fra Sidegjøremålsregisteret for dommere.`),
        h1: j.navn, kicker: esc([j.tittel, j.domstol].filter(Boolean).join(' · ')), crumbs: [['Dommere', site + '/dommere/']],
        ld: { '@context': 'https://schema.org', '@type': 'Person', name: j.navn, jobTitle: j.tittel || 'Dommer', ...(j.domstol ? { worksFor: { '@type': 'GovernmentOrganization', name: j.domstol } } : {}) },
        body: block('Investeringer i enkeltselskaper', ul(inv.map(x => li(esc(x.navn), esc(x.type || '')))))
          + block('Verv i selskaper', ul(sel.map(x => li(esc(x.navn), esc([x.verv, x.fra && 'fra ' + String(x.fra).slice(0, 4)].filter(Boolean).join(' · '))))))
          + block('Andre verv og oppdrag', ul(andre.slice(0, 20).map(x => li(esc(x.navn || x.organ || x.tekst || ''), esc(x.verv || x.rolle || '')))))
          + `<p class="meta">Kilde: <a href="https://sidegjoremal.domstol.no/" rel="noopener">Sidegjøremålsregisteret</a> (Domstoladministrasjonen). Størrelsen på investeringene registreres ikke.</p>`,
      });
    }, j.navn);
  }

  // ---------- oversiktssider (gir søkemotorene en vei inn til alt) ----------
  const listPage = (dir, hash, h1, desc, lede, items, crumbs = []) => { const p = dir + '/'; used.add(p); lenker[hash] ??= p; pages.push({ p, hash, build: p => layout({ p, hash, title: `${h1} | Maktkartet`, desc, h1, crumbs, body: `<p class="lede">${esc(lede)}</p>${items(p)}` }) }); return p; };
  const byPage = dir => pages.filter(x => x.p.startsWith(dir + '/') && x.p !== dir + '/');
  listPage('stortinget', '#stortinget', 'Stortingsrepresentantene', `Alle ${reps.length} på Stortinget med verv, eierinteresser og aksjehandler.`, 'Alle representantene, med verv, eierinteresser, aksjehandler og spørsmål til regjeringen.',
    p => Object.entries(data.parti || {}).map(([k, n]) => block(n, ul(reps.filter(r => r.parti === k).map(r => li(link(p, repPath[r.id], r.navn), esc(r.fylke + (r.vara ? ' · vara' : ''))))))).join(''));
  listPage('regjeringen', '#regjeringen', 'Regjeringen', 'Statsrådene med verv, eierinteresser og aksjehandler.', 'Alle statsrådene, med verv, eierinteresser og aksjehandler fra regjeringens interesseregister.',
    p => ul(govs.map(g => li(link(p, lenker['#statsrad-' + hid(g.id)], g.navn), esc(g.tittel)))));
  listPage('partier', '#partier', 'Partiene', 'Partiene på Stortinget: saker, representanter og penger.', 'Partiene på Stortinget, hva de mener, hvem som representerer dem og hvem som gir dem penger.',
    p => ul(Object.entries(data.parti || {}).map(([k, n]) => li(link(p, partyPath[k], n), esc(data.partier?.partier?.[k]?.rolle || '')))));
  listPage('aksjer', '#borsselskaper', 'Børsselskapene', 'Alle aksjeselskaper på Oslo Børs, Euronext Expand og Growth.', 'Alle aksjeselskapene på Oslo Børs, Euronext Expand og Euronext Growth, med innsidehandel, store eiere og shortsalg.',
    p => ul(byPage('aksjer').map(x => li(link(p, x.p, x.label)))));
  if (data.dommere?.liste?.length) listPage('dommere', '#dommere', 'Dommerne', 'Dommeres verv og investeringer fra Sidegjøremålsregisteret.', 'Dommere må registrere verv og investeringer i enkeltselskaper. Her er alle som er lest inn.',
    p => { const J = Object.fromEntries(data.dommere.liste.map(j => ['#dommer-' + j.id, j])); return ul(byPage('dommere').map(x => li(link(p, x.p, x.label), esc([J[x.hash]?.tittel, J[x.hash]?.domstol].filter(Boolean).join(', '))))); });
  if (data.oljefondet) { const o = data.oljefondet, v = o.historikk?.verdi?.slice(-1)[0];
    listPage('oljefondet', '#oljefondet', 'Oljefondet', cut(`Hvordan oljefondet forvaltes: ${v ? nf(v[1]) + ' milliarder kroner, ' : ''}investert i ${o.beholdning?.antall?.aksjer ? nf(o.beholdning.antall.aksjer) + ' selskaper' : 'tusenvis av selskaper'} i utlandet. Avkastning, handlingsregelen og utelukkede selskaper.`),
      'Statens pensjonsfond utland er Norges sparekonto for inntektene fra olje og gass. Pengene er investert i utlandet, og politikerne skal over tid bare bruke avkastningen.',
      () => facts([['Markedsverdi', v ? nf(v[1]) + ' mrd. kr' : null], ['Selskaper med aksjer', o.beholdning?.antall?.aksjer ? nf(o.beholdning.antall.aksjer) : null], ['Utelukkede selskaper', o.utelukket?.length || null], [`Bruk av fondsmidler ${o.budsjett?.budsjettaar || ''}`.trim(), o.budsjett ? `${String(o.budsjett.bruk).replace('.', ',')} mrd. kr` : null]])
        + block('Største aksjeposter', ul((o.beholdning?.aksjer || []).slice(0, 20).map(x => li(esc(x[0]), '', nf(Math.round(x[2] / 1e9)) + ' mrd.'))))); }

  // Rettelser
  const rett = kontakt?.rettelser || [];
  { const p = 'rettelser/'; used.add(p); pages.push({ p, hash: '#om', build: p => layout({ p, hash: '#om', title: 'Rettelser | Maktkartet', desc: 'Feil vi har rettet på Maktkartet, med dato.', h1: 'Rettelser',
    body: `<p class="lede">Vi retter feil så raskt vi kan og noterer det her. Feil som ligger i selve registeret, må rettes hos den som eier registeret; da sier vi fra til dem og lenker til kilden.</p>${rett.length ? ul(rett.map(r => li(esc(r.tekst), date(r.d)))) : '<p>Ingen rettelser ennå.</p>'}` }) }); }

  // Alle sider
  { const p = 'alle/'; used.add(p); pages.push({ p, build: p => layout({ p, title: 'Alle sider | Maktkartet', desc: 'Oversikt over alle politikere, partier, selskaper og dommere på Maktkartet.', h1: 'Alle sider',
    body: [['stortinget', 'Stortinget'], ['regjeringen', 'Regjeringen'], ['partier', 'Partier'], ['aksjer', 'Børsselskaper'], ['selskap', 'Selskaper med politikere'], ['dommere', 'Dommere']].map(([d, t]) => block(t, `<p class="cols">${pages.filter(x => x.p.startsWith(d + '/') && x.p !== d + '/').map(x => link(p, x.p, x.label || x.p)).join(' · ')}</p>`)).join('')
      + block('Temasider', ul(['stortinget', 'regjeringen', 'partier', 'aksjer', 'dommere', 'oljefondet', 'rettelser'].filter(d => used.has(d + '/')).map(d => li(link(p, d + '/', d[0].toUpperCase() + d.slice(1)))))) }) }); }

  // Skriv alt
  for (const x of pages) { await fs.mkdir(path.join(out, x.p), { recursive: true }); await fs.writeFile(path.join(out, x.p, 'index.html'), x.build(x.p)); }
  const urls = ['', ...pages.map(x => x.p)];
  const day = now.toISOString().slice(0, 10);
  await fs.writeFile(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `<url><loc>${esc(site + '/' + u)}</loc><lastmod>${day}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  return { lenker, antall: pages.length };
}
