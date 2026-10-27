// US Freelancer Tax API: Cloudflare Worker. 2026 US federal self-employment tax, income tax estimate,
// quarterly estimated payments (safe harbor) and IRS due dates. Planning estimates, not tax advice.
import * as C from './core.js';
import * as M from './mileage.js';
import * as H from './homeoffice.js';

const API_VERSION = '1.0.0', TAX_YEAR = 2026, MAX = 1e9, MAX_BATCH = 100;
const STATUSES = ['single', 'mfj', 'mfs', 'hoh', 'qss'];
const SOURCES = [
  { what: 'Social Security wage base 2026 ($184,500)', where: 'Social Security Administration, 2026 COLA fact sheet', url: 'https://www.ssa.gov/oact/cola/cbb.html' },
  { what: '2026 tax brackets and standard deductions', where: 'IRS Revenue Procedure 2025-32', url: 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf' },
  { what: 'Self-employment tax rates and the 92.35% factor', where: 'IRS Schedule SE / Self-employment tax page', url: 'https://www.irs.gov/businesses/small-businesses-self-employed/self-employment-tax-social-security-and-medicare-taxes' },
  { what: 'Estimated tax due dates and safe harbor', where: 'IRS Form 1040-ES (2026)', url: 'https://www.irs.gov/pub/irs-pdf/f1040es.pdf' },
  { what: 'Additional Medicare Tax thresholds', where: 'IRS Additional Medicare Tax Q&A', url: 'https://www.irs.gov/businesses/small-businesses-self-employed/questions-and-answers-for-the-additional-medicare-tax' }
];
const DISCLAIMER = 'Planning estimate of US federal tax for tax year 2026. Not tax, legal or accounting advice. Ignores credits, other income, itemized deductions and the full QBI limits.';

class Bad extends Error { constructor(m, s) { super(m); this.status = s || 400; } }
const r2 = n => (n === null ? null : Math.round(n * 100) / 100);
const day = n => C.dayStr(n);
function json(body, status, extra) {
  return new Response(JSON.stringify(body, null, 2), { status: status || 200,
    headers: Object.assign({ 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' }, extra || {}) });
}
function num(o, k, { required = false, min = 0, max = MAX, dflt } = {}) {
  const v = o[k];
  if (v === undefined || v === null || v === '') { if (required) throw new Bad(`"${k}" is required`); return dflt; }
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n)) throw new Bad(`"${k}" must be a number`);
  if (n < min || n > max) throw new Bad(`"${k}" must be between ${min} and ${max}`);
  return n;
}
function bool(o, k, dflt) {
  const v = o[k]; if (v === undefined || v === null || v === '') return dflt;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  if (['true', '1', 'yes'].includes(s)) return true;
  if (['false', '0', 'no'].includes(s)) return false;
  throw new Bad(`"${k}" must be true or false`);
}
function status(o) {
  const s = String(o.filing_status || 'single').toLowerCase();
  if (!STATUSES.includes(s)) throw new Bad('"filing_status" must be one of: ' + STATUSES.join(', '));
  return s;
}
function year(o) {
  const y = num(o, 'tax_year', { min: 2000, max: 2100, dflt: TAX_YEAR });
  if (y !== TAX_YEAR) throw new Bad(`Only tax year ${TAX_YEAR} figures are available`);
  return y;
}
// Net profit for the year: either net_profit, or ytd_profit annualized over `months` (1-12).
function profit(o) {
  if (o.net_profit !== undefined && o.net_profit !== '') return { profit: num(o, 'net_profit', { min: -MAX }), projected: false };
  if (o.ytd_profit !== undefined && o.ytd_profit !== '') {
    const m = num(o, 'months', { required: true, min: 1, max: 12 });
    if (!Number.isInteger(m)) throw new Bad('"months" must be a whole number from 1 to 12');
    return { profit: num(o, 'ytd_profit', { min: -MAX }) * 12 / m, projected: true, months: m };
  }
  throw new Bad('"net_profit" (or "ytd_profit" with "months") is required');
}
function dueList(y) {
  const d = C.dueDates(y);
  return d.q.map((q, i) => ({ quarter: 'Q' + (i + 1), statutory_date: day(q.set), due_date: day(q.due), moved: q.set !== q.due }));
}

function seTax(o) {
  year(o);
  const p = profit(o), st = status(o);
  const r = C.est({ profit: p.profit, status: st, w2: num(o, 'w2_wages', { dflt: 0 }), w2s: num(o, 'spouse_w2_wages', { dflt: 0 }), qbi: false });
  return { tax_year: TAX_YEAR, net_profit: r2(Math.max(0, p.profit)), ...(p.projected ? { projected_from_months: p.months } : {}),
    net_earnings_from_self_employment: r2(r.ne), social_security: r2(r.ss), medicare: r2(r.med), self_employment_tax: r2(r.se),
    deductible_half: r2(r.half), additional_medicare_tax: r2(r.add), filing_status: st, currency: 'USD', disclaimer: DISCLAIMER };
}

function estimate(o) {
  year(o);
  const p = profit(o), st = status(o);
  const pt = num(o, 'prior_year_tax'), pa = num(o, 'prior_year_agi');
  const inp = { profit: p.profit, status: st, w2: num(o, 'w2_wages', { dflt: 0 }), w2s: num(o, 'spouse_w2_wages', { dflt: 0 }),
    wh: num(o, 'withholding', { dflt: 0 }), qbi: bool(o, 'qbi', true), state: num(o, 'state_rate_pct', { max: 20, dflt: 0 }) };
  if (pt !== undefined) inp.ptax = pt;
  if (pa !== undefined) inp.pagi = pa;
  const r = C.est(inp);
  return {
    tax_year: TAX_YEAR, filing_status: st, net_profit_used: r2(Math.max(0, p.profit)), ...(p.projected ? { projected_from_months: p.months } : {}),
    self_employment: { net_earnings: r2(r.ne), social_security: r2(r.ss), medicare: r2(r.med), self_employment_tax: r2(r.se), deductible_half: r2(r.half) },
    additional_medicare_tax: r2(r.add),
    income_tax: { adjusted_gross_income: r2(r.agi), standard_deduction: r2(r.std), qbi_deduction: r2(r.qbi), qbi_over_threshold: !!r.qbiOver,
      taxable_income: r2(r.ti), federal_income_tax: r2(r.inc), top_bracket_pct: r.top },
    total_federal_tax: r2(r.total), withholding: r2(r.wh), federal_tax_still_owed: r2(r.owe), state_tax_estimate: r2(r.state),
    set_aside_pct_of_profit: r.setAside === null ? null : r2(r.setAside * 100),
    quarterly: { safe_harbor_required_annual: r2(r.required), safe_harbor_basis: r.basis, minimum_quarterly_payment: r2(r.qMin),
      full_quarterly_payment: r2(r.qFull), estimated_payments_required: !r.under1000, due_dates: dueList(TAX_YEAR) },
    currency: 'USD', disclaimer: DISCLAIMER
  };
}

function dueDates(o) {
  const y = num(o, 'year', { min: 2000, max: 2100, dflt: TAX_YEAR });
  if (!Number.isInteger(y)) throw new Bad('"year" must be a whole number');
  return { tax_year: y, quarters: dueList(y), note: 'Dates falling on a weekend or a Washington, DC legal holiday move to the next business day. Disaster-area postponements are not included.' };
}

const MILEAGE_SOURCES = [
  { what: 'Standard mileage rates 2025 and 2026', where: 'IRS standard mileage rates table', url: 'https://www.irs.gov/tax-professionals/standard-mileage-rates' },
  { what: 'Mid-year 2026 change: 76 cents business, 23.5 cents medical/moving for miles on or after July 1, 2026', where: 'IRS Announcement 2026-11 (IRB 2026-29)', url: 'https://www.irs.gov/irb/2026-29_irb' },
  { what: 'Who may use the standard mileage rate', where: 'IRS Topic 510, Business use of car', url: 'https://www.irs.gov/taxtopics/tc510' }
];
const MILEAGE_NOTE = 'Optional IRS standard mileage rates, priced by the date each mile was driven. The actual-expense method is the alternative. Parking and tolls are deductible on top. Not tax advice.';
function mileRates() {
  return { unit: 'cents_per_mile', periods: M.RATES.map(r => ({ from: r.from, to: r.to, label: r.label, business: r.business, medical: r.medical, moving: r.moving, charity: r.charity, source: r.source })),
    sources: MILEAGE_SOURCES, note: MILEAGE_NOTE };
}
const SPLIT_KEYS = M.PURPOSES.flatMap(p => [p + '_jan_jun', p + '_jul_dec']);
function mileage(o) {
  let res;
  try {
    if (o.trips !== undefined) {
      if (!Array.isArray(o.trips)) throw new Bad('"trips" must be an array of { date, miles, purpose }');
      if (o.trips.length > 5000) throw new Bad('at most 5000 trips per request');
      res = M.trips(o.trips);
    } else if (SPLIT_KEYS.some(k => o[k] !== undefined && o[k] !== '')) {
      const s = {}; M.PURPOSES.forEach(p => { s[p] = [num(o, p + '_jan_jun', { dflt: 0 }), num(o, p + '_jul_dec', { dflt: 0 })]; });
      res = M.split2026(s);
    } else throw new Bad('Send "trips" (POST) or 2026 split miles such as business_jan_jun and business_jul_dec');
  } catch (e) { if (e instanceof Bad) throw e; throw new Bad(e.message); }
  const extra = num(o, 'parking_tolls', { dflt: 0 });
  const b26 = res.periods.filter(p => p.from >= '2026-01-01');
  const bm = b26.reduce((s, p) => s + p.totals.business.miles, 0), ba = b26.reduce((s, p) => s + p.totals.business.amount, 0);
  return { purposes: res.purposes, periods: res.periods.map(p => ({ label: p.label, from: p.from, totals: p.totals })),
    mileage_total: res.total, parking_tolls: r2(extra), total_with_parking_tolls: r2(res.total + extra),
    business_2026_check: bm ? { miles: r2(bm), split_year_amount: r2(ba), if_all_at_76_cents: r2(bm * 0.76), overstatement_at_76_cents: r2(bm * 0.76 - ba) } : null,
    ...(o.trips !== undefined && bool(o, 'include_rows', false) ? { rows: res.rows } : {}),
    currency: 'USD', note: MILEAGE_NOTE };
}

const HO_NOTE = 'Home office deduction for a home used regularly and exclusively for business (IRS Pub. 587, Form 8829, Rev. Proc. 2013-13). Simplified: $5 per sq ft up to 300 sq ft, limited to business income. Regular: business share of home costs in Form 8829 order (mortgage interest and taxes, then operating costs, then 39-year depreciation), with carryovers. Employees cannot claim it. Planning estimate, not tax advice.';
const HO_FIELDS = { office_sqft: 'officeSqft', home_sqft: 'homeSqft', months: 'months', gross_income: 'grossIncome', other_expenses: 'otherExpenses',
  mortgage_interest: 'mortgageInterest', real_estate_taxes: 'realEstateTaxes', rent: 'rent', insurance: 'insurance', utilities: 'utilities', repairs: 'repairs',
  other_home: 'otherHome', direct: 'direct', prior_operating: 'priorOperating', basis: 'basis', first_month: 'firstMonth', prior_depreciation: 'priorDepreciation' };
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]));
function homeOffice(o) {
  const a = {};
  for (const [k, f] of Object.entries(HO_FIELDS)) { const v = num(o, k); if (v !== undefined) a[f] = v; }
  if (a.officeSqft === undefined) throw new Bad('"office_sqft" is required');
  const method = String(o.method || (a.homeSqft ? 'compare' : 'simplified')).toLowerCase();
  if (!['compare', 'simplified', 'regular'].includes(method)) throw new Bad('"method" must be compare, simplified or regular');
  let r;
  try { r = method === 'simplified' ? H.simplified(a) : method === 'regular' ? H.regular(a) : H.compare(a); }
  catch (e) { throw new Bad(e.message); }
  const out = method === 'compare' ? { simplified: snake(r.simplified), regular: snake(r.regular), better: r.better, difference: r.difference } : snake(r);
  return { method, ...out, currency: 'USD', note: HO_NOTE };
}

