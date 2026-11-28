// Offentlige netto shortposisjoner i norske aksjer (Finanstilsynets Short Sale Register, åpent API).
// Posisjoner på 0,5 % eller mer av aksjene publiseres med navn på den som shorter (fond og selskaper).
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { getJson, allowHosts } from './http.js';

const API = config.ssrApi;
allowHosts([API]);
const DAY = 864e5;
const day = s => String(s || '').slice(0, 10);

/** Gjør om historikken (nyeste først) til dagens posisjon, aktive shortere og en kort tidsserie. */
export function summarizeShort(list, now = new Date()) {
  const cut = day(new Date(now - 365 * DAY).toISOString());
  return (Array.isArray(list) ? list : []).map(x => {
    const ev = [...(x.events || [])].sort((a, b) => day(b.date).localeCompare(day(a.date)));
    const cur = ev[0]; if (!cur) return null;
    return {
      isin: x.isin, navn: x.issuerName, pst: Number(cur.shortPercent) || 0, d: day(cur.date),
      eiere: (cur.activePositions || []).map(p => [String(p.positionHolder || '').trim(), Number(p.shortPercent) || 0, day(p.date)]).filter(p => p[0]).sort((a, b) => b[1] - a[1]),
      serie: ev.filter(e => day(e.date) >= cut).slice(0, 80).map(e => [day(e.date), Number(e.shortPercent) || 0]).reverse(),
    };
  }).filter(Boolean).sort((a, b) => b.pst - a.pst);
}

export async function fetchShort({ warnings = [] } = {}) {
  const file = path.join(config.dataDir, 'short-cache.json');
  let cache = null; try { cache = JSON.parse(await fs.readFile(file, 'utf8')); } catch { }
  if (cache && Date.now() - cache.t < 6 * 3600e3) return cache.d;
  try {
    const d = { liste: summarizeShort(await getJson(`${API}/api/v2/instruments`)), hentet: new Date().toISOString(), url: 'https://ssr.finanstilsynet.no/' };
    await fs.mkdir(config.dataDir, { recursive: true });
    await fs.writeFile(file, JSON.stringify({ t: Date.now(), d }));
    return d;
  } catch (e) { warnings.push('Shortregisteret feilet: ' + e.message); return cache?.d || null; }
}
