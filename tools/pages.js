// Lager et rent statisk nettsted i site/ for GitHub Pages: ingen server, ingen database, ingenting å bryte seg inn i.
// Bruk: node tools/pages.js [data/eye.json] [site]
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const root = new URL('..', import.meta.url).pathname;
const [dataFile = path.join(root, 'data/eye.json'), out = path.join(root, 'site')] = process.argv.slice(2);

export const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  "connect-src 'self' https://data.brreg.no; base-uri 'none'; form-action 'none'; object-src 'none'; manifest-src 'self'";
const head = csp => `<meta http-equiv="Content-Security-Policy" content="${csp}">\n<meta name="referrer" content="strict-origin-when-cross-origin">`;

const data = JSON.parse(await fs.readFile(dataFile, 'utf8'));
if (!Array.isArray(data.reps) || data.reps.length < 150) throw new Error('data ser ufullstendige ut – publiserer ikke');
if (/"f(o|oe)dselsdato"/i.test(JSON.stringify(data)) || data.reps.some(r => r.fodt && !/^\d{4}$/.test(String(r.fodt)))) throw new Error('fødselsdatoer i offentlige data – publiserer ikke');

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
await fs.writeFile(path.join(out, 'data.json'), JSON.stringify(data));
await fs.writeFile(path.join(out, '.nojekyll'), '');
await fs.writeFile(path.join(out, 'robots.txt'), 'User-agent: *\nAllow: /\n');
await fs.mkdir(path.join(out, '.well-known'), { recursive: true });
await fs.writeFile(path.join(out, '.well-known/security.txt'), 'Contact: https://github.com/tobiasskorstad/eye/security/advisories/new\nPreferred-Languages: no, en\nExpires: 2027-12-31T23:00:00.000Z\n');
console.log('skrev', out);
