import assert from 'node:assert/strict';
import test from 'node:test';
import { lookupEvents, restore } from '../src/event-lookup.mjs';

test('desktop batch retains original occurrences and caller ordering', () => {
  const row = {tenant: 'desk', kind: 'posted', timestamp: 4};
  const query = {request_id: 7, tenant: 'desk', kind: 'posted', start: 4, end: 4};
  const groups = lookupEvents([row, row], [query, query]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].events.length, 2);
  assert.strictEqual(groups[1].events[0], row);
});

test('read last issued statement from a compacted export', async () => {
  const pack = {id: 'settled-12', blocks: ['entries'], cost: 4};
  const tenant = {id: 'west', checkpoints: [{cut: 12, blocks: ['entries']}], spans: []};
  const manifest = {zones: [{packs: [pack], tenants: [tenant]}]};
  const query = {tenant: 'west', at: 12, from: 20, until: 40, after: null, limit: 10};
  const entries = [{key: 'x7', time: 35, cents: '140'}];
  const result = await restore(manifest, [query], 4, async id => {
    assert.equal(id, pack.id);
    return {entries};
  });
  assert.deepEqual(result, {status: 'ok', spent: 4, minimum: 0, statements: [{count: 1, total: '140', entries}]});
});

test('customer history includes a dispatched correction', async () => {
  const tenant = {
    id: 'east', checkpoints: [{cut: 4, blocks: ['open']}],
    spans: [{lo: 4, hi: 7, blocks: ['amendments']}],
  };
  const pack = {id: 'november', cost: 3, blocks: ['open','amendments']};
  const archive = {open: [{key: 'x', time: 30, cents: '20'}],
    amendments: [{rev: 6, seq: 0, op: 'delta', key: 'x', cents: '-3'}]};
  const query = {tenant: 'east', at: 6, from: 0, until: 50, after: null, limit: 1};
  const result = await restore({zones: [{tenants: [tenant], packs: [pack]}]}, [query], 3, async () => archive);
  assert.deepEqual(result.statements, [{count: 1, total: '17', entries: [{key: 'x', time: 30, cents: '17'}]}]);
});
