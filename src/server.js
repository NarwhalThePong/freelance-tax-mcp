#!/usr/bin/env node
// freelance-tax-mcp: stdio MCP server. MIT License.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as T from './tools.js';

const server = new McpServer({ name: 'freelance-tax-mcp', version: '1.4.0' });
const out = r => ({ content: [{ type: 'text', text: JSON.stringify(r, null, 2) }], structuredContent: r });
const wrap = fn => async a => { try { return out(await fn(a)); } catch (e) { return { isError: true, content: [{ type: 'text', text: e.message }] }; } };
const income = {
  net_profit: z.number().optional().describe('Expected 2026 net self-employment profit (Schedule C line 31), USD'),
  ytd_profit: z.number().optional().describe('Profit so far this year; annualized with months'),
  months: z.number().int().min(1).max(12).optional().describe('Months covered by ytd_profit (1-12)'),
  filing_status: z.enum(['single', 'mfj', 'mfs', 'hoh', 'qss']).optional().describe('Filing status (default single)'),
  w2_wages: z.number().min(0).optional().describe('Your W-2 wages this year'),
  spouse_w2_wages: z.number().min(0).optional().describe('Spouse W-2 wages (mfj)')
};
server.registerTool('estimate', { title: '2026 quarterly estimated tax',
  description: 'US federal 2026 estimate for a freelancer or sole proprietor: self-employment tax, income tax, safe-harbor quarterly payment and IRS due dates. Planning estimate, not tax advice.',
  inputSchema: { ...income,
    withholding: z.number().min(0).optional().describe('Federal tax withheld from W-2 pay'),
    prior_year_tax: z.number().min(0).optional().describe('2025 total tax (for the prior-year safe harbor)'),
    prior_year_agi: z.number().min(0).optional().describe('2025 AGI (over $150k uses the 110% rule)'),
    qbi: z.boolean().optional().describe('Apply the simple 20% QBI deduction (default true)'),
    state_rate_pct: z.number().min(0).max(20).optional().describe('Flat state income tax rate % for a rough state estimate') } }, wrap(T.estimate));
server.registerTool('self_employment_tax', { title: '2026 self-employment tax',
  description: '2026 self-employment tax (Schedule SE): 15.3% on 92.35% of net profit (none under $400), Social Security 12.4% up to the $184,500 wage base minus W-2 wages, Medicare 2.9% uncapped, 0.9% Additional Medicare over the filing-status threshold (split SE vs wages), the deductible half, quarterly share and effective rate. Same math as the free web calculator. Planning estimate, not tax advice.',
  inputSchema: income }, wrap(T.seTax));
server.registerTool('freelance_hourly_rate', { title: 'Freelance hourly rate calculator',
  description: 'Hourly and day rate a freelancer needs to take home a target income after tax, business costs, time off, non-billable hours and a slow-month buffer; optionally checks what a given rate pays per year. Defaults match the free web calculator ($60,000 take-home, $6,000 costs, 30% tax, 6 weeks off, 40 h/week, 65% billable, 10% buffer, 8 h day).',
  inputSchema: { take_home: z.number().min(0).optional().describe('Income you want to take home per year after tax, USD (default 60000)'),
    business_costs: z.number().min(0).optional().describe('Business costs per year, USD (default 6000)'),
    tax_rate_pct: z.number().min(0).max(90).optional().describe('Estimated tax rate on profit %, default 30 (use the estimate tool for a 2026 figure)'),
    weeks_off: z.number().min(0).max(52).optional().describe('Weeks off per year (default 6)'),
    hours_per_week: z.number().min(0).max(168).optional().describe('Hours worked per week (default 40)'),
    billable_pct: z.number().min(0).max(100).optional().describe('Share of hours you can bill % (default 65)'),
    buffer_pct: z.number().min(0).max(90).optional().describe('Buffer for slow months and unpaid invoices % (default 10)'),
    day_hours: z.number().min(0).max(24).optional().describe('Billable hours in a full client day (default 8)'),
    check_rate: z.number().min(0).optional().describe('Optional: an hourly rate to check what it pays you per year') } }, wrap(T.hourlyRate));
