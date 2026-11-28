// Lager et rent statisk nettsted i site/ for GitHub Pages: ingen server, ingen database, ingenting å bryte seg inn i.
// Bruk: node tools/pages.js [data/eye.json] [site]
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const root = new URL('..', import.meta.url).pathname;
const [dataFile = path.join(root, 'data/eye.json'), out = path.join(root, 'site')] = process.argv.slice(2);

// Brukerkontoer (valgfritt): Supabase-prosjektets adresse og offentlige «anon»-nøkkel. Begge er ment å være offentlige;
// sikkerheten ligger i tilgangsreglene i databasen (supabase/schema.sql).
const SB_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, ''), SB_KEY = (process.env.SUPABASE_ANON_KEY || '').trim();
const auth = /^https:\/\/[a-z0-9]{10,40}\.supabase\.co$/.test(SB_URL) && /^[\w.-]{20,}$/.test(SB_KEY) ? { url: SB_URL, key: SB_KEY } : null;
if ((SB_URL || SB_KEY) && !auth) throw new Error('SUPABASE_URL/SUPABASE_ANON_KEY har feil format');
if (auth && (/^sb_secret_/.test(SB_KEY) || /service_role/.test(Buffer.from(SB_KEY.split('.')[1] || '', 'base64url').toString()))) throw new Error('Det er service_role-nøkkelen – den må aldri publiseres. Bruk anon-nøkkelen.');
export const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  `connect-src 'self' https://data.brreg.no${auth ? ' ' + auth.url : ''}; base-uri 'none'; form-action 'none'; object-src 'none'; manifest-src 'self'`;
const head = csp => `<meta http-equiv="Content-Security-Policy" content="${csp}">\n<meta name="referrer" content="strict-origin-when-cross-origin">` +
  (auth ? `\n<meta name="eye-auth" content='${JSON.stringify(auth)}'>` : '');

const data = JSON.parse(await fs.readFile(dataFile, 'utf8'));
if (!Array.isArray(data.reps) || data.reps.length < 150) throw new Error('data ser ufullstendige ut – publiserer ikke');
if (/"f(o|oe)dselsdato"/i.test(JSON.stringify(data)) || data.reps.some(r => r.fodt && !/^\d{4}$/.test(String(r.fodt)))) throw new Error('fødselsdatoer i offentlige data – publiserer ikke');
if (Object.values(data.profiler || {}).some(p => /\b(født|born)\b[^.]{0,40}\d{4}/i.test(p.wiki?.tekst || ''))) throw new Error('fødselsdato i Wikipedia-omtale – publiserer ikke');

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });
const html = (await fs.readFile(path.join(root, 'public/index.html'), 'utf8')).replace('<meta charset="utf-8">', m => m + '\n' + head(CSP));
const hash = b => crypto.createHash('sha256').update(b).digest('base64').slice(0, 10);
const css = await fs.readFile(path.join(root, 'public/app.css')), js = await fs.readFile(path.join(root, 'public/app.js'));
// Filnavn med innholdshash: nettleseren henter alltid riktig versjon.
const cssName = `app.${hash(css).replace(/[^\w]/g, '')}.css`, jsName = `app.${hash(js).replace(/[^\w]/g, '')}.js`;
await fs.writeFile(path.join(out, cssName), css);
await fs.writeFile(path.join(out, jsName), js);
await fs.writeFile(path.join(out, 'index.html'), html.replace('href="app.css"', `href="${cssName}"`).replace('src="app.js"', `src="${jsName}"`));
// Store tilleggsdata lastes bare når de trengs: full biografi (åpnes på profilsider)
const { bio = {}, dommere = null, ...lean } = data;
await fs.writeFile(path.join(out, 'bio.json'), JSON.stringify(bio));
await fs.writeFile(path.join(out, 'dommere.json'), JSON.stringify(dommere || { liste: [] }));
await fs.writeFile(path.join(out, 'data.json'), JSON.stringify(lean));
// Portretter lastet ned i bygget (data/img): publiseres sammen med siden, så de besøkende ikke kontakter tredjeparter.
const imgDir = path.join(path.dirname(dataFile), 'img'), used = new Set(Object.values(data.profiler || {}).map(p => p.foto).filter(Boolean));
await fs.mkdir(path.join(out, 'img'), { recursive: true });
for (const f of await fs.readdir(imgDir).catch(() => [])) if (/^[a-z0-9-]{1,80}\.jpg$/.test(f) && used.has('img/' + f)) await fs.copyFile(path.join(imgDir, f), path.join(out, 'img', f));
await fs.writeFile(path.join(out, '.nojekyll'), '');
await fs.writeFile(path.join(out, 'robots.txt'), 'User-agent: *\nAllow: /\n');
await fs.mkdir(path.join(out, '.well-known'), { recursive: true });
await fs.writeFile(path.join(out, '.well-known/security.txt'), 'Contact: https://github.com/tobiasskorstad/eye/security/advisories/new\nPreferred-Languages: no, en\nExpires: 2027-12-31T23:00:00.000Z\n');
console.log('skrev', out);
