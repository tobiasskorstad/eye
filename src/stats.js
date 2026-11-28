// «Tall i debatten»: offisiell statistikk fra SSB og Norges Bank for temaene politikere oftest strides om.
// EYE feller ingen dom over påstander – siden viser siste tall, utviklingen og kilden, så alle kan sjekke selv.
import { config } from './config.js';
import { getJson, allowHosts } from './http.js';

const SSB = config.ssbApi, NB = config.nbApi;
allowHosts([SSB, NB]);

const MND = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
/** «2026M10» → «oktober 2026», «2026K3» → «3. kvartal 2026», «2025» → «2025», «2026-11-26» → «26. november 2026». */
export function periode(p) {
  let m;
  if ((m = /^(\d{4})M(\d{2})$/.exec(p))) return `${MND[+m[2] - 1]} ${m[1]}`;
  if ((m = /^(\d{4})K(\d)$/.exec(p))) return `${m[2]}. kvartal ${m[1]}`;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p))) return `${+m[3]}. ${MND[+m[2] - 1]} ${m[1]}`;
  return p;
}

/** Henter én serie fra SSB (PxWebApi v2, json-stat2). Alle variabler unntatt Tid må ha én verdi. */
export async function ssbSeries(table, codes, n = 13) {
  const qs = Object.entries({ ...codes, Tid: `top(${n})` }).map(([k, v]) => `valueCodes[${k}]=${encodeURIComponent(v)}`).join('&');
  const j = await getJson(`${SSB}/tables/${table}/data?lang=no&outputFormat=json-stat2&${qs}`);
  if (!j?.value || !j.dimension?.Tid) throw new Error(`SSB ${table}: tomt svar`);
  const tid = Object.entries(j.dimension.Tid.category.index).sort((a, b) => a[1] - b[1]).map(([t]) => t);
  return { serie: tid.map((t, i) => ({ p: t, v: j.value[i] })).filter(x => x.v != null), oppdatert: j.updated?.slice(0, 10) || null };
}

/** Styringsrenten fra Norges Bank (SDMX-JSON), siste år. */
export async function policyRate() {
  const from = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
  const j = await getJson(`${NB}/data/IR/B.KPRA.SD.R?format=sdmx-json&startPeriod=${from}&locale=no`);
  const s = Object.values(j?.data?.dataSets?.[0]?.series || {})[0], times = j?.data?.structure?.dimensions?.observation?.[0]?.values || [];
  if (!s) throw new Error('Norges Bank: tomt svar');
  const all = Object.entries(s.observations).map(([i, v]) => ({ p: times[i].id, v: Number(v[0]) })).sort((a, b) => a.p.localeCompare(b.p));
  // én verdi per måned (siste observasjon i måneden) holder for en kurve
  const byM = new Map(all.map(o => [o.p.slice(0, 7), o]));
  return { serie: [...byM.values()], oppdatert: all.at(-1)?.p || null };
}

const pct = (a, b) => (b ? Math.round(1000 * (a - b) / b) / 10 : null);
const ago = (serie, k) => serie[serie.length - 1 - k] || null;