function batch(o, fn) {
  if (!Array.isArray(o.items)) throw new Bad('"items" must be an array');
  if (o.items.length > MAX_BATCH) throw new Bad(`at most ${MAX_BATCH} items per request`);
  return { count: o.items.length, results: o.items.map((it, i) => {
    try { return fn(Object.assign({}, it)); } catch (e) { if (e instanceof Bad) return { index: i, error: e.message }; throw e; }
  }) };
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
      case '/v1/figures': return json({ tax_year: TAX_YEAR, figures: C.DEF, sources: SOURCES, version: API_VERSION, disclaimer: DISCLAIMER });
      case '/v1/se-tax': return json(seTax(o));
      case '/v1/estimate': return json(estimate(o));
      case '/v1/due-dates': return json(dueDates(o));
      case '/v1/mileage/rates': return json(mileRates());
      case '/v1/mileage': return json(mileage(o));
      case '/v1/home-office': return json(homeOffice(o));
      case '/v1/estimate/batch': if (req.method !== 'POST') throw new Bad('Use POST', 405); return json(batch(o, estimate));
      default: return json({ error: 'Not found', endpoints: ['/v1/figures', '/v1/se-tax', '/v1/estimate', '/v1/due-dates', '/v1/estimate/batch', '/v1/mileage', '/v1/mileage/rates', '/v1/home-office', '/health'] }, 404);
    }
  } catch (e) {
    if (e instanceof Bad) return json({ error: e.message }, e.status);
    return json({ error: 'Internal error' }, 500);
  }
}
export default { fetch: (req, env) => handle(req, env) };
