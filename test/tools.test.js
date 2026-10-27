import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as T from '../src/tools.js';
import { handle } from '../src/lib/index.js';

const direct = async (path, body) => (await handle(new Request('https://x' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))).json();

test('estimate matches the API handler', async () => {
  const a = { net_profit: 80000, filing_status: 'single' };
  assert.deepEqual(await T.estimate(a), await direct('/v1/estimate', a));
  const r = await T.estimate(a);
  assert.ok(r.self_employment.self_employment_tax > 10000 && r.quarterly.due_dates.length === 4);
});
test('se tax, due dates, figures', async () => {
  const s = await T.seTax({ net_profit: 50000 });
  assert.equal(s.self_employment_tax, Math.round(50000 * 0.9235 * 0.153 * 100) / 100);
  const d = await T.dueDates({ year: 2026 });
  assert.equal(d.quarters[0].due_date, '2026-04-15');
  assert.equal((await T.figures()).tax_year, 2026);
});
test('mileage split and rates', async () => {
  const m = await T.mileage({ business_jan_jun: 1000, business_jul_dec: 1000 });
  assert.equal(m.mileage_total, 725 + 760);
  assert.ok((await T.mileageRates()).periods.length >= 2);
});
test('home office compare', async () => {
  const h = await T.homeOffice({ office_sqft: 200, home_sqft: 2000, gross_income: 50000, rent: 24000, utilities: 3000 });
  assert.equal(h.simplified.deduction, 1000);
  assert.ok(['simplified', 'regular'].includes(h.better));
});
test('errors surface', async () => { await assert.rejects(T.estimate({}), /net_profit/); });
test('stdio server lists 14 tools and answers a call', async () => {
  const c = new Client({ name: 't', version: '1' });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [new URL('../src/server.js', import.meta.url).pathname] }));
  const tools = (await c.listTools()).tools.map(t => t.name).sort();
  assert.deepEqual(tools, ['due_dates', 'estimate', 'freelance_hourly_rate', 'home_office', 'meal_deduction', 'mie_breakdown', 'mileage', 'mileage_rates', 'per_diem_rates', 'per_diem_trip', 'qbi_deduction', 'retirement_contribution', 'self_employment_tax', 'tax_figures']);
  const r = await c.callTool({ name: 'due_dates', arguments: {} });
  assert.equal(r.structuredContent.quarters.length, 4);
  const md = await c.callTool({ name: 'meal_deduction', arguments: { zip: '10001', start: '2026-11-03', end: '2026-11-06' } });
  assert.equal(md.structuredContent.totals.deductible, 161);
  const e = await c.callTool({ name: 'estimate', arguments: {} });
  assert.equal(e.isError, true);
  const h = await c.callTool({ name: 'freelance_hourly_rate', arguments: { take_home: 60000 } });
  assert.equal(h.structuredContent.needed.hourly_rate, 85.21);
  const s = await c.callTool({ name: 'self_employment_tax', arguments: { net_profit: 250000, w2_wages: 50000 } });
  assert.equal(s.structuredContent.total_with_additional_medicare_on_se, 24101.25);
  const q = await c.callTool({ name: 'qbi_deduction', arguments: { qbi: 150000, taxable_income: 240000, sstb: true, w2_wages: 40000 } });
  assert.equal(q.structuredContent.qbi_deduction, 12201);
  await c.close();
});
