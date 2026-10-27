// US Per Diem API: Cloudflare Worker. GSA CONUS per diem rates (lodging + M&IE) by ZIP or city, and trip totals with the
// 75% first/last-day M&IE rule and provided-meal deductions. Data bundled from GSA (public domain), FY2026 and FY2027.
import { DATA, DATA_FETCHED } from './data.js';

const API_VERSION = '1.0.0';
const MAX_DAYS = 366, MAX_BATCH = 50;
const SOURCES = {
  rates: 'https://www.gsa.gov/travel/plan-book/per-diem-rates',
  mie: 'https://www.gsa.gov/travel/plan-book/per-diem-rates/mie-breakdown',
  api: 'https://open.gsa.gov/api/perdiem/',
  ftr_first_last_day: 'https://www.ecfr.gov/current/title-41/subtitle-F/chapter-301/subchapter-B/part-301-11/subpart-B/section-301-11.101',
  ftr_meal_deduction: 'https://www.ecfr.gov/current/title-41/subtitle-F/chapter-301/subchapter-B/part-301-11/subpart-B/section-301-11.18'
};
const FYS = Object.keys(DATA).map(Number).sort();
const STATES = new Set(); for (const fy of FYS) for (const k of Object.keys(DATA[fy].dest)) STATES.add(k.split(':')[0]);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

