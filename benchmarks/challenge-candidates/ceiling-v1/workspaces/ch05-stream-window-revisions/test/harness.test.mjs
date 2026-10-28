import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSink } from '../harness/sink.mjs';
import { steadyLoad, activeGrowthLoad } from '../harness/generator.mjs';

test('fixed workloads have bounded steady live windows and separate active growth', () => {
  const recipe = JSON.parse(readFileSync(new URL('../data/load.json', import.meta.url)));
  let events = 0, watermarks = 0;
  for (const input of steadyLoad(recipe)) input.kind === 'watermark' ? watermarks++ : events++;
  assert.equal(events, recipe.tenants * recipe.steadyRounds * recipe.idsPerTenantPerRound * recipe.revisionsPerId);
  assert.equal(watermarks, recipe.tenants * recipe.steadyRounds);
  let active = 0;
  for (const input of activeGrowthLoad(recipe)) {
    assert.equal(input.kind, undefined);
    active++;
  }
  assert.equal(active, recipe.tenants * recipe.activeGrowthIdsPerTenant);
});

test('counting sink does not retain output rows or rejection history', () => {
  const sink = createSink({ collect: false });
  sink.finalize({ tenantId: 'a', start: 0, end: 10, amountMinor: '5' });
  sink.reject({ event: { eventId: 'b' }, reason: 'closed_window' });
  const state = sink.snapshot();
  assert.deepEqual(state.outputs, []);
  assert.deepEqual(state.rejections, []);
  assert.equal(state.outputCount, 1);
  assert.equal(state.rejectionCount, 1);
  assert.match(state.digest, /^[a-f0-9]{64}$/);
});
