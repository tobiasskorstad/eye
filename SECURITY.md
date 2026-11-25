# Sikkerhet

Fant du et hull? Meld det privat via **Security → Report a vulnerability** i dette repoet, ikke som åpen issue.

## Slik er EYE sikret
- **Ingen server i drift.** Nettstedet er statiske filer på GitHub Pages, bygget hver natt av GitHub Actions. Ingen database, ingen innlogging, ingen brukerdata lagres.
- **Ingen hemmeligheter.** Alle kilder er åpne API-er uten nøkler. Repoet har ingen tokens eller passord.
- **XSS-vern.** All tekst fra kildene settes inn escapet (`esc()`), og alle lenker går gjennom `url()` som bare slipper gjennom `http(s)`. Testes med ondsinnede data i `test/security.test.js`.
- **Streng Content-Security-Policy.** Bare egne skript kjører; nettleseren kan bare kontakte egen side og Brønnøysunds åpne API.
- **Personvernsperre.** Publiseringen stopper hvis fødselsdatoer finnes i de offentlige dataene (`tools/pages.js`).
- **Forsyningskjede.** Én avhengighet i drift (pdfjs-dist, bare ved bygging). `npm ci --ignore-scripts`, `npm audit`, Dependabot og CodeQL. Arbeidsflytene har minste nødvendige rettigheter.
- **Hvis du kjører Node-serveren selv:** sikkerhetshoder (CSP, HSTS, nosniff, DENY-framing), vern mot stiangrep, tidsavbrudd mot treg-angrep, rate limit per IP og totalt, `TRUST_PROXY=1` bare bak egen proxy.

## Brukerkontoer
- Innlogging via Supabase Auth (PKCE). Ingen passord hos oss, ingen tredjepartsskript i siden.
- Row Level Security på alle tabeller: hver bruker ser og endrer bare egne rader; anonyme har ingen tilgang (`supabase/schema.sql`, testet i `test/security.test.js`).
- Bare den offentlige anon/publishable-nøkkelen publiseres. Bygget stopper hvis en hemmelig nøkkel blir forsøkt publisert.
- Politiske svar lagres bare med uttrykkelig samtykke og slettes automatisk når samtykket trekkes. Brukeren kan laste ned og slette alt selv.