class Bad extends Error { constructor(m, s, extra) { super(m); this.status = s || 400; this.extra = extra; } }
const r2 = n => Math.round(n * 100) / 100;
function json(body, status, extra) {
  return new Response(JSON.stringify(body, null, 2), { status: status || 200,
    headers: Object.assign({ 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' }, extra || {}) });
}

// ---------- data access ----------
const zipIndex = {};
function zipsFor(fy) {
  if (zipIndex[fy]) return zipIndex[fy];
  const m = new Map();
  for (const [k, s] of Object.entries(DATA[fy].zips)) for (let i = 0; i < s.length; i += 5) {
    const z = s.slice(i, i + 5); const a = m.get(z); if (a) a.push(k); else m.set(z, [k]);
  }
  return (zipIndex[fy] = m);
}
const lodgingFor = (d, month) => (Array.isArray(d[3]) ? d[3][month - 1] : d[3]);
function tier(fy, total) {
  const t = DATA[fy].mie.find(x => x[0] === total);
  return { total: t[0], breakfast: t[1], lunch: t[2], dinner: t[3], incidentals: t[4], first_last_day: t[5] };
}
function destObj(fy, key) {
  const d = DATA[fy].dest[key]; const [state, did] = key.split(':');
  const monthly = MONTHS.map((m, i) => lodgingFor(d, i + 1));
  const min = Math.min(...monthly), max = Math.max(...monthly);
  return { id: `${fy}-${state}-${did}`, fiscal_year: fy, state, destination_id: Number(did), city: d[0], county: d[1] || null,
    standard_rate: did === '0', lodging_seasonal: min !== max, lodging_min: min, lodging_max: max,
    lodging_by_month: Object.fromEntries(MONTHS.map((m, i) => [m, monthly[i]])), mie: tier(fy, d[2]) };
}
function standardKey(fy, state) { return DATA[fy].dest[`${state}:0`] ? `${state}:0` : null; }

// ---------- input parsing ----------
function fyOf(o) {
  if (o.fy !== undefined && o.fy !== '') {
    const fy = Number(o.fy);
    if (!FYS.includes(fy)) throw new Bad(`"fy" must be one of: ${FYS.join(', ')} (federal fiscal year, Oct 1 to Sep 30)`);
    return fy;
  }
  if (o.date) return fyOfDate(parseDate(o.date, 'date'));
  const t = new Date(); return fyOfDate({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }, true);
}
function fyOfDate(dt, clamp) {
  const fy = dt.m >= 10 ? dt.y + 1 : dt.y;
  if (!FYS.includes(fy)) {
    if (clamp) return Math.min(Math.max(fy, FYS[0]), FYS[FYS.length - 1]);
    throw new Bad(`Date ${fmt(dt)} is in FY${fy}; this API covers FY${FYS[0]} (Oct 1, ${FYS[0] - 1}) to FY${FYS[FYS.length - 1]} (Sep 30, ${FYS[FYS.length - 1]})`);
  }
  return fy;
}
function parseDate(s, name) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) throw new Bad(`"${name}" must be a date in YYYY-MM-DD format`);
  const dt = { y: +m[1], m: +m[2], d: +m[3] }; const t = new Date(Date.UTC(dt.y, dt.m - 1, dt.d));
  if (t.getUTCMonth() !== dt.m - 1 || t.getUTCDate() !== dt.d) throw new Bad(`"${name}" is not a real date`);
  return dt;
}
const fmt = dt => `${dt.y}-${String(dt.m).padStart(2, '0')}-${String(dt.d).padStart(2, '0')}`;
const toNum = dt => Date.UTC(dt.y, dt.m - 1, dt.d) / 864e5;
const fromNum = n => { const t = new Date(n * 864e5); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
function stateOf(o) {
  const s = String(o.state || '').trim().toUpperCase();
  if (!STATES.has(s)) throw new Bad('"state" must be a 2-letter code of the 48 contiguous states or DC (CONUS)');
  return s;
}
function zipOf(o) {
  const z = String(o.zip || '').trim().slice(0, 5);
  if (!/^\d{5}$/.test(z)) throw new Bad('"zip" must be a 5-digit US ZIP code');
  return z;
}
function intOpt(o, k, max) {
  const v = o[k]; if (v === undefined || v === null || v === '') return 0;
  const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > max) throw new Bad(`"${k}" must be a whole number from 0 to ${max}`);
  return n;
}
function bool(o, k) {
  const v = o[k]; if (v === undefined || v === null || v === '') return false;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase(); if (['true', '1', 'yes'].includes(s)) return true; if (['false', '0', 'no'].includes(s)) return false;
  throw new Bad(`"${k}" must be true or false`);
}
const norm = s => String(s || '').toLowerCase().replace(/^st\.?\s+/, 'saint ').replace(/[^a-z0-9]+/g, ' ').trim();

// Resolve a location for one fiscal year. Returns { keys, match, note }.
function resolve(o, fy) {
  if (o.zip !== undefined && o.zip !== '') {
    const z = zipOf(o); const keys = zipsFor(fy).get(z);
    if (!keys) throw new Bad(`ZIP ${z} is not in GSA's CONUS ZIP list for FY${fy} (Alaska, Hawaii and territories are OCONUS and not covered)`, 404);
    const ns = keys.filter(k => !k.endsWith(':0'));
    const ordered = ns.concat(keys.filter(k => k.endsWith(':0')));
    return { keys: ordered, match: 'zip', note: keys.length > 1
      ? `ZIP ${z} spans more than one per diem area. The rate depends on the city or county you actually stay in; the first result is the non-standard area.` : undefined };
  }
  if (o.city !== undefined && o.city !== '') {
    const st = stateOf(o), c = norm(o.city); const all = Object.keys(DATA[fy].dest).filter(k => k.startsWith(st + ':'));
    let hit = all.filter(k => norm(DATA[fy].dest[k][0]).split(' or ').includes(c) || norm(DATA[fy].dest[k][0]) === c);
    let match = 'city';
    if (!hit.length) { hit = all.filter(k => !k.endsWith(':0') && (` ${norm(DATA[fy].dest[k][0])} ${norm(DATA[fy].dest[k][1])} `).includes(` ${c} `)); match = 'city_in_area'; }
    if (!hit.length) {
      const sk = standardKey(fy, st);
      if (!sk) throw new Bad(`No standard rate row for ${st}`, 404);
      return { keys: [sk], match: 'standard_rate', note: `${o.city}, ${st} is not a named per diem area, so the standard CONUS rate applies, unless the place lies in a county listed for another area. Use the ZIP for the most reliable match.` };
    }
    return { keys: hit, match };
  }
  if (o.state !== undefined && o.state !== '') {
    const st = stateOf(o); return { keys: Object.keys(DATA[fy].dest).filter(k => k.startsWith(st + ':')), match: 'state' };
  }
  throw new Bad('Give a "zip", or a "city" and "state", or just a "state" to list its areas');
}

// ---------- endpoints ----------
function meta() {
  return { version: API_VERSION, fiscal_years: FYS.map(fy => ({ fiscal_year: fy, starts: `${fy - 1}-10-01`, ends: `${fy}-09-30`,
      destinations: Object.keys(DATA[fy].dest).length, standard_lodging: DATA[fy].dest['NY:0'][3], standard_mie: DATA[fy].dest['NY:0'][2] })),
    coverage: 'CONUS: the 48 contiguous states and DC. Not covered: Alaska, Hawaii, US territories and foreign (OCONUS) rates.',
    data_fetched: DATA_FETCHED, sources: SOURCES };
}
function rates(o) {
  const fy = fyOf(o); const r = resolve(o, fy);
  const out = { fiscal_year: fy, match: r.match, results: r.keys.map(k => destObj(fy, k)) };
  if (o.date) { const dt = parseDate(o.date, 'date'); out.date = fmt(dt); out.results.forEach(x => { x.lodging_on_date = x.lodging_by_month[MONTHS[dt.m - 1]]; x.mie_on_date = x.mie.total; }); }
  if (r.note) out.note = r.note;
  out.source = SOURCES.rates;
  return out;
}
function mie(o) {
  const fy = fyOf(o);
  return { fiscal_year: fy, tiers: DATA[fy].mie.map(t => tier(fy, t[0])),
    note: 'first_last_day is 75% of the M&IE total, used for the day travel starts and the day it ends.', source: SOURCES.mie };
}
function trip(o) {
  const s = parseDate(o.start, 'start'), e = parseDate(o.end, 'end');
  const a = toNum(s), b = toNum(e);
  if (b < a) throw new Bad('"end" must be on or after "start"');
  const days = b - a + 1; if (days > MAX_DAYS) throw new Bad(`Trips are limited to ${MAX_DAYS} days`);
  fyOfDate(s); fyOfDate(e);
  const bp = intOpt(o, 'breakfasts_provided', days), lp = intOpt(o, 'lunches_provided', days), dp = intOpt(o, 'dinners_provided', days);
  const noLodging = bool(o, 'no_lodging');
  const pick = Number.isInteger(Number(o.area_index)) ? Number(o.area_index) : 0;
  let chosen = null, note, alternatives;
  const lines = [];
  let remB = bp, remL = lp, remD = dp;
  for (let n = a; n <= b; n++) {
    const dt = fromNum(n), fy = fyOfDate(dt); const r = resolve(o, fy);
    if (pick < 0 || pick >= r.keys.length) throw new Bad(`"area_index" must be from 0 to ${r.keys.length - 1}`);
    const key = r.keys[pick], d = DATA[fy].dest[key], t = tier(fy, d[2]);
    if (!chosen) { chosen = { fy, key }; note = r.note; if (r.keys.length > 1) alternatives = r.keys.map((k, i) => ({ area_index: i, city: DATA[fy].dest[k][0], county: DATA[fy].dest[k][1] || null })); }
    const firstOrLast = (n === a || n === b);
    const base = firstOrLast ? t.first_last_day : t.total;
    let ded = 0; const used = [];
    if (remB > 0) { ded += t.breakfast; remB--; used.push('breakfast'); }
    if (remL > 0) { ded += t.lunch; remL--; used.push('lunch'); }
    if (remD > 0) { ded += t.dinner; remD--; used.push('dinner'); }
    const m = r2(Math.max(0, base - ded));
    const lodging = (n < b && !noLodging) ? lodgingFor(d, dt.m) : 0;
    lines.push({ date: fmt(dt), fiscal_year: fy, area: d[0], mie_rate: t.total, mie_base: base, meals_provided: used, meal_deduction: ded, mie: m,
      lodging_night: n < b, lodging, total: r2(m + lodging) });
  }
  const sum = k => r2(lines.reduce((x, l) => x + l[k], 0));
  const d0 = destObj(chosen.fy, chosen.key);
  const out = { start: fmt(s), end: fmt(e), days, nights: noLodging ? 0 : days - 1,
    area: { city: d0.city, county: d0.county, state: d0.state, standard_rate: d0.standard_rate },
    totals: { lodging_max: sum('lodging'), mie: sum('mie'), meal_deductions: sum('meal_deduction'), per_diem_max: sum('total') },
    days_detail: lines,
    rules: [days === 1 ? 'One-day trip: 75% of M&IE. Under the FTR no per diem is paid for travel of 12 hours or less; agencies and employers set their own policy.' :
      'First and last travel days get 75% of the M&IE rate; full days in between get 100%.',
      'Lodging is the maximum allowed per night (taxes extra), using the rate for the month of each night.',
      'Provided meals are deducted at the GSA M&IE breakdown amount, one per day starting on day 1, never below $0 per day.'],
    sources: [SOURCES.rates, SOURCES.mie, SOURCES.ftr_first_last_day, SOURCES.ftr_meal_deduction] };
  if (note) out.note = note; if (alternatives) out.alternatives = alternatives;
  return out;
}
function batch(o, fn) {
  const items = o.items;
  if (!Array.isArray(items) || !items.length) throw new Bad('"items" must be a non-empty array');
  if (items.length > MAX_BATCH) throw new Bad(`At most ${MAX_BATCH} items per batch`);
  return { count: items.length, results: items.map((it, i) => {
    try { if (!it || typeof it !== 'object') throw new Bad('item must be an object'); return Object.assign({ index: i }, fn(it)); }
    catch (e) { if (e instanceof Bad) return { index: i, error: e.message }; throw e; } }) };
}
async function params(req, url) {
  const o = Object.fromEntries(url.searchParams);
  if (req.method === 'POST') {
    let b; try { b = await req.json(); } catch { throw new Bad('Body must be JSON'); }
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Bad('Body must be a JSON object');
    Object.assign(o, b);
  }
  return o;
}

export async function handle(req, env = {}) {
  const url = new URL(req.url), path = url.pathname.replace(/\/+$/, '') || '/';
  if (req.method === 'OPTIONS') return json({}, 204, { 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': '*' });
  if (path === '/health') return json({ ok: true, version: API_VERSION });
  if (env.RAPIDAPI_PROXY_SECRET && req.headers.get('x-rapidapi-proxy-secret') !== env.RAPIDAPI_PROXY_SECRET)
    return json({ error: 'Unauthorized: call this API through RapidAPI' }, 401);
  if (!['GET', 'POST'].includes(req.method)) return json({ error: 'Method not allowed' }, 405);
  try {
    const o = await params(req, url);
    switch (path) {
      case '/v1/meta': return json(meta());
      case '/v1/rates': return json(rates(o));
      case '/v1/mie': return json(mie(o));
      case '/v1/trip': return json(trip(o));
      case '/v1/trip/batch': if (req.method !== 'POST') throw new Bad('Use POST', 405); return json(batch(o, trip));
      default: return json({ error: 'Not found', endpoints: ['/v1/meta', '/v1/rates', '/v1/mie', '/v1/trip', '/v1/trip/batch', '/health'] }, 404);
    }
  } catch (e) {
    if (e instanceof Bad) return json({ error: e.message }, e.status);
    return json({ error: 'Internal error' }, 500);
  }
}
export default { fetch: (req, env) => handle(req, env) };
