// Sender e-post til brukere som har slått på varsler, om nye endringer for det de følger.
// Kjører bare når SUPABASE_URL, SUPABASE_SECRET_KEY, RESEND_API_KEY og EPOST_FRA er satt (GitHub-hemmeligheter).
// Hemmelig nøkkel brukes bare her i GitHub Actions – aldri i nettsiden.
import fs from 'node:fs/promises';
import path from 'node:path';

const { SUPABASE_URL: SB, SUPABASE_SECRET_KEY: KEY, RESEND_API_KEY: RESEND, EPOST_FRA: FRA, SITE_URL = 'https://tobiasskorstad.github.io/eye/' } = process.env;
const dataDir = process.argv[2] || 'data';
if (!SB || !KEY || !RESEND || !FRA) { console.log('[varsler] ikke satt opp – hopper over'); process.exit(0); }
if (!/^https:\/\/[a-z0-9]{10,40}\.supabase\.co$/.test(SB)) throw new Error('ugyldig SUPABASE_URL');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const sb = async p => { const r = await fetch(SB + p, { headers: { apikey: KEY, authorization: 'Bearer ' + KEY } }); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); };

const pub = JSON.parse(await fs.readFile(path.join(dataDir, 'eye.json'), 'utf8'));
const sentFile = path.join(dataDir, 'varslet.json');
let sent = new Set(); try { sent = new Set(JSON.parse(await fs.readFile(sentFile, 'utf8'))); } catch { }
const since = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
const fresh = (pub.endringer || []).filter(e => !sent.has(e.id) && e.d >= since);
if (!fresh.length) { console.log('[varsler] ingen nye endringer'); process.exit(0); }

const profiler = await sb('/rest/v1/profiles?select=id&epostvarsler=eq.true');
const ids = new Set(profiler.map(p => p.id));
const folger = ids.size ? await sb('/rest/v1/folger?select=bruker,type,ref') : [];
const users = []; for (let page = 1; page < 50; page++) { const r = await sb(`/auth/v1/admin/users?page=${page}&per_page=1000`); users.push(...r.users); if (r.users.length < 1000) break; }
const email = Object.fromEntries(users.filter(u => u.email && u.email_confirmed_at).map(u => [u.id, u.email]));

let n = 0;
for (const id of ids) {
  if (!email[id]) continue;
  const mine = new Set(folger.filter(f => f.bruker === id).map(f => `${f.type}:${f.ref}`));
  const hits = fresh.filter(e => mine.has(`${e.type}:${e.ref}`) || (e.type === 'rep' && mine.has(`parti:${e.parti}`))).slice(0, 30);
  if (!hits.length) continue;
  const html = `<p>Dette er nytt for det du følger på EYE:</p><ul>${hits.map(e => `<li><a href="${esc(e.lenke?.startsWith('#') ? SITE_URL + e.lenke : e.lenke)}">${esc(e.tekst)}</a></li>`).join('')}</ul><p><a href="${SITE_URL}#konto">Endre varsler eller slett kontoen</a></p>`;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: 'Bearer ' + RESEND, 'content-type': 'application/json' },
    body: JSON.stringify({ from: FRA, to: [email[id]], subject: `EYE: ${hits.length} ${hits.length === 1 ? 'nyhet' : 'nyheter'} for det du følger`, html }) });
  if (r.ok) n++; else console.log('[varsler] e-post feilet', r.status);
  await new Promise(r => setTimeout(r, 600)); // Resend: maks 2 per sekund
}
for (const e of fresh) sent.add(e.id);
await fs.writeFile(sentFile, JSON.stringify([...sent].slice(-20000)));
console.log(`[varsler] sendte ${n} e-poster`);
