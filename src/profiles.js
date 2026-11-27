// Bilder og kort omtale av makthavere: politikere, statsråder, partiledere og innsidere i børsselskaper.
// - Portretter av stortingsrepresentanter og statsråder: Stortingets åpne data (offisielle bilder, kreditering «Stortinget»).
// - Omtale og bilder av andre (f.eks. konsernsjefer): Wikipedia (norsk, svensk, dansk, engelsk) og Wikidata, men bare når
//   kilden beviselig gjelder riktig person (riktig yrke og, for innsidere, at selskapet er nevnt eller er arbeidsgiver/verv
//   i Wikidata). Alltid med lenke og lisens.
// Bildene lastes ned i bygget og publiseres sammen med nettstedet: de besøkende henter ingenting fra tredjeparter.
// Fødselsdatoer fjernes fra Wikipedia-teksten (samme prinsipp som resten av EYE).
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { getJson, getBuffer, allowHosts } from './http.js';

const WIKI = { no: config.wikiNo, sv: config.wikiSv, da: config.wikiDa, en: config.wikiEn };
const UPLOAD = config.wikiUpload, THUMB = config.wikiThumb, WD = config.wikidataApi, COMMONS = config.commonsFile;
// Wikimedia leverer bilder fra både upload.wikimedia.org og thumb.wikimedia.org (Commons omdirigerer dit)
allowHosts([...Object.values(WIKI), UPLOAD, THUMB, WD, COMMONS]);
const wmImg = u => typeof u === 'string' && (u.startsWith(UPLOAD) || u.startsWith(THUMB));
const CACHE_V = 1, WEEK = 7 * 864e5, MAX_IMG = 400_000;

export const slug = s => String(s || '').toLowerCase().normalize('NFKD').replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const MONTHS = '(?:januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember|january|february|march|may|june|july|october|december)';
/** Fjerner fødselsdatoer og -steder i parentes, og «født 1. mai 1970»-fraser. Behold år for død/periode. */
export function stripBirth(t = '') {
  return String(t)
    .replace(/\s*\((?:[^()]*?\b(?:født|f\.|born|b\.)\b[^()]*|\s*\d{1,2}\.?\s+\w+\s+\d{4}[^()]*)\)/gi, '')
    .replace(new RegExp(`,?\\s*\\b(?:født|born)\\s+(?:den\\s+)?(?:\\d{1,2}\\.?\\s+${MONTHS}\\s+)?\\d{4}(?:\\s+(?:i|in|på)\\s+[\\p{Lu}][\\p{L}-]+(?:\\s+[\\p{Lu}][\\p{L}-]+)?)?`, 'giu'), '')
    .replace(new RegExp(`\\b\\d{1,2}\\.?\\s+${MONTHS}\\s+\\d{4}`, 'gi'), m => m.match(/\d{4}/)[0])
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, m => m.slice(0, 4))
    .replace(/,\s*(?=,|\s(?:er|var|is|was)\b)/g, '').replace(/\s{2,}/g, ' ').replace(/\s+([,.])/g, '$1').trim();
}
// Filnavn: lesbart + kort hash av nøkkelen, så «BÅH» og «BAH» aldri kolliderer.
const fileOf = k => `${slug(k)}-${crypto.createHash('sha1').update(k).digest('hex').slice(0, 6)}.jpg`;
const cut = (s, n) => (s.length > n ? s.slice(0, n).replace(/\s\S*$/, '') + ' …' : s);

const POL = /politiker|stortingsrepresentant|statsråd|minister|statssekretær|partileder|politician/i;
const BIZ = { no: /næringslivs|direktør|konsernsjef|styreleder|styremedlem|investor|forretnings|gründer|grunnlegger|finansmann|skipsreder|administrerende|sjef|eier av|leder (?:av|i)/i,
  sv: /företagsledare|näringslivs|verkställande direktör|\bvd\b|styrelseordförande|styrelseledamot|affärs|investerare|grundare|finansman|direktör|chef/i,
  da: /erhvervs|direktør|administrerende|bestyrelse|investor|stifter|forretnings|skibsreder|topchef/i,
  en: /business(?:man|woman|person|\s+executive)|executive|chief|ceo|cfo|chair(?:man|woman|person)?|investor|entrepreneur|founder|banker|director|shipowner/i };
