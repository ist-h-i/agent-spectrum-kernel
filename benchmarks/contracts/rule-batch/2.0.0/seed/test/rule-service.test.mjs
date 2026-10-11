import test from 'node:test';
import assert from 'node:assert/strict';
import { RuleService, RuleStore } from '../src/index.mjs';

test('legacy put/get still canonicalizes keys', () => {
  const service = new RuleService(new RuleStore());
  service.put(' Feature.Enabled ', true);
  assert.equal(service.get('feature.enabled'), true);
});

test('applyBatch sets and deletes rules in one call', () => {
  const service = new RuleService(new RuleStore({ old: 'remove' }));
  const result = service.applyBatch({
    requestId: 'req-1',
    expectedVersion: 0,
    operations: [
      { op: 'set', key: ' Feature.Enabled ', value: true },
      { op: 'delete', key: 'old' }
    ]
  });
  assert.deepEqual(result, {
    requestId: 'req-1',
    version: 1,
    rules: { 'feature.enabled': true }
  });
});

test('applyBatch rejects malformed keys', () => {
  const service = new RuleService(new RuleStore());
  assert.throws(() => service.applyBatch({
    requestId: 'req-1', expectedVersion: 0,
    operations: [{ op: 'set', key: 'not valid', value: true }]
  }));
});
