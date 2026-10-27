// Grid tests: the MCP tools must agree with the calculation cores copied from the LIVE web pages (fixtures fetched 2026-10-27).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from '../src/tools.js';

const fx = f => readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8');
const PAGE_SE = new Function(fx('live-se-tax-page-core.js.txt') + '\nreturn SETAX;')();
const PAGE_HR = new Function(fx('live-hourly-page-core.js.txt') + '\nreturn { need, check, hours };')();
const r2 = x => Math.round(x * 100) / 100;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= 0.011, `${msg}: ${a} vs ${b}`);

test('self_employment_tax matches the live SE tax page over a grid', async () => {
  const profits = [0, -5000, 300, 433, 434, 1000, 25000, 50000, 80000, 150000, 199786, 200000, 250000, 400000, 1000000];
  const w2s = [0, 30000, 120000, 184500, 250000];
  const statuses = ['single', 'mfj', 'mfs', 'hoh', 'qss'];
  let n = 0;
  for (const profit of profits) for (const w2 of w2s) for (const st of statuses) {
    const spouse = st === 'mfj' ? 60000 : 0;
    const m = await T.seTax({ net_profit: profit, w2_wages: w2, spouse_w2_wages: spouse, filing_status: st });
    const p = PAGE_SE.compute({ netProfit: profit, w2Wages: w2, spouseW2: spouse, status: st });
    const k = `${profit}/${w2}/${st}`;
    near(m.net_earnings_from_self_employment, p.netEarnings, k + ' ne');
    near(m.social_security, p.socialSecurity, k + ' ss'); near(m.medicare, p.medicare, k + ' med');
    near(m.self_employment_tax, p.seTax, k + ' se'); near(m.deductible_half, p.deductibleHalf, k + ' half');
    near(m.additional_medicare_tax, p.addMedicare, k + ' add');
    near(m.additional_medicare_on_se_income, p.addMedicareSE, k + ' addS'); near(m.additional_medicare_on_wages, p.addMedicareWages, k + ' addW');
    near(m.total_with_additional_medicare_on_se, p.totalSE, k + ' total'); near(m.quarterly_se_tax, p.quarterly, k + ' q');
    near(m.effective_rate_pct_of_profit, p.effectiveRate, k + ' eff');
    assert.equal(m.below_400_minimum, p.belowMinimum, k + ' below');
    n++;
  }
  assert.equal(n, 375);
});

test('self_employment_tax hand-checked 2026 cases', async () => {
  const a = await T.seTax({ net_profit: 100000 });
  assert.equal(a.self_employment_tax, r2(100000 * 0.9235 * 0.153)); // 14129.55
  assert.equal(a.deductible_half, r2(a.self_employment_tax / 2));
  const b = await T.seTax({ net_profit: 300000 }); // SS capped at 184,500
  assert.equal(b.social_security, r2(184500 * 0.124));
  assert.equal(b.medicare, r2(300000 * 0.9235 * 0.029));
  assert.equal(b.additional_medicare_on_se_income, r2((300000 * 0.9235 - 200000) * 0.009));
  const c = await T.seTax({ net_profit: 100000, w2_wages: 184500 }); // wage base used up by W-2
  assert.equal(c.social_security, 0);
  const d = await T.seTax({ net_profit: 433 }); assert.equal(d.self_employment_tax, 0); assert.equal(d.below_400_minimum, true);
  const e = await T.seTax({ ytd_profit: 30000, months: 6 }); assert.equal(e.net_earnings_from_self_employment, r2(60000 * 0.9235));
  await assert.rejects(T.seTax({}), /required/);
});

test('freelance_hourly_rate matches the live hourly rate page over a grid', async () => {
  const cents = x => x === null ? null : Math.ceil(x * 100 - 1e-7) / 100;
  let n = 0;
  for (const take of [0, 40000, 60000, 120000]) for (const tax of [0, 25, 30, 90]) for (const off of [0, 6, 52])
    for (const bill of [0, 50, 65, 100]) for (const buf of [0, 10]) {
      const a = { take_home: take, business_costs: 6000, tax_rate_pct: tax, weeks_off: off, hours_per_week: 40, billable_pct: bill, buffer_pct: buf, day_hours: 8, check_rate: 75 };
      const o = { take, exp: 6000, tax, off, hpw: 40, bill, buf, day: 8 };
      const m = await T.hourlyRate(a), p = PAGE_HR.need(o), c = PAGE_HR.check(o, 75);
      assert.equal(m.needed.hourly_rate, cents(p.rate)); assert.equal(m.needed.day_rate, cents(p.day));
      near(m.needed.revenue_per_year, p.rev, 'rev'); near(m.needed.profit_before_tax, p.pre, 'pre');
      assert.equal(m.needed.billable_hours_per_year, r2(p.hours)); near(m.needed.tax_set_aside_per_year, p.taxAmt, 'tax');
      near(m.check.take_home_per_year, c.take, 'take'); near(m.check.revenue_after_buffer, c.rev, 'crev');
      assert.equal(m.check.take_home_per_hour_worked, c.perHr === null ? null : r2(c.perHr));
      n++;
    }
  assert.equal(n, 384);
  const d = await T.hourlyRate({}); // page defaults
  assert.equal(d.needed.hourly_rate, 85.21); assert.equal(d.needed.billable_hours_per_year, 1196);
  assert.match(d.note, /\$85\.21 an hour to take home \$60,000\.00/);
});