const firstWord = s => String(s || '').replace(/\b(ASA|AS|AB|Ltd|Limited|plc|SE|Holding|Group|Inc)\b\.?/gi, '').trim().split(/\s+/)[0]?.toLowerCase() || '';
// Selskapsnavn i en tekst: hele navnet (uten selskapsform), eller første ord som ikke er generelt («Norwegian», «Nordic» …)
const GENERIC = /^(norwegian|norsk|norske|nordic|norway|norge|the|first|global|international|scandinavian|european|american|new|north|south|west|east|group|holding|holdings|bank|capital|energy|ocean|sea|public|property|invest|ab|asa|as)$/;
const coName = s => String(s || '').toLowerCase().replace(/\((publ)\)|\b(asa|as|ab|ltd|limited|plc|se|inc|holdings?|group)\b\.?/g, '').replace(/[^a-z0-9æøåäö ]/g, ' ').replace(/\s+/g, ' ').trim();
export function mentions(text, sel) {
  const t = ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9æøåäö ]/g, ' ').replace(/\s+/g, ' ') + ' ', full = coName(sel);
  if (full.length >= 3 && t.includes(' ' + full + ' ')) return true;
  const w = full.split(' ').find(x => x.length >= 4 && !GENERIC.test(x));
  return !!w && t.includes(' ' + w);
}

/** Vurderer om en Wikipedia-side gjelder personen vi leter etter. */
export function accept(page, want, lang) {
  if (!page || page.missing !== undefined || page.pageprops?.disambiguation !== undefined || !page.extract) return false;
  const text = `${page.description || ''} ${page.extract}`;
  if (want.kind === 'pol') return POL.test(text) && (!want.parti || new RegExp(want.parti, 'i').test(text) || /storting|regjering/i.test(text));
  if (!BIZ[lang].test(text) || coName(want.sel).length < 3) return false;
  return mentions(text, want.sel) ? true : 'sjekk'; // selskapet står kanskje lenger ned i artikkelen
}
/** Hele artikkelteksten (for å se om selskapet er nevnt et sted). */
async function fullText(lang, title) {
  const d = await getJson(`${WIKI[lang]}?action=query&format=json&formatversion=2&prop=extracts&explaintext=1&exlimit=1&titles=${encodeURIComponent(title)}`);
  return d?.query?.pages?.[0]?.extract || '';
}

const normName = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9æøå ]/g, '').replace(/\s+/g, ' ').trim();
const claimIds = (e, prop) => (e.claims?.[prop] || []).map(c => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
/** Wikidata: person (Q5) med samme navn, der arbeidsgiver/stilling/verv eller beskrivelsen nevner selskapet. */
export async function wikidata(p) {
  const s = await getJson(`${WD}?action=wbsearchentities&format=json&language=en&uselang=en&type=item&limit=5&search=${encodeURIComponent(p.navn)}`);
  const ids = (s?.search || []).filter(x => normName(x.label) === normName(p.navn)).map(x => x.id).filter(id => /^Q\d+$/.test(id));
  if (!ids.length) return null;
  const d = await getJson(`${WD}?action=wbgetentities&format=json&props=claims|descriptions|sitelinks/urls&languages=nb|nn|sv|da|en&ids=${ids.join('|')}`);
  const people = Object.values(d?.entities || {}).filter(e => claimIds(e, 'P31').includes('Q5'));
  if (!people.length) return null;
  const rel = [...new Set(people.flatMap(e => ['P108', 'P39', 'P463', 'P1830', 'P127'].flatMap(k => claimIds(e, k))))].slice(0, 50);
  const lab = rel.length ? await getJson(`${WD}?action=wbgetentities&format=json&props=labels&languages=nb|sv|da|en&ids=${rel.join('|')}`) : null;
  const labels = id => Object.values(lab?.entities?.[id]?.labels || {}).map(l => l.value);
  if (coName(p.sel).length < 3) return null;
  const desc = e => { const D = e.descriptions || {}; return (D.nb || D.nn || D.sv || D.da || D.en)?.value || ''; };
  const hit = people.filter(e => ['P108', 'P39', 'P463', 'P1830', 'P127'].some(k => claimIds(e, k).some(id => labels(id).some(l => mentions(l, p.sel)))) || mentions(desc(e), p.sel));
  if (hit.length !== 1) return null; // aldri gjett mellom flere med samme navn
  const e = hit[0], img = e.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  const link = ['nowiki', 'svwiki', 'dawiki', 'enwiki'].map(k => e.sitelinks?.[k]?.url).find(Boolean) || `https://www.wikidata.org/wiki/${e.id}`;
  const rolle = [...new Set(['P39', 'P108'].flatMap(k => claimIds(e, k)).map(id => Object.values(lab?.entities?.[id]?.labels || {})[0]?.value).filter(Boolean))].slice(0, 4);
  const d0 = stripBirth(desc(e));
  return { tekst: cut([d0 && d0[0].toUpperCase() + d0.slice(1), rolle.length ? `Stillinger og arbeidsgivere: ${rolle.join(', ')}.` : ''].filter(Boolean).join('. ').replace(/\.\./g, '.'), 400),
    beskrivelse: d0, lang: 'wd', kilde: 'Wikidata', url: link, bilde: typeof img === 'string' ? `${COMMONS}${encodeURIComponent(img)}?width=320` : null, fil: typeof img === 'string' ? img : null };
}

async function wikiBatch(lang, titles) {
  const u = `${WIKI[lang]}?action=query&format=json&formatversion=2&redirects=1&prop=extracts|pageimages|description|pageprops&exintro=1&explaintext=1&exsentences=3&exlimit=20` +
    `&piprop=thumbnail|name&pithumbsize=320&ppprop=disambiguation&titles=${encodeURIComponent(titles.join('|'))}`;
  const d = await getJson(u);
  const norm = Object.fromEntries([...(d?.query?.normalized || []), ...(d?.query?.redirects || [])].map(x => [x.from, x.to]));
  const byTitle = Object.fromEntries((d?.query?.pages || []).map(p => [p.title, p]));
  return Object.fromEntries(titles.map(t => { let k = t; for (let i = 0; i < 3 && norm[k]; i++) k = norm[k]; return [t, byTitle[k] || null]; }));
}

async function readJson(f) { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return null; } }
const isJpegOrPng = b => b && b.length > 500 && b.length < MAX_IMG && ((b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50));