server.registerTool('qbi_deduction', { title: '2026 QBI deduction (Section 199A)',
  description: '2026 Qualified Business Income deduction (Section 199A, Form 8995 / 8995-A) for one trade or business: 20% of QBI at or below the $201,750 threshold ($403,500 mfj), the phase-in range up to $276,750 ($553,500 mfj) with the SSTB applicable percentage and the W-2 wage / UBIA limit, the SSTB phase-out, 20% of REIT/PTP income and the overall cap of 20% of taxable income minus net capital gain. Same math as the free web calculator. Planning estimate, not tax advice.',
  inputSchema: { qbi: z.number().describe('Qualified business income from the business (e.g. Schedule C profit minus the deductible half of SE tax, SE health insurance and retirement contributions), USD'),
    taxable_income: z.number().describe('2026 taxable income BEFORE the QBI deduction, USD'),
    filing_status: z.enum(['single', 'mfj', 'mfs', 'hoh', 'qss']).optional().describe('Filing status (default single)'),
    sstb: z.boolean().optional().describe('Specified service trade or business (health, law, accounting, consulting, financial services, performing arts, athletics, etc.). Default false'),
    w2_wages: z.number().min(0).optional().describe('W-2 wages the business paid to employees'),
    ubia: z.number().min(0).optional().describe('Unadjusted basis immediately after acquisition (UBIA) of qualified property'),
    reit_ptp_income: z.number().min(0).optional().describe('Qualified REIT dividends plus qualified PTP income'),
    net_capital_gain: z.number().min(0).optional().describe('Net capital gain (including qualified dividends) for the overall cap') } }, wrap(T.qbiDeduction));
server.registerTool('due_dates', { title: 'Estimated tax due dates',
  description: 'IRS quarterly estimated tax due dates for a tax year, moved past weekends and DC legal holidays.',
  inputSchema: { year: z.number().int().min(2000).max(2100).optional().describe('Tax year (default 2026)') } }, wrap(T.dueDates));
const trip = z.object({ date: z.string().describe('YYYY-MM-DD'), miles: z.number().min(0), purpose: z.enum(['business', 'medical', 'moving', 'charity']).optional() });
server.registerTool('mileage', { title: 'IRS mileage deduction',
  description: 'Standard mileage deduction priced by the date each mile was driven (2026 business rate 72.5 cents Jan-Jun, 76 cents from Jul 1). Pass trips, or 2026 split totals such as business_jan_jun and business_jul_dec.',
  inputSchema: { trips: z.array(trip).max(5000).optional().describe('Trip log'),
    business_jan_jun: z.number().min(0).optional(), business_jul_dec: z.number().min(0).optional(),
    medical_jan_jun: z.number().min(0).optional(), medical_jul_dec: z.number().min(0).optional(),
    moving_jan_jun: z.number().min(0).optional(), moving_jul_dec: z.number().min(0).optional(),
    charity_jan_jun: z.number().min(0).optional(), charity_jul_dec: z.number().min(0).optional(),
    parking_tolls: z.number().min(0).optional().describe('Business parking and tolls, added on top') } }, wrap(T.mileage));
server.registerTool('mileage_rates', { title: 'IRS mileage rates', description: 'IRS standard mileage rates by period with official sources.', inputSchema: {} }, wrap(T.mileageRates));
const n = d => z.number().min(0).optional().describe(d);
server.registerTool('home_office', { title: 'Home office deduction',
  description: 'Home office deduction: simplified ($5/sq ft, up to 300 sq ft) vs regular Form 8829 method, with the business income limit and carryovers. Give home_sqft and costs to compare both.',
  inputSchema: { office_sqft: z.number().min(0).describe('Office area in sq ft (regular and exclusive business use)'),
    method: z.enum(['compare', 'simplified', 'regular']).optional(), home_sqft: n('Whole home area in sq ft'), months: n('Months used this year (default 12)'),
    gross_income: n('Gross income from the business use of the home'), other_expenses: n('Other business expenses not tied to the home'),
    mortgage_interest: n('Home mortgage interest for the year'), real_estate_taxes: n('Real estate taxes'), rent: n('Rent'), insurance: n('Homeowner or renter insurance'),
    utilities: n('Utilities'), repairs: n('Repairs and maintenance'), other_home: n('Other whole-home costs'), direct: n('Costs only for the office'),
    prior_operating: n('Carryover of operating costs from last year'), basis: n('Home basis for depreciation (building only, not land)'),
    first_month: n('Month the office was first used (1-12) if this is the first year'), prior_depreciation: n('Depreciation carryover from last year') } }, wrap(T.homeOffice));
