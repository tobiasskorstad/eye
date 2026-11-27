// Tolking av børsmeldinger om innsidehandel og flagging (fritekst på norsk og engelsk). Ren logikk uten import,
// så samme fil kan testes mot ekte meldinger hvor som helst. Best effort: meldingsteksten og lenken vises alltid.

const U = 'A-ZÆØÅÉÖÄÜ';
const NAME = `[${U}][\\p{L}'’\\-]+\\.?(?:\\s+(?:[${U}][\\p{L}'’\\-]*\\.?|van|von|de|der|af|la|le)){1,4}`;
// Gjør første bokstav i hvert ord valgfritt stor/liten: «board member» og «Board Member»
const ci = s => s.replace(/(^|[\s(|?:])([a-zæøå])/g, (m, pre, c) => `${pre}[${c}${c.toUpperCase()}]`);
const ROLES = [
  'chair(?:man|person|woman)?(?: of the board(?: of directors)?)?', 'vice chair(?:man|person|woman)?', 'deputy chair(?:man|person|woman)?',
  'board member', 'member of the board(?: of directors)?', 'director', 'non-executive director', 'independent director',
  'chief [\\p{L} ]{2,30}?[Oo]fficer', 'head of [\\p{L} &]{2,40}?(?=,| of | in | at | i | for | has | have | and |\\.|$)', '(?:senior |executive )?vice president[\\p{L} &]{0,40}?(?=,| of | in | at | i | for | has | have | and |\\.|$)',
  'president(?: and ceo)?', 'managing director', 'general counsel', 'deputy employee representative to the board', 'employee representative[\\p{L} ]{0,25}?(?=,| of | in | at | i | for | has | have | and |\\.|$)',
  'styreleder', 'nestleder(?: i styret)?', 'styremedlem', 'varamedlem', 'konsernsjef', 'daglig leder', 'finansdirektør', 'administrerende direktør', 'ansatterepresentant', 'direktør[\\p{L} ]{0,25}?(?=,| of | in | at | i | for | has | have | and |\\.|$)',
].map(ci);
const ROLE = `(?:(?:${ci('contracted|interim|acting|group|senior|executive|deputy|incoming|outgoing')})\\s+)*(?:C[A-Z]{1,3}O|EVP|SVP|${ROLES.join('|')})`;
const NOT_NAME = /\b(ASA|AS|AB|Ltd|Limited|Company|Board|Group|Holding|Primary|Insider|Norway|Oslo|Reference|Following|Mandatory|Notification|Shares?|The|Chief|Officer|Director|Chair\w*|Member|Close|Associate|Pursuant|Market|Abuse|Regulation|November|December|January)\b/;

const WHO = [
  // «PBB Protection ApS, a close associate of CEO and primary insider Peter Bjørn Bertelsen»
  [new RegExp(`(?:close(?:ly)?[ -]associated?(?: person| party| company)?|nærstående)\\s+(?:of|to|til|av)\\s+(?:the\\s+|our\\s+|its\\s+)?(?:(${ROLE})(?:\\s+(?:and|og)\\s+(?:a\\s+)?(?:primary insider|primærinnsider)(?:\\s+in\\s+the\\s+[Cc]ompany)?)?[,]?\\s+)?(${NAME})`, 'u'), 2, 1],
  // «related to Mr. Tor Olav Trøim, a director of the Company»
  [new RegExp(`(?:related to|on behalf of|by)\\s+(?:Mr\\.?|Mrs\\.?|Ms\\.?|Dr\\.?)?\\s*(${NAME}),\\s+(?:a |an |the |our )?(${ROLE})`, 'u'), 1, 2],
  // «Primary insider Ole Kristian Sørlie, Head of Finance of …»
  [new RegExp(`(?:[Pp]rimary [Ii]nsider|PDMR|[Pp]rimærinnsider)\\s+(${NAME}),\\s+(?:a |an |the )?(${ROLE})`, 'u'), 1, 2],
  // «Vidar Hasund, Contracted Chief Financial Officer of …» / «Kathleen Offman Mathisen, CHRO in …»
  [new RegExp(`(${NAME}),\\s+(?:a |an |the |our )?(${ROLE})`, 'u'), 1, 2],
  // «board member and primary insider Ashkan Senobari, purchased» / «CEO Jon Smith has bought»
  [new RegExp(`(${ROLE})(?:\\s+(?:and|og)\\s+(?:primary insider|primærinnsider))?[,]?\\s+(?:Mr\\.?\\s+|Mrs\\.?\\s+|Ms\\.?\\s+)?(${NAME})[,]?\\s+(?:in|of|i|has|have|had|bought|sold|purchased|acquired|har|kjøpte|solgte|on)\\b`, 'u'), 2, 1],
];
// Skjemafelt i MAR-meldinger: «Name: Ola Nordmann», «Position/status: CEO»
const FIELD_NAME = new RegExp(`(?:^|\\n|\\s)(?:Name|Navn)(?: of (?:the )?(?:primary insider|person|PDMR))?\\s*:\\s*(${NAME})`, 'u');
const FIELD_ROLE = /(?:Position(?:\/status)?|Stilling(?:\/status)?|Rolle)\s*:\s*([^\n:]{2,60}?)(?=\s{2,}|\n|\s+[A-Z][a-z]+\s*:|$)/;

export const cleanName = n => String(n || '').replace(/^(?:(?:Mr|Mrs|Ms|Miss|Dr|Sir|Herr|Fru)\.?\s+|(?:Primary\s+)?Insider\s+|PDMR\s+|Primærinnsider\s+)+/i, '').replace(/[,.]$/, '').trim();
const okName = n => n && n.split(/\s+/).length >= 2 && n.length <= 60 && !NOT_NAME.test(n);

export function who(t = '') {
  for (const [re, ni, ri] of WHO) {
    const m = t.match(re);
    if (m && okName(cleanName(m[ni]))) return { navn: cleanName(m[ni]), rolle: (m[ri] || '').trim() || null };
  }
  const f = t.match(FIELD_NAME);
  if (f && okName(cleanName(f[1]))) return { navn: cleanName(f[1]), rolle: t.match(FIELD_ROLE)?.[1]?.trim() || null };
  return null;
}

// Antall aksjer: alle skilletegn er tusenskille. Kurs: siste skilletegn er desimaltegn (men «1,200» med tre sifre etter er tusen).
const int = s => { if (!s) return null; const n = Number(String(s).replace(/[\s .,]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
const dec = s => {
  if (!s) return null; let t = String(s).replace(/[\s ]/g, '').replace(/[.,]$/, '');
  const i = Math.max(t.lastIndexOf('.'), t.lastIndexOf(','));
  if (i >= 0) t = t.slice(0, i).replace(/[.,]/g, '') + '.' + t.slice(i + 1);
  const n = Number(t); return Number.isFinite(n) && n > 0 ? n : null;
};
const N = '(\\d[\\d\\s\\u00a0.,]*\\d|\\d)';

/** Avsnitt uten topplinjer, kontaktinfo og standardtekst. */
export function paragraphs(body = '') {
  return String(body).replace(/\r/g, '').split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim())
    .filter(p => p.length > 40 && !/^\d{1,2}\.\d{1,2}\.\d{4}\s+\d{1,2}:\d{2}/.test(p) && !/^(contacts?|kontakt|attachments?|vedlegg|for further (?:information|queries)|this information is subject|denne opplysningen er|this (?:stock exchange )?announcement)/i.test(p));
}

/** «ABOUT THOR MEDICAL ASA» / «Om selskapet»: selskapets egen beskrivelse, brukt på aksjesiden. */
export function about(body = '') {
  const raw = String(body).replace(/\r/g, '');
  const m = raw.match(/\n\s*(?:ABOUT|About|OM|Om)\s+(?:THE COMPANY|the Company|SELSKAPET|selskapet|[^\n]{2,60})\s*:?\s*\n+([\s\S]{60,1500}?)(?:\n\s*\n\s*(?:[A-ZÆØÅ][A-ZÆØÅ &.,'-]{3,60}|[A-Z][\w ]{2,30}:)\s*\n|\n\s*\n\s*(?:For (?:further|more) information|Contacts?|ATTACHMENTS|Important|Disclaimer|Forward-looking|This information)|$)/);
  if (!m) return null;
  const t = m[1].replace(/\s+/g, ' ').replace(/\s*-\s*https?:\/\/\S+/g, '').trim();
  return t.length >= 60 ? t.slice(0, 700).replace(/\s\S*$/, t.length > 700 ? ' …' : '') : null;
}

/** Plukker ut kjøp/salg, antall, kurs, valuta og hvem som handlet. */
export function parseInsider(body = '', title = '') {
  const ps = paragraphs(body), first = ps[0] || '', lead = ps.slice(0, 3).join(' ');
  const t = (title + ' ' + first).toLowerCase();
  const k = /\b(sold|sells|sale of|disposed|divest\w*|solgt|selger|salg av)\b/.test(t) ? 'S'
    : /\b(bought|buys?|purchased?|acquired?|subscribed|kjøpt|kjøper|kjøp av|tegnet|ervervet)\b/.test(t) ? 'K'
    : /\b(allocat\w*|grant\w*|tildelt|tildeling|awarded|exercis\w*|innløst|vested|settlement of)\b/.test(t) ? 'T' : 'U';
  const verb = '(?:bought|purchased|acquired|sold|disposed of|subscribed (?:for|to)|received|been allocated|been granted|exercised|kjøpt|solgt|tegnet|ervervet|fått tildelt)';
  const ant = int(lead.match(new RegExp(`${verb}\\s+(?:a total of\\s+|totalt\\s+)?${N}\\s+(?:new\\s+|ordinary\\s+|class [A-Z]\\s+|nye\\s+)?(?:shares|aksjer)`, 'i'))?.[1]
    || first.match(new RegExp(`${N}\\s+(?:new\\s+|ordinary\\s+)?(?:shares|aksjer)`, 'i'))?.[1]);
  const cm = lead.match(new RegExp(`(NOK|EUR|USD|SEK|DKK|GBP|kr\\.?)\\s*${N}\\s*(?:per|pr\\.?|/)\\s*(?:share|aksje)`, 'i'))
    || lead.match(new RegExp(`(?:average\\s+)?(?:price|kurs|pris)(?:\\s+per\\s+share)?\\s+(?:of\\s+|på\\s+)?(NOK|EUR|USD|SEK|DKK|GBP|kr\\.?)?\\s*${N}(?:\\s*(NOK|EUR|USD|SEK|DKK|GBP))?`, 'i'))
    || lead.match(new RegExp(`\\bat\\s+(NOK|EUR|USD|SEK|DKK|GBP)\\s*${N}`, 'i'));
  const kurs = cm ? dec(cm[2]) : null, cur = cm ? ((cm[1] || cm[3] || 'NOK').toUpperCase().replace(/^KR\.?$/, 'NOK')) : null;
  const w = who(first) || who(lead) || who(String(body).slice(0, 4000));
  return { k, ant: ant && ant < 1e10 ? ant : null, kurs: kurs && kurs < 1e6 ? kurs : null, cur, tekst: (first || lead).slice(0, 450),
    ...(w ? { navn: w.navn, rolle: w.rolle } : {}), om: about(body) };
}

/** Flaggemeldinger: hvem passerte en eierandelsgrense, i hvilken retning, og ny andel. */
export function parseFlagging(body = '', title = '', issuer = '') {
  const ps = paragraphs(body), first = ps.slice(0, 2).join(' ').slice(0, 900);
  const t = (title + ' ' + first).toLowerCase();
  const retning = /\b(upward|above|exceed\w*|increas\w*|acquired|bought|purchased|kjøpte|crossed above|over\s+\d)/.test(t) ? 'opp'
    : /\b(downward|below|fallen|fell|decreas\w*|reduc\w*|sold|disposed|solgte|crossed below|under\s+\d)/.test(t) ? 'ned' : '';
  // Ny andel: tallet rett etter «holds/now owns/total of/representing/tilsvarende», ellers siste prosent i teksten
  const P = '(\\d{1,3}(?:[.,]\\d{1,4})?)\\s?(?:%|per\\s?cent|prosent)';
  const after = first.match(new RegExp(`(?:now\\s+(?:holds?|owns?)|holds?|owns?|total(?:\\s+holding)?\\s+of|representing|corresponding to|equal to|tilsvarende|totalt|utgjør|eier nå)[^.%]{0,80}?${P}`, 'i'));
  const pcts = [...first.matchAll(new RegExp(P, 'gi'))].map(m => Number(m[1].replace(',', '.'))).filter(n => n > 0 && n <= 100);
  const pst = after ? Number(after[1].replace(',', '.')) : pcts.length ? pcts[pcts.length - 1] : null;
  const norm = x => x.toLowerCase().replace(/[^\p{L}\d]/gu, '');
  const FORM = '(?:Corporation|Corp\\.?|AS|ASA|AB|ApS|A\\/S|Ltd\\.?|Limited|LLC|LLP|LP|L\\.P\\.|Inc\\.?|plc|PLC|GmbH|SE|AG|N\\.V\\.|S\\.A\\.|SA|S\\.à r\\.l\\.|Sàrl|KS|Oyj|Holding|Holdings|Fund|Fondet|Folketrygdfondet)';
  const cands = [...first.matchAll(new RegExp(`((?:[${U}0-9][\\p{L}&.'\\-0-9]*\\s){0,6}${FORM})(?=[\\s,.)"'(]|$)`, 'gu'))].map(m => m[1].trim().replace(/^.*[.:]\s+/, ''))
    .filter(c => c.split(/\s+/).length >= 2 && !/^\d/.test(c) && (!issuer || norm(c) !== norm(issuer)) && !/^(The|Notification|Disclosure|Reference|Oslo|Please)\b/.test(c));
  // Personer som flagger: «Kjell Inge Røkke has …» (navn før verb)
  const person = first.match(new RegExp(`(${NAME})(?:,| has| have| through| via| and)`, 'u'))?.[1];
  // Eier i tittelen («The Goldman Sachs Group, Inc. Disclosure in BLUENORD ASA») eller «on behalf of Bank of America Corporation»
  const tm = (String(title).match(/^(.{3,80}?)[,:]?\s+(?:-\s+)?(?:disclosure|notification|melding)\s+(?:in|of|i)\b/i) || String(title).match(/^(.{3,60}?)\s*:\s*(?:shareholding\s+)?disclosures?\s+(?:on|in)\b/i))?.[1]?.trim();
  const fromTitle = tm && !/(mandatory|major|shareholding|holdings?\b|notification|disclosure|flagging|melding|the company|:)/i.test(tm) && !norm(issuer).includes(norm(tm)) ? tm : null;
  const ob = first.match(/on behalf of\s+(?:the\s+)?([A-Z].{2,80}?)(?=\s+(?:in respect|regarding|relating|in|for|concerning|with)\b|[,(]|\.\s|$)/)?.[1]?.trim();
  const holder = fromTitle || ob || cands.find(c => !norm(issuer).includes(norm(c))) || (person && okName(cleanName(person)) ? cleanName(person) : null);
  return { retning, pst: pst && pst <= 100 ? pst : null, eier: holder || null, tekst: first.slice(0, 450), om: about(body) };
}
