// Tool logic: calls the US Freelancer Tax API handler in-process (no network, no API key).
import { handle } from './lib/index.js';

async function call(path, args) {
  const res = await handle(new Request('https://local' + path, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(Object.fromEntries(Object.entries(args || {}).filter(([, v]) => v !== undefined))) }));
  const body = await res.json();
  if (res.status !== 200) { const e = new Error(body.error || 'Request failed'); e.status = res.status; throw e; }
  return body;
}

export const estimate = a => call('/v1/estimate', a);
export const seTax = a => call('/v1/se-tax', a);
export const dueDates = a => call('/v1/due-dates', a);
export const mileage = a => call('/v1/mileage', a);
export const mileageRates = () => call('/v1/mileage/rates', {});
export const homeOffice = a => call('/v1/home-office', a);
export const retirement = a => call('/v1/retirement', a);
export const figures = () => call('/v1/figures', {});

// GSA per diem (US Per Diem API core, in-process) and the self-employed IRS standard meal allowance.
import { handle as pdHandle } from './lib/perdiem/index.js';
async function pd(path, args) {
  const res = await pdHandle(new Request('https://local' + path, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(Object.fromEntries(Object.entries(args || {}).filter(([, v]) => v !== undefined))) }));
  const body = await res.json();
  if (res.status !== 200) { const e = new Error(body.error || 'Request failed'); e.status = res.status; throw e; }
  return body;
}
const r2 = n => Math.round(n * 100) / 100;
export const perDiemRates = a => pd('/v1/rates', a);
export const perDiemTrip = a => pd('/v1/trip', a);
export const mieBreakdown = a => pd('/v1/mie', a);
// IRS Pub. 463: self-employed people may use the federal M&IE rate (standard meal allowance) instead of actual meal costs.
// Travel days: 3/4 of M&IE (or the full rate under method "full"); deductible share 50% (80% for DOT hours-of-service workers).
// Lodging cannot use the per diem for the self-employed: deduct actual cost (GSA lodging is shown only as a reference).
export async function mealDeduction(a = {}) {
  const pct = a.percent == null ? 50 : Number(a.percent);
  if (![50, 80, 100].includes(pct)) throw new Error('"percent" must be 50, 80 or 100');
  const method = a.method || 'three-quarters';
  if (!['three-quarters', 'full'].includes(method)) throw new Error('"method" must be "three-quarters" or "full"');
  const { percent, method: _m, ...rest } = a;
  const t = await pd('/v1/trip', rest);
  const days = t.days_detail.map(d => {
    const mie = method === 'full' ? d.mie_rate : d.mie_base;
    return { date: d.date, fiscal_year: d.fiscal_year, area: d.area, mie_rate: d.mie_rate, travel_day_share: mie === d.mie_rate ? 1 : 0.75, mie,
      deductible: r2(mie * pct / 100), gsa_lodging_reference: d.lodging };
  });
  const mie = r2(days.reduce((s, d) => s + d.mie, 0));
  const out = { start: t.start, end: t.end, days: t.days, area: t.area, method, percent: pct,
    totals: { standard_meal_allowance: mie, deductible: r2(mie * pct / 100), gsa_lodging_reference: r2(days.reduce((s, d) => s + d.gsa_lodging_reference, 0)) },
    days_detail: days,
    rules: ['Self-employed travelers away from their tax home overnight may deduct meals with the federal M&IE rate (IRS Pub. 463, standard meal allowance) instead of keeping meal receipts.',
      method === 'full' ? 'Method "full": the full M&IE rate on the first and last travel day.' : 'First and last travel day: 3/4 of the M&IE rate (the IRS also allows any reasonable method consistently applied).',
      `Deductible share: ${pct}% (50% for most business meals; 80% for workers subject to DOT hours-of-service limits).`,
      'The self-employed must deduct actual lodging costs; the GSA lodging maximum is a reference only.'],
    sources: ['https://www.irs.gov/publications/p463', ...t.sources] };
  if (t.note) out.note = t.note; if (t.alternatives) out.alternatives = t.alternatives;
  return out;
}
