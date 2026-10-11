import assert from 'node:assert/strict';

// Controller-authored fixed cases. IDs are contract trace links, not scores.
export const cases = [];
const add = (id, requirements, run) => cases.push({ id, requirements, run });
const set = (key = 'a', value = 1) => ({ op: 'set', key, value });
const del = (key = 'a') => ({ op: 'delete', key });
const req = (operations = [set()], requestId = 'r', expectedVersion = 0) => ({ requestId, expectedVersion, operations });
const pair = (api, initial) => {
  const store = new api.RuleStore(initial);
  return { store, service: new api.RuleService(store) };
};
const state = ({ store, service }) => ({ version: store.version, rules: service.list() });
const rejects = (p, input, error) => {
  const before = state(p);
  assert.throws(() => p.service.applyBatch(input), error);
  assert.deepStrictEqual(state(p), before, 'rejection must preserve rules and version');
};

add('api-exports', ['r1'], api => {
  for (const name of ['RuleService', 'RuleStore', 'RuleValidationError', 'VersionConflictError', 'IdempotencyConflictError']) {
    assert.equal(typeof api[name], 'function', name);
  }
  assert.equal(typeof api.RuleService.prototype.applyBatch, 'function');
  const p = pair(api);
  assert.throws(() => p.service.applyBatch(null), error =>
    error instanceof api.RuleValidationError && error.code === 'RULE_VALIDATION');
  p.service.applyBatch(req());
  assert.throws(() => p.service.applyBatch(req([set('a', 2)])), error =>
    error instanceof api.IdempotencyConflictError && error.code === 'IDEMPOTENCY_CONFLICT');
  assert.throws(() => p.service.applyBatch(req([set('b')], 's')), error =>
    error instanceof api.VersionConflictError && error.code === 'VERSION_CONFLICT'
    && error.expected === 0 && error.actual === 1);
});
add('normal-receipt', ['r3', 'r5', 'r6', 'r9'], api => {
  const p = pair(api, { zebra: 1 });
  assert.deepStrictEqual(p.service.applyBatch(req([set(' Beta ', false), set('alpha', null), del('zebra')])),
    { requestId: 'r', version: 1, rules: { alpha: null, beta: false } });
  assert.deepStrictEqual(state(p), { version: 1, rules: { beta: false, alpha: null } });
});
add('operation-count-20', ['r2', 'r6'], api => {
  const p = pair(api);
  const operations = Array.from({ length: 20 }, (_, i) => set(`k${i}`, i));
  assert.equal(p.service.applyBatch(req(operations)).version, 1);
  assert.equal(Object.keys(p.service.list()).length, 20);
});

