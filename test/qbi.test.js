// qbi_deduction must agree with the calculation core copied from the LIVE QBI deduction calculator page (fixture fetched 2026-10-27).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from '../src/tools.js';

const PAGE = new Function(readFileSync(new URL('./fixtures/live-qbi-page-core.js.txt', import.meta.url), 'utf8') + '\nreturn QBI;')();

test('qbi_deduction matches the live QBI page over a grid', async () => {
  const qbis = [0, -10000, 50000, 150000, 400000];
  const tis = [0, 100000, 201750, 230000, 276750, 300000, 403500, 480000, 553500, 700000];
  const statuses = ['single', 'mfj', 'mfs', 'hoh'];
  const wages = [[0, 0], [20000, 0], [0, 500000], [60000, 200000]];
  let n = 0;
  for (const qbi of qbis) for (const ti of tis) for (const st of statuses) for (const sstb of [false, true]) for (const [w2, ubia] of wages) {
    const reit = n % 3 === 0 ? 5000 : 0, cg = n % 4 === 0 ? 20000 : 0;
    const m = await T.qbiDeduction({ qbi, taxable_income: ti, filing_status: st, sstb, w2_wages: w2, ubia, reit_ptp_income: reit, net_capital_gain: cg });
    const p = PAGE.compute({ qbi, ti, status: st, sstb, w2, ubia, reit, cg });
    const k = `${qbi}/${ti}/${st}/${sstb}/${w2}/${ubia}`;
    assert.equal(m.qbi_deduction, p.deduction, k + ' deduction');
    assert.equal(m.qbi_component, p.qbiComponent, k + ' qbiComp'); assert.equal(m.reit_ptp_component, p.reitComponent, k + ' reit');
    assert.equal(m.tentative_20pct_of_qbi, p.tentative, k + ' tent'); assert.equal(m.wage_ubia_limit, p.wageLimit, k + ' wl');
    assert.equal(m.phase_in_reduction, p.reduction, k + ' red'); assert.equal(m.taxable_income_cap, p.taxableIncomeCap, k + ' cap');
    assert.equal(m.sstb_applicable_pct, p.applicablePct, k + ' app'); assert.equal(m.qbi_after_applicable_pct, p.qbiEffective, k + ' qeff');
    assert.equal(m.zone, p.zone, k + ' zone'); assert.equal(m.form, p.form, k + ' form');
    assert.equal(m.threshold, p.threshold); assert.equal(m.upper_limit, p.upper);
    assert.equal(m.effective_rate_pct_of_qbi, p.effectiveRate, k + ' eff');
    n++;
  }
  assert.equal(n, 1600);
});

test('qbi_deduction hand-checked 2026 cases', async () => {
  const a = await T.qbiDeduction({ qbi: 100000, taxable_income: 150000 }); // below threshold: 20%
  assert.equal(a.qbi_deduction, 20000); assert.equal(a.form, '8995'); assert.equal(a.wage_ubia_limit, null);
  const b = await T.qbiDeduction({ qbi: 100000, taxable_income: 60000, net_capital_gain: 10000 }); // cap 20% x 50,000
  assert.equal(b.qbi_deduction, 10000);
  // SSTB in phase-in: excess 38,250 / 75,000 = 51%, applicable 49%: 20% x 73,500 = 14,700; wage limit 50% x 19,600 = 9,800; reduction 51% x 4,900 = 2,499
  const c = await T.qbiDeduction({ qbi: 150000, taxable_income: 240000, sstb: true, w2_wages: 40000 });
  assert.equal(c.sstb_applicable_pct, 49); assert.equal(c.phase_in_reduction, 2499); assert.equal(c.qbi_deduction, 12201);
  const d = await T.qbiDeduction({ qbi: 150000, taxable_income: 300000, sstb: true, w2_wages: 40000 }); // SSTB above upper limit
  assert.equal(d.qbi_deduction, 0); assert.match(d.note, /SSTB/);
  const e = await T.qbiDeduction({ qbi: 200000, taxable_income: 600000, filing_status: 'mfj', w2_wages: 30000, ubia: 400000 }); // max(15,000, 7,500+10,000)
  assert.equal(e.wage_ubia_limit, 17500); assert.equal(e.qbi_deduction, 17500);
  const f = await T.qbiDeduction({ qbi: 200000, taxable_income: 600000, filing_status: 'mfj' }); // no wages above the limit
  assert.equal(f.qbi_deduction, 0); assert.match(f.note, /wage limit is \$0/);
  const g = await T.qbiDeduction({ qbi: 100000, taxable_income: 220000, filing_status: 'single' }); // non-SSTB phase-in, no wages: 20,000 - 24.33% x 20,000
  assert.equal(g.phase_in_reduction, 4866.67); assert.equal(g.qbi_deduction, 15133.33);
  await assert.rejects(T.qbiDeduction({ qbi: 1000 }), /taxable_income/);
  await assert.rejects(T.qbiDeduction({ qbi: 1000, taxable_income: 1000, filing_status: 'xx' }), /filing_status/);
});
