import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as T from '../src/tools.js';
import { compute } from '../src/lib/retirement.js';
import { handle } from '../src/lib/index.js';

const PAGE = createRequire(import.meta.url)('./fixtures/live-page-sep.cjs');
const direct = async body => (await handle(new Request('https://x/v1/retirement', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))).json();
const block = s => { const i = s.indexOf('var SEP'); return s.slice(i, s.indexOf('})();', i) + 5); };

test('core logic is byte-identical to the live page snapshot', () => {
  const core = readFileSync(new URL('../src/lib/retirement.js', import.meta.url), 'utf8');
  const page = readFileSync(new URL('./fixtures/live-page-sep.cjs', import.meta.url), 'utf8');
  assert.equal(block(core), block(page));
});
test('live page default example ($100k profit)', async () => {
  const r = await T.retirement({ net_profit: 100000 });
  assert.equal(r.se_tax.total, 14129.55);
  assert.equal(r.earned_income, 92935.22);
  assert.equal(r.sep_ira.total, 18587.04);
  assert.equal(r.solo_401k.deferral, 24500);
  assert.equal(r.solo_401k.total, 43087.04);
  assert.equal(r.better, 'solo401k');
  assert.equal(r.income_tax_saved.solo_401k, 9479.15);
  assert.equal(r.limits.total_415c, 72000);
});
test('tool matches the API handler and the page logic across a grid', async () => {
  const ages = ['under50', '50plus', '60to63'];
  let n = 0;
  for (const p of [0, 400, 5000, 30000, 75000, 150000, 250000, 400000, 800000])
    for (const age of ages)
      for (const [w2, od, rate, br] of [[0, 0, 25, 22], [184500, 0, 25, 32], [50000, 20000, 20, 12], [0, 24500, 10, 37]]) {
        const a = { net_profit: p, age_group: age, w2_wages: w2, other_deferrals: od, plan_rate: rate, bracket: br };
        const t = await T.retirement(a);
        assert.deepEqual(t, await direct(a));
        const pg = PAGE.compute({ netProfit: p, age, w2Wages: w2, otherDeferrals: od, planRate: rate, bracket: br });
        const c = compute({ netProfit: p, age, w2Wages: w2, otherDeferrals: od, planRate: rate, bracket: br });
        assert.deepEqual(c, pg);
        assert.equal(t.sep_ira.total, pg.sep.total);
        assert.equal(t.solo_401k.total, pg.solo401k.total);
        assert.equal(t.better, pg.better);
        assert.equal(t.income_tax_saved.sep_ira, pg.taxSaved.sep);
        n++;
      }
  assert.equal(n, 108);
});
test('caps: $72,000 at high income, catch-ups on top', async () => {
  const r = await T.retirement({ net_profit: 600000, age_group: '50plus' });
  assert.equal(r.sep_ira.total, 72000);
  assert.equal(r.solo_401k.total, 80000);
  const s = await T.retirement({ net_profit: 600000, age_group: '60to63' });
  assert.equal(s.solo_401k.total, 83250);
});
test('validation errors surface', async () => {
  await assert.rejects(T.retirement({}), /net_profit/);
  await assert.rejects(T.retirement({ net_profit: 1000, age_group: 'old' }), /age_group/);
  await assert.rejects(T.retirement({ net_profit: 1000, plan_rate: 30 }));
});
test('stdio server exposes retirement_contribution', async () => {
  const c = new Client({ name: 't', version: '1' });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [new URL('../src/server.js', import.meta.url).pathname] }));
  const r = await c.callTool({ name: 'retirement_contribution', arguments: { net_profit: 100000 } });
  assert.equal(r.structuredContent.solo_401k.total, 43087.04);
  const e = await c.callTool({ name: 'retirement_contribution', arguments: { net_profit: 1000, age_group: 'old' } });
  assert.equal(e.isError, true);
  await c.close();
});