const invalidRequests = [
  ['null', null], ['undefined', undefined], ['array', []], ['string', 'r'],
  ['missing-id', { expectedVersion: 0, operations: [set()] }],
  ['missing-version', { requestId: 'r', operations: [set()] }],
  ['missing-ops', { requestId: 'r', expectedVersion: 0 }],
  ['unknown-field', { ...req(), extra: true }],
  ['id-empty', req([set()], '')], ['id-length65', req([set()], 'a'.repeat(65))],
  ['id-space', req([set()], 'r x')], ['id-unicode', req([set()], 'é')],
  ['id-start-dash', req([set()], '-r')], ['id-number', req([set()], 1)],
  ...[-1, 0.5, '0', null, NaN, Infinity, -Infinity, true].map((v, i) => [`version-${i}`, req([set()], 'r', v)]),
  ['ops-empty', req([])], ['ops21', req(Array.from({ length: 21 }, (_, i) => set(`k${i}`)))],
  ['ops-object', req({})], ['ops-null', req(null)], ['ops-sparse', req(Array(1))],
];
for (const [name, input] of invalidRequests) add(`shape-${name}`, ['r2', 'r5'], api => {
  const p = pair(api, { keep: -0 });
  rejects(p, input, api.RuleValidationError);
  assert.equal(p.service.applyBatch(req([set()], 'r', 0)).version, 1, 'failed ID must remain unused');
});
const invalidOps = [
  ['null', null], ['array', []], ['unknown-kind', { op: 'move', key: 'a' }],
  ['missing-kind', { key: 'a', value: 1 }], ['missing-key', { op: 'set', value: 1 }],
  ['missing-value', { op: 'set', key: 'a' }], ['delete-value', { ...del(), value: 1 }],
  ['set-extra', { ...set(), extra: 1 }], ['delete-extra', { ...del(), extra: 1 }],
  ['key-number', set(1)], ['key-empty', set('')], ['key-long', set('a'.repeat(33))],
  ['key-digit-start', set('1a')], ['key-space-inside', set('a b')], ['key-slash', set('a/b')],
];
for (const [name, op] of invalidOps) add(`operation-${name}`, ['r2', 'r3', 'r5'], api => {
  const p = pair(api, { keep: true });
  rejects(p, req([set('partial', 1), op]), api.RuleValidationError);
  assert.equal(p.service.applyBatch(req([set('ok')])).version, 1);
});
for (const [i, value] of [undefined, NaN, Infinity, -Infinity, 1n, Symbol('x'), [], {}, () => 1].entries()) {
  add(`scalar-invalid-${i}`, ['r4', 'r5'], api => {
    const p = pair(api, { keep: true });
    rejects(p, req([set('partial'), { op: 'set', key: 'bad', value }]), api.RuleValidationError);
    assert.equal(p.service.applyBatch(req()).version, 1);
  });
}
for (const [i, value] of [null, '', 'éK', false, true, -0, +0, -1, 1.25, Number.MIN_VALUE, Number.MAX_VALUE].entries()) {
  add(`scalar-valid-${i}`, ['r4', 'r6', 'r8'], api => {
    const p = pair(api);
    const receipt = p.service.applyBatch(req([set('a', value)]));
    assert.ok(Object.is(p.service.get('a'), value));
    assert.ok(Object.is(receipt.rules.a, value));
    assert.equal(p.store.version, 1);
  });
}
add('ascii-normalization', ['r3'], api => {
  const p = pair(api);
  const key = '\t\n\v\f\r A._-09 \t';
  assert.deepStrictEqual(p.service.applyBatch(req([set(key)])).rules, { 'a._-09': 1 });
});
add('canonical-duplicates', ['r3', 'r5'], api => {
  const p = pair(api);
  rejects(p, req([set(' A ', 1), del('a')]), api.RuleValidationError);
  assert.equal(p.service.applyBatch(req()).version, 1);
});
add('id-length64', ['r2'], api => {
  const id = 'A'.repeat(64), p = pair(api);
  assert.equal(p.service.applyBatch(req([set()], id)).requestId, id);
});
add('key-length32', ['r3'], api => {
  const p = pair(api), key = 'a'.repeat(32);
  assert.equal(p.service.applyBatch(req([set(key)])).rules[key], 1);
});
add('missing-delete', ['r6'], api => {
  const p = pair(api);
  assert.deepStrictEqual(p.service.applyBatch(req([del('missing')])), { requestId: 'r', version: 1, rules: {} });
  assert.equal(p.service.applyBatch(req([del('missing')], 's', 1)).version, 2);
});
add('version-conflict-retry', ['r5'], api => {
  const p = pair(api);
  p.service.put('keep', 2);
  rejects(p, req(), api.VersionConflictError);
  assert.equal(p.service.applyBatch(req([set()], 'r', 1)).version, 2);
});
add('replay-before-version', ['r5', 'r7', 'r9'], api => {
  const p = pair(api), input = req([set(' A ', 1)]);
  const receipt = p.service.applyBatch(input);
  p.service.put('later', 2);
  const before = state(p);
  assert.deepStrictEqual(p.service.applyBatch(req([set('a', 1)])), receipt);
  assert.deepStrictEqual(state(p), before);
});
add('validate-before-replay', ['r2', 'r5', 'r7'], api => {
  const p = pair(api), first = p.service.applyBatch(req());
  rejects(p, { ...req(), extra: true }, api.RuleValidationError);
  assert.deepStrictEqual(p.service.applyBatch(req()), first);
});
for (const [name, firstOps, nextOps, nextVersion] of [
  ['version', [set()], [set()], 1],
  ['kind', [set()], [del()], 0],
  ['key', [set('a')], [set('b')], 0],
  ['value', [set('a', 1)], [set('a', 2)], 0],
  ['number-string', [set('a', 1)], [set('a', '1')], 0],
  ['boolean-number', [set('a', true)], [set('a', 1)], 0],
  ['null-string', [set('a', null)], [set('a', 'null')], 0],
  ['small-nonzero', [set('a', Number.MIN_VALUE)], [set('a', 0)], 0],
  ['order', [set('a'), set('b')], [set('b'), set('a')], 0],
  ['length', [set('a')], [set('a'), del('missing')], 0],
]) add(`collision-${name}`, ['r5', 'r7'], api => {
  const p = pair(api), original = req(firstOps), receipt = p.service.applyBatch(original);
  rejects(p, req(nextOps, 'r', nextVersion), api.IdempotencyConflictError);
  assert.deepStrictEqual(p.service.applyBatch(original), receipt, 'failed collision must preserve replay record');
});
for (const [name, first, second] of [['negative-positive', -0, +0], ['positive-negative', +0, -0]]) {
  add(`zero-${name}`, ['r5', 'r6', 'r7', 'r8', 'r9'], api => {
    const p = pair(api), original = req([set('a', first)]), receipt = p.service.applyBatch(original);
    assert.ok(Object.is(p.service.get('a'), first));
    assert.ok(Object.is(receipt.rules.a, first));
    assert.ok(Object.is(p.service.applyBatch(req([set(' A ', first)])).rules.a, first));
    rejects(p, req([set('a', second)]), api.IdempotencyConflictError);
    const next = p.service.applyBatch(req([set('a', second)], 's', 1));
    assert.ok(Object.is(p.service.get('a'), second));
    assert.ok(Object.is(next.rules.a, second));
    assert.equal(p.store.version, 2);
    assert.ok(Object.is(p.service.applyBatch(original).rules.a, first));
    assert.equal(p.store.version, 2);
  });
}
add('zero-version-counter', ['r2', 'r7'], api => {
  const p = pair(api), first = p.service.applyBatch(req([set('a', -0)], 'r', -0));
  assert.deepStrictEqual(p.service.applyBatch(req([set('a', -0)], 'r', +0)), first);
  assert.equal(p.store.version, 1);
});
add('new-id-same-payload-stale', ['r5', 'r7'], api => {
  const p = pair(api);
  p.service.applyBatch(req());
  rejects(p, req([set()], 's', 0), api.VersionConflictError);
  assert.equal(p.service.applyBatch(req([set()], 's', 1)).version, 2);
});
add('input-result-isolation', ['r8'], api => {
  const p = pair(api), input = req([set('a', 'é')]), before = structuredClone(input);
  Object.freeze(input.operations[0]); Object.freeze(input.operations); Object.freeze(input);
  const receipt = p.service.applyBatch(input);
  assert.deepStrictEqual(input, before);
  receipt.rules.a = 'changed'; receipt.version = 99;
  assert.equal(p.service.get('a'), 'é');
  assert.deepStrictEqual(p.service.applyBatch(req([set('a', 'é')])), { requestId: 'r', version: 1, rules: { a: 'é' } });
});
add('mutable-input-isolation', ['r8'], api => {
  const p = pair(api), input = req([set('a', 'original')]);
  p.service.applyBatch(input);
  input.operations[0].value = 'changed'; input.operations.reverse(); input.expectedVersion = 7;
  assert.equal(p.service.applyBatch(req([set('a', 'original')])).rules.a, 'original');
  rejects(p, req([set('a', 'changed')]), api.IdempotencyConflictError);
});
for (const key of ['K', 'é', 'İ', 'aé', '\u00a0a\u00a0', '\u2003a\u2003']) {
  for (const op of ['set', 'delete']) for (const existing of [false, true]) {
    add(`unicode-reject-${op}-${existing}-${key.codePointAt(0).toString(16)}`, ['r3', 'r5', 'r10'], api => {
      const p = pair(api, existing ? { [key]: 'raw', k: 'canonical' } : {});
      rejects(p, req([set('partial'), op === 'set' ? set(key) : del(key)]), api.RuleValidationError);
      assert.equal(p.service.applyBatch(req([set('ascii')])).version, 1);
    });
  }
}
add('unicode-store-preservation', ['r5', 'r8', 'r9', 'r10'], api => {
  const initial = { é: 'café', 'K': { text: '雪', nested: [-0] }, k: 'canonical' };
  const p = pair(api, initial);
  p.store.put('Ω', 'µ');
  const receipt = p.service.applyBatch(req([set('ascii', 'é')], 'r', 1));
  assert.deepStrictEqual(receipt.rules, { ascii: 'é', k: 'canonical', é: 'café', 'Ω': 'µ', 'K': { text: '雪', nested: [-0] } });
  assert.deepStrictEqual(Object.keys(receipt.rules), ['ascii', 'k', 'é', 'Ω', 'K']);
  assert.deepStrictEqual(Object.keys(p.service.list()), ['é', 'K', 'k', 'Ω', 'ascii']);
  initial['K'].nested[0] = 3;
  receipt.rules['K'].nested[0] = 4;
  const listed = p.service.list(); listed['K'].text = 'changed';
  assert.deepStrictEqual(p.store.get('K'), { text: '雪', nested: [-0] });
  const replay = p.service.applyBatch(req([set('ascii', 'é')], 'r', 1));
  assert.deepStrictEqual(replay.rules['K'], { text: '雪', nested: [-0] });
  replay.rules['K'].text = 'again';
  assert.equal(p.service.applyBatch(req([set('ascii', 'é')], 'r', 1)).rules['K'].text, '雪');
});
add('unicode-single-alias', ['r10'], api => {
  const p = pair(api, { 'K': 'raw', é: 'raw-accent' });
  assert.deepStrictEqual(p.service.put('\u00a0K\u00a0', -0), { version: 1, value: -0 });
  assert.ok(Object.is(p.service.get('K'), -0));
  assert.equal(p.store.get('K'), 'raw');
  assert.throws(() => p.service.get('é'), api.RuleValidationError);
  assert.deepStrictEqual(p.service.delete('K'), { version: 2, deleted: true });
  assert.equal(p.store.get('K'), 'raw');
});
// Unlike Kelvin, é does not lower-case to an ASCII key in the seed.
add('legacy-validation', ['r4', 'r10'], api => {
  const p = pair(api);
  assert.throws(() => p.service.get('é'), api.RuleValidationError);
  assert.throws(() => p.service.put('é', 1), api.RuleValidationError);
  assert.throws(() => p.service.delete('é'), api.RuleValidationError);
  assert.throws(() => p.service.put('a', {}), api.RuleValidationError);
  assert.equal(p.store.version, 0);
});
add('legacy-returns-and-order', ['r10'], api => {
  const p = pair(api, { zebra: 1, alpha: 2 });
  assert.deepStrictEqual(Object.keys(p.service.list()), ['zebra', 'alpha']);
  assert.deepStrictEqual(p.service.put(' Foo ', 1), { version: 1, value: 1 });
  assert.equal(p.service.get('FOO'), 1);
  assert.deepStrictEqual(p.service.delete('K'), { version: 2, deleted: false });
  assert.deepStrictEqual(p.service.delete('foo'), { version: 3, deleted: true });
  assert.deepStrictEqual(p.service.list(), { zebra: 1, alpha: 2 });
});
add('raw-integer-receipt-order', ['r9', 'r10'], api => {
  const p = pair(api, { '10': 'ten', '2': 'two', zebra: 1 });
  const receipt = p.service.applyBatch(req([set('alpha', true)]));
  assert.deepStrictEqual(Object.keys(receipt.rules), ['2', '10', 'alpha', 'zebra']);
  assert.deepStrictEqual(Object.keys(p.service.list()), ['2', '10', 'zebra', 'alpha']);
});

export function runCases(api) {
  const results = cases.map(({ id, run }) => {
    try { run(api); return { id, status: 'pass' }; }
    catch (error) { return { id, status: 'fail', error: `${error.name}: ${error.message}` }; }
  });
  return { total: results.length, passed: results.filter(r => r.status === 'pass').length, results };
}