/**
 * people: [{ key, navn, kind: 'pol'|'biz', stId?, parti?, sel? }]
 * Returnerer { [key]: { foto?, fotoKilde?, fotoLenke?, wiki?: { tekst, url, lang, beskrivelse } } } og skriver bilder til dataDir/img.
 */
export async function buildProfiles(people, { max = 600, warnings = [] } = {}) {
  const dir = path.join(config.dataDir, 'img'), cacheFile = path.join(config.dataDir, 'profiles-cache.json');
  await fs.mkdir(dir, { recursive: true });
  const cache = (await readJson(cacheFile))?.v === CACHE_V ? await readJson(cacheFile) : { v: CACHE_V, p: {} };
  // Ny regel for næringslivsfolk (navnevask + sjekk av hele artikkelen): slå dem opp på nytt én gang
  if (cache.biz !== 5) { for (const [k, c] of Object.entries(cache.p)) if (k.startsWith('ins:')) c.tw = 0; cache.biz = 5; }
  const now = Date.now(), fresh = k => cache.p[k] && now - cache.p[k].t < WEEK, wfresh = k => cache.p[k] && now - (cache.p[k].tw || 0) < WEEK;
  const list = people.filter(p => p.key && p.navn && p.navn.split(/\s+/).length >= 2).slice(0, max);
  const out = {};

  // 1. Wikipedia (norsk først, så svensk, dansk og engelsk for næringslivsfolk), i puljer på 20
  for (const lang of ['no', 'sv', 'da', 'en']) {
    const todo = list.filter(p => (lang === 'no' ? !wfresh(p.key) : cache.p[p.key]?.tw === now && !cache.p[p.key].wiki && p.kind === 'biz'));
    for (let i = 0; i < todo.length; i += 20) {
      const chunk = todo.slice(i, i + 20);
      let pages = {};
      try { pages = await wikiBatch(lang, chunk.map(p => p.navn)); } catch (e) { warnings.push(`Wikipedia (${lang}) svarte ikke: ${e.message}`); break; }
      for (const p of chunk) {
        const pg = pages[p.navn], c = cache.p[p.key] ||= { t: 0 };
        if (lang === 'no') { c.wiki = null; c.tw = now; }
        let ok = accept(pg, p, lang);
        if (ok === 'sjekk') ok = mentions(await fullText(lang, pg.title).catch(() => ''), p.sel);
        if (!ok) continue;
        c.wiki = { tekst: cut(stripBirth(pg.extract), 600), beskrivelse: stripBirth(pg.description || ''), lang, kilde: 'Wikipedia',
          url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(pg.title.replace(/ /g, '_'))}`,
          bilde: wmImg(pg.thumbnail?.source) ? pg.thumbnail.source : null, fil: pg.pageimage || null };
      }
    }
  }

  // 1b. Wikidata for næringslivsfolk uten artikkel: krever at arbeidsgiver, verv eller beskrivelse nevner selskapet
  let wdFail = 0;
  for (const p of list.filter(p => p.kind === 'biz' && cache.p[p.key]?.tw === now && !cache.p[p.key].wiki)) {
    try { const w = await wikidata(p); if (w) cache.p[p.key].wiki = w; }
    catch (e) { cache.p[p.key].tw = 0; if (++wdFail >= 3) { warnings.push(`Wikidata svarte ikke: ${e.message} – prøver resten neste gang`); break; } }
    await new Promise(r => setTimeout(r, config.wikidataDelayMs));
  }

  // 2. Bilder: Stortinget for dem som har person-ID der, ellers bildet fra en godkjent Wikipedia-artikkel
  for (const p of list) {
    const c = cache.p[p.key] ||= { t: 0 }, file = fileOf(p.key), f = path.join(dir, file);
    if (!fresh(p.key) || (!c.foto && c.wiki?.bilde && c.tw === now) || (c.foto && !(await fs.stat(f).catch(() => null)))) {
      // 404 = ikke noe bilde; nettverksfeil = behold forrige bilde og prøv igjen neste gang
      let b = null, kilde = null, lenke = null, failed = false;
      const get = async u => { try { const x = await getBuffer(u, { accept: 'image/jpeg,image/png' }); return isJpegOrPng(x) ? x : null; } catch { failed = true; return null; } };
      if (p.stId) { b = await get(`${config.stortingetApi}/personbilde?personid=${encodeURIComponent(p.stId)}&storrelse=middels`); if (b) { kilde = 'Stortinget'; lenke = 'https://www.stortinget.no/'; } }
      if (!b && c.wiki?.bilde) { b = await get(c.wiki.bilde); if (b) { kilde = 'Wikimedia Commons'; lenke = c.wiki.fil ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(c.wiki.fil)}` : c.wiki.url; } }
      if (b) { await fs.writeFile(f, b); c.foto = { kilde, lenke }; c.t = now; }
      else if (!failed) { await fs.rm(f, { force: true }); c.foto = null; c.t = now; }
    }
    out[p.key] = {
      ...(c.foto ? { foto: `img/${file}`, fotoKilde: c.foto.kilde, fotoLenke: c.foto.lenke } : {}),
      ...(c.wiki ? { wiki: { tekst: c.wiki.tekst, beskrivelse: c.wiki.beskrivelse, url: c.wiki.url, lang: c.wiki.lang, kilde: c.wiki.kilde || 'Wikipedia' } } : {}),
    };
    if (!Object.keys(out[p.key]).length) delete out[p.key];
  }
  // Rydd bort bilder av folk som ikke lenger er med
  const keep = new Set(list.map(p => fileOf(p.key)));
  for (const f of await fs.readdir(dir)) if (!keep.has(f)) await fs.rm(path.join(dir, f), { force: true });
  for (const k of Object.keys(cache.p)) if (!list.some(p => p.key === k)) delete cache.p[k];
  await fs.writeFile(cacheFile, JSON.stringify(cache));
  return out;
}

