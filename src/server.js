#!/usr/bin/env node
// freelance-tax-mcp: stdio MCP server. MIT License.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as T from './tools.js';

const server = new McpServer({ name: 'freelance-tax-mcp', version: '1.1.0' });
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
  description: 'Social Security and Medicare (SE) tax on 2026 net self-employment profit, the deductible half and Additional Medicare Tax.',
  inputSchema: income }, wrap(T.seTax));
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
server.registerTool('tax_figures', { title: '2026 tax figures and sources', description: '2026 brackets, standard deductions, SE tax figures and official IRS/SSA sources used.', inputSchema: {} }, wrap(T.figures));

await server.connect(new StdioServerTransport());
