# Maktkartet

**Nettsted:** https://tobiasskorstad.github.io/eye/ (bygges hver natt av GitHub Actions, se `.github/workflows/pages.yml`).
Kjør bygget manuelt: Actions → publiser → Run workflow. Sikkerhet: se `SECURITY.md`.


Åpen innsikt i Stortinget: hvem representantene er, hva de spør regjeringen om, hvilke verv og selskaper de har, og hvilke aksjer de handler. Alt hentes fra offentlige kilder og oppdateres automatisk hver natt.

## Hva den gjør

| Del | Kilde | Oppdatering |
|---|---|---|
| Representanter, komiteer, biografi | data.stortinget.no | nattlig |
| Spørsmål til regjeringen (inneværende stortingsperiode) | data.stortinget.no | nattlig |
| Verv, selskapsinteresser, gaver, aksjehandler | Stortingets interesseregister (PDF) | nattlig (registeret oppdateres ca. annenhver uke) |
| Selskaper og roller | Enhetsregisteret, data.brreg.no | nattlig + live søk |
| Partienes saker, argumenter for/mot, utvalgte nyheter | `content/partier.json` (redaksjonelt) | når filen endres |
| Nyhetsoverskrifter per parti | RSS-feeds (`NEWS_FEEDS`) | nattlig |

**Live selskapssøk:** `/api/sok` og `/api/enhet/{orgnr}` slår opp direkte i Enhetsregisteret og viser om noen av dagens stortingsrepresentanter har en rolle i selskapet. Representanter matches på etternavn **og** fødselsdato.

## Åpenhet først

Maktkartet gjengir offentlige registre så fullstendig som mulig:

- Interesseregisteret vises **ordrett**, alle paragrafer, også gaver, reiser og «andre forhold».
- Selskapssider viser **alle** registrerte roller i Enhetsregisteret, ikke bare politikerne.
- Alle aksjehandler representantene har meldt vises.

Det eneste som holdes utenfor er det loven krever: fødselsdatoer (brukes bare internt for å koble representanter til roller), adresser og telefonnummer til privatpersoner, og søk etter privatpersoner. Maktkartet er en tjeneste om makt og penger, ikke en personsøketjeneste.

## Partifanen

`content/partier.json` er redaksjonelt innhold: leder, rolle, tre saker per parti med to argumenter for og to mot, kilde for hver sak, og utvalgte nyheter. En test (`test/parties.test.js`) sjekker at alle partier har nøyaktig samme oppsett, så ingen får mer plass enn andre. Oppdater filen når politikken endrer seg; nyhetsoverskrifter fra RSS kommer i tillegg automatisk hver natt (bare tittel og lenke).

## Kjør lokalt

Krever Node.js 20 eller nyere.

```bash
npm install
npm start            # http://localhost:8080 – bygger data ved første oppstart (tar noen minutter)
```

Bygg data manuelt: `npm run build-data`. Lag én selvstendig HTML-fil med data innebygd (for statisk hosting eller demo): `node tools/static.js`. Kjør tester: `npm test` (bruker en mock av alle kildene, ingen nettverk nødvendig).

## Publiser

Appen er én Node-prosess uten database. Data ligger som JSON i `DATA_DIR`, som må være en vedvarende disk.

**Docker (hvor som helst):**
```bash
docker build -t eye .
docker run -d -p 8080:8080 -v eye-data:/data --name eye eye
```

**Fly.io, Render, Railway o.l.:** pek tjenesten på repoet (Dockerfile oppdages automatisk), legg til et volum montert på `/data`, og sett porten til 8080. Én liten instans holder.

**Egen server (VPS):** kjør Docker-kommandoen over, og legg en reverse proxy med HTTPS foran (f.eks. Caddy: `eye.no { reverse_proxy localhost:8080 }`).

## Konfigurasjon (miljøvariabler)

| Variabel | Standard | Forklaring |
|---|---|---|
| `PORT` | 8080 | Port |
| `DATA_DIR` | `./data/` | Hvor JSON-dataene lagres |
| `REFRESH_HOUR` | 3 | Time (norsk tid) for nattlig oppdatering. `-1` slår av |
| `BUILD_ON_START` | 1 | Bygg data ved oppstart hvis ingen finnes |
| `NEWS_FEEDS` | NRK toppsaker + Norge | Kommaseparerte RSS/Atom-adresser for partinyheter |
| `CONCURRENCY` / `DELAY_MS` | 4 / 120 | Hvor hardt kildene belastes |
| `STORTINGET_API`, `BRREG_API`, `REGISTER_PAGE` | ekte kilder | Brukes av testene for å peke mot mock |

## API

| Endepunkt | Svar |
|---|---|
| `GET /api/data` | Alle data for forsiden (ETag, 5 min cache) |
| `GET /api/status` | Når data sist ble hentet, advarsler fra siste bygg |
| `GET /api/sok?q=navn` | Opptil 15 treff i Enhetsregisteret, med koblede representanter |
| `GET /api/enhet/{orgnr}` | Nøkkeltall + hvilke representanter som har roller |

Søk og oppslag er begrenset til 60 per minutt per IP og caches (1 t / 6 t).

## Robusthet

- Bygget avbrytes hvis Stortinget returnerer færre enn 150 representanter, slik at ufullstendige data aldri publiseres.
- Feiler interesseregisteret (f.eks. nytt PDF-format), beholdes forrige versjon og en advarsel vises i `/api/status`.
- Filer skrives atomisk; serveren fortsetter å vise siste gode data mens den bygger.

## Struktur

```
src/
  server.js      HTTP-server, API, nattlig jobb
  build.js       Henter alle kilder og skriver data/eye.json
  stortinget.js  Representanter, biografier, spørsmål
  register.js    Interesseregisteret: PDF → tekst → verv, handler, selskaper, personvernfiltre
  brreg.js       Enhetsregisteret: søk, enheter, roller, matching
public/          Nettsiden: index.html, app.css, app.js (≈11 KB gzip, ingen eksterne kall)
tools/static.js  Bygger én selvstendig HTML-fil
test/            Enhetstester, ende-til-ende-test og mock av alle kilder
```

## Neste steg

- Faktasjekkmodul
- Stemmegivning og fravær per representant (voteringer)
- Brreg «totalbestand roller» for å finne roller representantene ikke selv har oppgitt
