// Tool logic: calls the US Freelancer Tax API handler in-process (no network, no API key).
import { handle } from './lib/index.js';

const r2 = n => Math.round(n * 100) / 100;
async function call(path, args) {
  const res = await handle(new Request('https://local' + path, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(Object.fromEntries(Object.entries(args || {}).filter(([, v]) => v !== undefined))) }));
  const body = await res.json();
  if (res.status !== 200) { const e = new Error(body.error || 'Request failed'); e.status = res.status; throw e; }
  return body;
}

export const estimate = a => call('/v1/estimate', a);
// self_employment_tax: the API result plus the page-parity breakdown from the live SE tax calculator page core.
import SETAX from './lib/setax.js';
import * as HR from './lib/hourly.js';
export const SE_PAGE = 'https://narwhalthepong.github.io/gumroad-license-check/self-employment-tax-calculator';
export const HOURLY_PAGE = 'https://narwhalthepong.github.io/gumroad-license-check/freelance-hourly-rate-calculator';
export async function seTax(a = {}) {
  const base = await call('/v1/se-tax', a); // validates input and returns the core figures
  const profit = a.ytd_profit !== undefined ? Number(a.ytd_profit) * 12 / Number(a.months) : Number(a.net_profit);
  const p = SETAX.compute({ netProfit: profit, w2Wages: a.w2_wages || 0, spouseW2: a.spouse_w2_wages || 0, status: base.filing_status });
  return { ...base,
    below_400_minimum: p.belowMinimum,
    social_security_wage_base: SETAX.LIMITS.ssBase, social_security_wage_base_left: p.ssRoom, social_security_earnings: p.ssEarnings,
    additional_medicare_threshold: p.threshold, additional_medicare_threshold_left_after_wages: p.thresholdLeft,
    additional_medicare_on_se_income: p.addMedicareSE, additional_medicare_on_wages: p.addMedicareWages,
    total_with_additional_medicare_on_se: p.totalSE, quarterly_se_tax: p.quarterly, quarterly_with_additional_medicare: p.quarterlyWithAdd,
    effective_rate_pct_of_profit: p.effectiveRate,
    formula: ['net SE earnings = net profit x 92.35% (none if under $400)', 'Social Security = 12.4% x min(net SE earnings, $184,500 - W-2 Social Security wages)',
      'Medicare = 2.9% x net SE earnings (no cap)', 'Additional Medicare = 0.9% x net SE earnings over (threshold - W-2 Medicare wages); threshold $200,000 single/hoh/qss, $250,000 mfj, $125,000 mfs',
      'deductible half = (Social Security + Medicare) / 2 (Schedule 1 line 15)'],
    calculator_page: SE_PAGE };
}

// freelance_hourly_rate: same math as the live freelance hourly rate calculator page.
const usd = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cents = n => n === null ? null : Math.ceil(n * 100 - 1e-7) / 100;
export async function hourlyRate(a = {}) {
  const d = (k, v) => a[k] === undefined ? v : Number(a[k]);
  const o = { take: d('take_home', 60000), exp: d('business_costs', 6000), tax: d('tax_rate_pct', 30), off: d('weeks_off', 6),
    hpw: d('hours_per_week', 40), bill: d('billable_pct', 65), buf: d('buffer_pct', 10), day: d('day_hours', 8) };
  for (const [k, v] of Object.entries(o)) if (!Number.isFinite(v) || v < 0) throw new Error(`"${k}" must be a number >= 0`);
  const n = HR.need(o), h = HR.hours(o);
  const out = { inputs: { take_home: o.take, business_costs: o.exp, tax_rate_pct: Math.min(o.tax, 90), weeks_off: Math.min(o.off, 52),
      hours_per_week: o.hpw, billable_pct: Math.min(o.bill, 100), buffer_pct: Math.min(o.buf, 90), day_hours: o.day },
    needed: { profit_before_tax: r2(n.pre), revenue_per_year: r2(n.rev), working_weeks: n.weeks, hours_worked_per_year: r2(h.worked),
      billable_hours_per_year: r2(n.hours), hourly_rate: cents(n.rate), day_rate: cents(n.day), revenue_per_week: n.week === null ? null : r2(n.week),
      revenue_per_month: r2(n.month), tax_set_aside_per_year: r2(n.taxAmt) },
    note: n.rate === null ? 'Enter working weeks, hours and a billable share above zero to get a rate.'
      : `Charge at least ${usd(cents(n.rate))} an hour to take home ${usd(o.take)} a year with ${Math.round(n.hours).toLocaleString('en-US')} billable hours.`,
    method: ['profit before tax = take-home / (1 - tax rate)', 'revenue = (profit before tax + business costs) / (1 - buffer)',
      'billable hours = (52 - weeks off) x hours per week x billable share', 'hourly rate = revenue / billable hours (rounded up to the cent)'],
    calculator_page: HOURLY_PAGE, currency: 'USD', disclaimer: 'Planning estimate, not tax or financial advice.' };
  if (a.check_rate !== undefined) {
    const cr = Number(a.check_rate); if (!Number.isFinite(cr) || cr < 0) throw new Error('"check_rate" must be a number >= 0');
    const c = HR.check(o, cr);
    out.check = { hourly_rate: cr, revenue_after_buffer: r2(c.rev), profit_before_tax: r2(c.pre), take_home_per_year: r2(c.take),
      take_home_per_month: r2(c.month), take_home_per_hour_worked: c.perHr === null ? null : r2(c.perHr),
      note: c.pre < 0 ? 'At this rate your costs are higher than what you collect, so you lose money before tax.'
        : 'Tax is only applied when profit is above zero. Per-hour take-home divides by every hour you work, billable or not.' };
  }
  return out;
}
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

