import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(process.argv[2] ?? path.join(here, '..', 'workspace'));
const load = (relative) => import(pathToFileURL(path.join(workspace, relative)).href);
const api = await load('src/index.mjs');
const { RuleService, RuleStore, IdempotencyConflictError, VersionConflictError } = api;

const hashFile = (relative) => crypto.createHash('sha256').update(fs.readFileSync(path.join(workspace, relative))).digest('hex');

test('normal batch, lexical receipt order, and one version increment', () => {
  const store = new RuleStore({ zebra: 1 });
  const service = new RuleService(store);
  const result = service.applyBatch({
    requestId: 'req-normal', expectedVersion: 0,
    operations: [
      { op: 'set', key: ' Beta ', value: false },
      { op: 'set', key: 'alpha', value: null },
      { op: 'delete', key: 'zebra' }
    ]
  });
  assert.deepEqual(result, { requestId: 'req-normal', version: 1, rules: { alpha: null, beta: false } });
  assert.equal(store.version, 1);
});

test('boundary sizes and strict scalar/shape validation', () => {
  const service = new RuleService(new RuleStore());
  const twenty = Array.from({ length: 20 }, (_, index) => ({ op: 'set', key: `k${index}`, value: index }));
  assert.equal(service.applyBatch({ requestId: 'req-20', expectedVersion: 0, operations: twenty }).version, 1);

  const invalidService = new RuleService(new RuleStore());
  assert.throws(() => invalidService.applyBatch({ requestId: 'req-21', expectedVersion: 0, operations: [...twenty, { op: 'set', key: 'extra', value: 1 }] }));
  assert.throws(() => invalidService.applyBatch({ requestId: 'req-nan', expectedVersion: 0, operations: [{ op: 'set', key: 'a', value: NaN }] }));
  assert.throws(() => invalidService.applyBatch({ requestId: 'req-extra', expectedVersion: 0, operations: [{ op: 'delete', key: 'a', value: 1 }] }));
  assert.throws(() => invalidService.applyBatch({ requestId: 'req-dup', expectedVersion: 0, operations: [{ op: 'set', key: ' A ', value: 1 }, { op: 'delete', key: 'a' }] }));
});

test('validation and version failures preserve all state', () => {
  const store = new RuleStore({ keep: true });
  const service = new RuleService(store);
  const before = { rules: service.list(), version: store.version };
  assert.throws(() => service.applyBatch({
    requestId: 'req-invalid', expectedVersion: 0,
    operations: [{ op: 'set', key: 'new', value: 1 }, { op: 'set', key: 'bad key', value: 2 }]
  }));
  assert.deepEqual({ rules: service.list(), version: store.version }, before);
  service.put('later', 1);
  const afterPut = { rules: service.list(), version: store.version };
  assert.throws(() => service.applyBatch({ requestId: 'req-version', expectedVersion: 0, operations: [{ op: 'delete', key: 'keep' }] }), VersionConflictError);
  assert.deepEqual({ rules: service.list(), version: store.version }, afterPut);
});

test('idempotent replay precedes version checking and collisions preserve state', () => {
  const store = new RuleStore();
  const service = new RuleService(store);
  const request = { requestId: 'req-idem', expectedVersion: 0, operations: [{ op: 'set', key: ' A ', value: 1 }] };
  const first = service.applyBatch(request);
  service.put('other', 2);
  const replay = service.applyBatch({ requestId: 'req-idem', expectedVersion: 0, operations: [{ op: 'set', key: 'a', value: 1 }] });
  assert.deepEqual(replay, first);
  const before = { rules: service.list(), version: store.version };
  assert.throws(() => service.applyBatch({ requestId: 'req-idem', expectedVersion: 0, operations: [{ op: 'set', key: 'a', value: 9 }] }), IdempotencyConflictError);
  assert.deepEqual({ rules: service.list(), version: store.version }, before);
});

test('inputs and receipts do not alias internal state', () => {
  const store = new RuleStore();
  const service = new RuleService(store);
  const request = { requestId: 'req-alias', expectedVersion: 0, operations: [{ op: 'set', key: 'a', value: 'original' }] };
  const receipt = service.applyBatch(request);
  request.operations[0].value = 'mutated-input';
  receipt.rules.a = 'mutated-result';
  assert.equal(service.get('a'), 'original');
  assert.equal(service.applyBatch({ requestId: 'req-alias', expectedVersion: 0, operations: [{ op: 'set', key: 'a', value: 'original' }] }).rules.a, 'original');
});

test('legacy APIs remain compatible', () => {
  const store = new RuleStore();
  const service = new RuleService(store);
  assert.deepEqual(service.put(' Foo ', 1), { version: 1, value: 1 });
  assert.equal(service.get('foo'), 1);
  assert.deepEqual(service.delete('FOO'), { version: 2, deleted: true });
  assert.deepEqual(service.list(), {});
});

test('scope-protected files and source-module set are unchanged', () => {
  assert.equal(hashFile('package.json'), 'a5dace66e989ce4aff59cd8e2c2646192a97f02b49505a6f992ffb0871d6570d');
  assert.equal(hashFile('docs/rule-batches.md'), '055595f77b6d31523c0875465c6e96a77a7824963c5e4561c3a904d4077e110f');
  assert.equal(hashFile('docs/rule-batch.schema.json'), 'f96825608b1524ab0752eddf5112da0a7180b2751addd1a3bfb29ed54083fcf0');
  const sourceFiles = fs.readdirSync(path.join(workspace, 'src')).sort();
  assert.deepEqual(sourceFiles, ['errors.mjs', 'index.mjs', 'rule-service.mjs', 'rule-store.mjs', 'validation.mjs']);
});
