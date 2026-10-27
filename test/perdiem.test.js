import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as T from '../src/tools.js';
const require = createRequire(import.meta.url);
const { DATA, PD } = require('./fixtures/live-page-perdiem.cjs'); // math + data from the live meal deduction page

test('meal deduction matches the live page example: NYC Nov 3-6 2026 = $322, 50% = $161', async () => {
  const r = await T.mealDeduction({ zip: '10001', start: '2026-11-03', end: '2026-11-06' });
  assert.equal(r.totals.standard_meal_allowance, 322);
  assert.equal(r.totals.deductible, 161);
  assert.deepEqual(r.days_detail.map(d => d.mie), [69, 92, 92, 69]);
  const p = PD.trip(DATA, { state: 'NY', city: 'New York City', county: 'Bronx / Kings / New York / Queens / Richmond', start: '2026-11-03', end: '2026-11-06' });
  assert.equal(p.totals.deductible, r.totals.deductible);
});

test('every live-page destination x 2 fiscal years x methods x shares matches the MCP tool', async () => {
  let n = 0;
  const trips = [['2026-03-02', '2026-03-05'], ['2026-11-09', '2026-11-11'], ['2027-06-14', '2027-06-14']];
  for (const fy of ['2026', '2027']) for (const st of Object.keys(DATA[fy].states)) for (const d of DATA[fy].states[st]) {
    for (const [start, end] of trips) {
      const tfy = PD.fiscalYear(start); if (String(tfy) !== fy) continue;
      // The API resolves by city + state; pick the area whose county matches the page row.
      const base = d[0] === 'Standard Rate' ? { state: st, city: 'Zzyzx Nowhere' } : { state: st, city: d[0].trim() };
      let r = await T.mealDeduction({ ...base, start, end });
      if (r.alternatives) {
        const i = r.alternatives.findIndex(x => (x.county || '') === d[1]);
        assert.ok(i >= 0, `${st} ${d[0]} county not found`);
        r = await T.mealDeduction({ ...base, start, end, area_index: i });
      }
      for (const method of ['three-quarters', 'full']) for (const percent of [50, 80, 100]) {
        const m = method === 'three-quarters' && percent === 50 ? r : await T.mealDeduction({ ...base, start, end, method, percent, area_index: r.alternatives ? r.alternatives.findIndex(x => (x.county || '') === d[1]) : undefined });
        const p = PD.trip(DATA, { state: st, city: d[0], county: d[1], start, end, method, percent });
        assert.equal(m.totals.standard_meal_allowance, p.totals.mie, `${st} ${d[0]} ${start} ${method}`);
        assert.equal(m.totals.deductible, p.totals.deductible, `${st} ${d[0]} ${start} ${method} ${percent}`);
        assert.equal(m.totals.gsa_lodging_reference, p.totals.lodgingRef, `${st} ${d[0]} ${start} lodging`);
        n++;
      }
    }
  }
  assert.ok(n > 3000, `only ${n} cases`);
});

test('per diem rates, M&IE breakdown, trip and errors', async () => {
  const r = await T.perDiemRates({ zip: '10001', fiscal_year: 2026 });
  assert.equal(r.results[0].mie.total, 92);
  const m = await T.mieBreakdown({ fiscal_year: 2027 });
  assert.deepEqual(m.tiers.map(t => t.total), [68, 74, 80, 86, 92]);
  const t = await T.perDiemTrip({ zip: '10001', start: '2026-11-03', end: '2026-11-06', breakfasts_provided: 1 });
  assert.equal(t.totals.mie, 322 - 23);
  assert.equal(t.totals.lodging_max, 358 * 3);
  await assert.rejects(T.mealDeduction({ zip: '10001', start: '2026-11-03', end: '2026-11-04', percent: 60 }), /50, 80 or 100/);
  await assert.rejects(T.mealDeduction({ zip: '10001', start: '2027-09-30', end: '2027-10-01' }));
  await assert.rejects(T.perDiemRates({}), /zip/);
});