/** Alle personene EYE viser profiler for. */
export function profilePeople(reps, pep, innside, partier) {
  const pp = { Ap: 'Arbeiderpartiet', A: 'Arbeiderpartiet', H: 'Høyre', FrP: 'Fremskrittspartiet', Frp: 'Fremskrittspartiet', SV: 'Sosialistisk', Sp: 'Senterpartiet', KrF: 'Kristelig', V: 'Venstre', MDG: 'Miljøpartiet', R: 'Rødt' };
  const out = new Map(), add = p => { if (!out.has(p.key)) out.set(p.key, p); };
  for (const r of reps) add({ key: `rep:${r.id}`, navn: r.navn, kind: 'pol', stId: r.id, parti: pp[r.parti] });
  for (const g of pep?.regjering || []) add({ key: `gov:${g.id}`, navn: g.navn, kind: 'pol', stId: g.id, parti: pp[g.parti] });
  for (const [p, x] of Object.entries(partier?.partier || {})) {
    const navn = String(x.leder || '').replace(/\s*\(.*$/, '').trim();
    if (navn && ![...out.values()].some(o => o.navn === navn)) add({ key: `leder:${p}`, navn, kind: 'pol', parti: pp[p] });
  }
  for (const i of innside || []) if (i.navn) add({ key: `ins:${slug(i.navn)}`, navn: i.navn, kind: 'biz', sel: i.sel });
  return [...out.values()];
}
