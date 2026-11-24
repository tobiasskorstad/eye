// Lager én selvstendig HTML-fil med data innebygd (for demo eller statisk hosting uten server).
// Bruk: node tools/static.js [data/eye.json] [dist/eye.html]
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const root = new URL('..', import.meta.url).pathname;
const [dataFile = path.join(root, 'data/eye.json'), out = path.join(root, 'dist/eye.html')] = process.argv.slice(2);

const [html, css, js, data] = await Promise.all([
  fs.readFile(path.join(root, 'public/index.html'), 'utf8'),
  fs.readFile(path.join(root, 'public/app.css'), 'utf8'),
  fs.readFile(path.join(root, 'public/app.js'), 'utf8'),
  fs.readFile(dataFile, 'utf8'),
]);
const safe = s => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
// Streng CSP også i enkeltfilen: bare akkurat disse to skriptene får kjøre (sha256), og bare Brønnøysund kan kontaktes.
const s1 = `window.EYE_DATA=${safe(data)};`, s2 = safe(js);
const sha = s => `'sha256-${crypto.createHash('sha256').update(s).digest('base64')}'`;
const csp = `default-src 'none'; script-src ${sha(s1)} ${sha(s2)}; style-src 'unsafe-inline'; img-src data:; connect-src https://data.brreg.no; base-uri 'none'; form-action 'none'; object-src 'none'`;
const page = html
  .replace('<meta charset="utf-8">', m => `${m}\n<meta http-equiv="Content-Security-Policy" content="${csp}">\n<meta name="referrer" content="strict-origin-when-cross-origin">`)
  .replace('<link rel="stylesheet" href="app.css">', () => `<style>${css}</style>`)
  .replace('<script src="app.js"></script>', () => `<script>${s1}</script>\n<script>${s2}</script>`);
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, page);
console.log('skrev', out, Math.round(page.length / 1024), 'KB');