// Hver indikator: hvor tallet kommer fra, hvordan det leses, og hva som ofte blandes sammen i debatten.
const INDICATORS = [
  { id: 'ledighet', tittel: 'Arbeidsledighet', enhet: '%', des: 1, tabell: '13760', kilde: 'SSB, arbeidskraftundersøkelsen (sesongjustert)',
    hent: () => ssbSeries('13760', { Kjonn: '0', Alder: '15-74', Justering: 'S', ContentsCode: 'ArbledProsArbstyrk' }, 13), sml: 12,
    forklaring: 'Andel av arbeidsstyrken (15–74 år) som er uten jobb, har søkt arbeid og kan begynne. NAVs tall for registrerte helt ledige er et annet mål og er lavere – sjekk hvilket tall en påstand bygger på.' },
  { id: 'prisvekst', tittel: 'Prisvekst (KPI)', enhet: '%', des: 1, tabell: '14700', kilde: 'SSB, konsumprisindeksen',
    hent: () => ssbSeries('14700', { VareTjenesteGrp: '00', ContentsCode: 'Tolvmanedersendring' }, 13), sml: 12,
    forklaring: 'Hvor mye prisene har steget de siste tolv månedene. Norges Banks mål er 2 %. Kjerneinflasjonen (KPI-JAE, uten energi og avgiftsendringer) brukes ofte i rentedebatten og kan avvike.' },
  { id: 'rente', tittel: 'Styringsrenten', enhet: '%', des: 2, kilde: 'Norges Bank', url: 'https://www.norges-bank.no/tema/pengepolitikk/Styringsrenten/',
    hent: policyRate, sml: 12,
    forklaring: 'Renten bankene får på innskudd i Norges Bank. Den settes av Norges Bank, ikke av regjeringen eller Stortinget.' },
  { id: 'bnp', tittel: 'Økonomisk vekst (BNP Fastlands-Norge)', enhet: '%', des: 1, tabell: '09190', kilde: 'SSB, nasjonalregnskapet',
    hent: () => ssbSeries('09190', { Makrost: 'bnpb.nr23_9fn', ContentsCode: 'Volum' }, 9), sml: 4,
    forklaring: 'Volumendring fra samme kvartal året før, uten olje, gass og utenriks sjøfart. Kvartalstallene revideres ofte i etterkant.' },
  { id: 'boligpris', tittel: 'Boligpriser', enhet: 'indeks', des: 1, tabell: '07221', kilde: 'SSB, prisindeks for brukte boliger (2015 = 100)',
    hent: () => ssbSeries('07221', { Region: 'TOTAL', Boligtype: '00', ContentsCode: 'Boligindeks' }, 9), sml: 4, visEndring: true,
    forklaring: 'Prisutviklingen for brukte boliger i hele landet. Endringen er målt mot samme kvartal året før. Prisene varierer mye mellom byer og distrikter.' },
  { id: 'befolkning', tittel: 'Folketall', enhet: 'personer', des: 0, tabell: '01222', kilde: 'SSB, befolkningsstatistikk',
    hent: () => ssbSeries('01222', { Region: '0', ContentsCode: 'Folketallet11' }, 9), sml: 4, visEndring: true,
    forklaring: 'Antall bosatte i Norge ved utgangen av kvartalet. Veksten de siste årene skyldes i stor grad innvandring.' },
  { id: 'innvandring', tittel: 'Innvandring per kvartal', enhet: 'personer', des: 0, tabell: '01222', kilde: 'SSB, befolkningsstatistikk',
    hent: () => ssbSeries('01222', { Region: '0', ContentsCode: 'Innvandring5' }, 9), sml: 4,
    forklaring: 'Antall som flyttet til Norge i kvartalet, inkludert norske statsborgere som flytter hjem. Utvandring er ikke trukket fra.' },
  { id: 'lovbrudd', tittel: 'Anmeldte lovbrudd', enhet: 'per 1 000 innbyggere', des: 1, tabell: '08484', kilde: 'SSB, kriminalstatistikken',
    hent: () => ssbSeries('08484', { LovbruddKrim: '1AAAAA-9ZZZZz', ContentsCode: 'AnmLovbrPer1000' }, 11), sml: 10,
    forklaring: 'Lovbrudd anmeldt til politiet per 1 000 innbyggere. Antall anmeldelser påvirkes av hvor mye politiet prioriterer og hvor villige folk er til å anmelde – det er ikke det samme som all kriminalitet.' },
];

/** Henter alle indikatorene. En indikator som feiler, beholder forrige verdi. */
export async function fetchStats(previous = [], warnings = []) {
  const prev = Object.fromEntries((previous || []).map(x => [x.id, x]));
  const out = [];
  for (const ind of INDICATORS) {
    try {
      const { serie, oppdatert } = await ind.hent();
      if (!serie.length) throw new Error('ingen tall');
      const siste = serie.at(-1), før = ago(serie, ind.sml);
      out.push({ id: ind.id, tittel: ind.tittel, enhet: ind.enhet, des: ind.des, forklaring: ind.forklaring, kilde: ind.kilde,
        url: ind.url || `https://www.ssb.no/statbank/table/${ind.tabell}`, oppdatert,
        verdi: siste.v, periode: periode(siste.p),
        ...(før ? { før: { verdi: før.v, periode: periode(før.p) }, ...(ind.visEndring ? { endringPst: pct(siste.v, før.v) } : {}) } : {}),
        serie: serie.slice(-13).map(x => x.v) });
    } catch (e) {
      warnings.push(`Statistikk «${ind.tittel}» feilet: ${e.message}`);
      if (prev[ind.id]) out.push(prev[ind.id]);
    }
  }
  return out;
}