// qbi_deduction: 2026 Section 199A QBI deduction, same math as the live QBI deduction calculator page core.
import QBI from './lib/qbi.js';
export const QBI_PAGE = 'https://narwhalthepong.github.io/gumroad-license-check/qbi-deduction-calculator';
const ZONES = { below: 'At or below the threshold (full 20%, Form 8995)', phasein: 'In the phase-in range (Form 8995-A)', above: 'At or above the upper limit (Form 8995-A)' };
export async function qbiDeduction(a = {}) {
  for (const k of ['qbi', 'taxable_income']) if (a[k] === undefined || a[k] === null) throw new Error(`"${k}" is required`);
  for (const k of ['qbi', 'taxable_income', 'w2_wages', 'ubia', 'reit_ptp_income', 'net_capital_gain'])
    if (a[k] !== undefined && !Number.isFinite(Number(a[k]))) throw new Error(`"${k}" must be a number`);
  const st = a.filing_status || 'single';
  if (!Object.prototype.hasOwnProperty.call(QBI.LIMITS.thr, st)) throw new Error('"filing_status" must be single, mfj, mfs, hoh or qss');
  const p = QBI.compute({ qbi: a.qbi, ti: a.taxable_income, status: st, sstb: a.sstb === true, w2: a.w2_wages, ubia: a.ubia, reit: a.reit_ptp_income, cg: a.net_capital_gain });
  let note;
  if (p.deduction === 0 && p.qbi === 0 && p.reitComponent === 0) note = 'No QBI deduction. Enter some qualified business income (or REIT/PTP income).';
  else if (p.deduction === 0 && p.zone === 'above' && p.sstb) note = `No QBI deduction from this SSTB. Taxable income is at or above the 2026 upper limit ($${p.upper.toLocaleString('en-US')}), so a specified service trade or business does not qualify.`;
  else if (p.deduction === 0 && p.zone !== 'below' && (p.wageLimit === 0 || p.wageLimit === null)) note = 'No QBI deduction. Above the threshold with no W-2 wages or UBIA, the wage limit is $0, so the deduction from this business is $0' + (p.reitComponent > 0 ? ' (except any REIT/PTP piece)' : '') + '.';
  else note = `2026 QBI deduction: ${usd(p.deduction)} (${p.effectiveRate}% of QBI; Form ${p.form}).`;
  return { tax_year: p.year, inputs: { qbi: p.qbi, taxable_income: p.taxableIncome, filing_status: st, sstb: p.sstb, w2_wages: Number(a.w2_wages || 0),
      ubia: Number(a.ubia || 0), reit_ptp_income: Number(a.reit_ptp_income || 0), net_capital_gain: Number(a.net_capital_gain || 0) },
    threshold: p.threshold, upper_limit: p.upper, phase_in_range: p.phaseRange, zone: p.zone, zone_description: ZONES[p.zone], form: p.form,
    sstb_applicable_pct: p.applicablePct, qbi_after_applicable_pct: p.qbiEffective, tentative_20pct_of_qbi: p.tentative,
    wage_ubia_limit: p.wageLimit, phase_in_reduction: p.reduction, qbi_component: p.qbiComponent, reit_ptp_component: p.reitComponent,
    taxable_income_cap: p.taxableIncomeCap, qbi_deduction: p.deduction, effective_rate_pct_of_qbi: p.effectiveRate, note,
    method: ['At or below the threshold ($201,750; $403,500 mfj; $201,775 mfs): 20% of QBI (Form 8995).',
      'In the phase-in range ($75,000 wide; $150,000 mfj): an SSTB keeps only the applicable percentage of QBI, W-2 wages and UBIA; the excess of 20% of QBI over the wage limit is reduced by (taxable income - threshold) / range.',
      'At or above the upper limit ($276,750; $553,500 mfj; $276,775 mfs): an SSTB gets $0; others get the lesser of 20% of QBI and the wage limit.',
      'Wage limit = greater of 50% of W-2 wages, or 25% of W-2 wages + 2.5% of UBIA of qualified property.',
      'Plus 20% of qualified REIT dividends and PTP income; total capped at 20% of (taxable income - net capital gain).',
      'Lowers income tax only, not self-employment tax. Taxable income means before the QBI deduction.'],
    sources: ['https://www.irs.gov/forms-pubs/about-form-8995', 'https://www.irs.gov/forms-pubs/about-form-8995-a', 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf'],
    calculator_page: QBI_PAGE, currency: 'USD', disclaimer: 'Planning estimate for one trade or business, not tax advice.' };
}