server.registerTool('retirement_contribution', { title: '2026 SEP IRA vs Solo 401(k) max contribution',
  description: 'Most a sole proprietor or single-member LLC owner can put into a SEP IRA vs a Solo 401(k) for 2026 (IRS Pub. 560 rate worksheet, 2026 limits: $72,000 total, $24,500 deferral, $8,000 catch-up at 50+, $11,250 at 60-63), plus estimated income tax saved. Planning estimate, not tax or investment advice.',
  inputSchema: { net_profit: z.number().min(0).describe('2026 net self-employment profit (Schedule C line 31), USD'),
    age_group: z.enum(['under50', '50plus', '60to63']).optional().describe('Age at the end of 2026 (default under50)'),
    w2_wages: z.number().min(0).optional().describe('W-2 wages from another job (uses up the Social Security wage base)'),
    other_deferrals: z.number().min(0).optional().describe('401(k)/403(b) employee deferrals already made at another job this year'),
    plan_rate: z.number().min(0).max(25).optional().describe('Employer contribution rate % in the plan (default 25)'),
    bracket: z.number().min(0).max(37).optional().describe('Marginal federal income tax bracket % for the tax-saved estimate (default 22)') } }, wrap(T.retirement));
const place = {
  zip: z.string().optional().describe('5-digit ZIP code of where you stay (most reliable)'),
  city: z.string().optional().describe('City (with state) if no ZIP'),
  state: z.string().optional().describe('2-letter state code, e.g. NY'),
  area_index: z.number().int().min(0).optional().describe('Pick one area when a ZIP or city matches several (see alternatives)')
};
const dates = { start: z.string().describe('First travel day, YYYY-MM-DD (Oct 1, 2025 to Sep 30, 2027)'), end: z.string().describe('Last travel day, YYYY-MM-DD') };
server.registerTool('per_diem_rates', { title: 'GSA per diem rates (lodging + M&IE)',
  description: 'Official GSA CONUS per diem rates for FY2026 and FY2027 by ZIP, city or state: lodging maximum by month and the meals and incidentals (M&IE) breakdown. 48 states + DC.',
  inputSchema: { ...place, fiscal_year: z.number().int().min(2026).max(2027).optional().describe('Federal fiscal year (Oct 1 to Sep 30), default current'),
    date: z.string().optional().describe('YYYY-MM-DD to get the lodging rate for that day') } }, wrap(T.perDiemRates));
server.registerTool('per_diem_trip', { title: 'Per diem trip total (employer / federal travel)',
  description: 'Maximum per diem for a trip under GSA/FTR rules: lodging per night by month, M&IE with 75% on the first and last day, minus provided meals at the GSA breakdown amounts.',
  inputSchema: { ...place, ...dates,
    breakfasts_provided: z.number().int().min(0).optional(), lunches_provided: z.number().int().min(0).optional(), dinners_provided: z.number().int().min(0).optional(),
    no_lodging: z.boolean().optional().describe('Day trip or no lodging claimed') } }, wrap(T.perDiemTrip));
server.registerTool('meal_deduction', { title: 'Self-employed per diem meal deduction (IRS standard meal allowance)',
  description: 'Meal deduction for a self-employed business trip using the federal M&IE rate instead of receipts (IRS Pub. 463): 3/4 on travel days (or full), times the deductible share (50%, or 80% for DOT hours-of-service workers). Planning estimate, not tax advice.',
  inputSchema: { ...place, ...dates,
    method: z.enum(['three-quarters', 'full']).optional().describe('Travel-day rule (default three-quarters)'),
    percent: z.union([z.literal(50), z.literal(80), z.literal(100)]).optional().describe('Deductible share % (default 50)') } }, wrap(T.mealDeduction));
server.registerTool('mie_breakdown', { title: 'GSA M&IE breakdown tiers',
  description: 'GSA meals and incidentals tiers (breakfast, lunch, dinner, incidentals, first/last day) for a fiscal year.',
  inputSchema: { fiscal_year: z.number().int().min(2026).max(2027).optional() } }, wrap(T.mieBreakdown));
server.registerTool('tax_figures', { title: '2026 tax figures and sources', description: '2026 brackets, standard deductions, SE tax figures and official IRS/SSA sources used.', inputSchema: {} }, wrap(T.figures));

await server.connect(new StdioServerTransport());
