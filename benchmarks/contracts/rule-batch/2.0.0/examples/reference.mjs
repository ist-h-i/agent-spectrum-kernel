// Controller-only positive reference. Never install this in a candidate workspace.
import { RuleValidationError, VersionConflictError } from '../../../../fixtures/checkpoint-b2/impl-rule-batch-medium-hard/workspace/src/errors.mjs';
import { canonicalizeKey, validateScalar } from '../../../../fixtures/checkpoint-b2/impl-rule-batch-medium-hard/workspace/src/validation.mjs';

export { RuleValidationError, VersionConflictError };

export class IdempotencyConflictError extends Error {
  constructor(requestId) {
    super(`Request ID ${requestId} was already used with a different payload`);
    this.name = 'IdempotencyConflictError';
    this.code = 'IDEMPOTENCY_CONFLICT';
    this.requestId = requestId;
  }
}

function assertRecordKeys(record, expected) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(record))) {
    throw new RuleValidationError('Expected a plain record');
  }
  const keys = Object.keys(record);
  if (keys.length !== expected.length || expected.some(key => !keys.includes(key))) {
    throw new RuleValidationError('Unexpected record properties');
  }
}

export function canonicalizeBatchKey(key) {
  if (typeof key !== 'string' || /[^\x00-\x7f]/u.test(key)) {
    throw new RuleValidationError('Batch key must contain only ASCII characters');
  }
  const canonical = key.replace(/^[\t-\r ]+|[\t-\r ]+$/g, '')
    .replace(/[A-Z]/g, letter => letter.toLowerCase());
  if (!/^[a-z][a-z0-9._-]{0,31}$/.test(canonical) || /[^a-z0-9._-]/.test(canonical)) {
    throw new RuleValidationError('Invalid batch rule key');
  }
  return canonical;
}

export function normalizeBatchRequest(request) {
  assertRecordKeys(request, ['requestId', 'expectedVersion', 'operations']);
  if (typeof request.requestId !== 'string'
      || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(request.requestId)
      || /[^A-Za-z0-9_-]/.test(request.requestId)) {
    throw new RuleValidationError('Invalid requestId');
  }
  if (!Number.isInteger(request.expectedVersion) || request.expectedVersion < 0) {
    throw new RuleValidationError('Invalid expectedVersion');
  }
  if (!Array.isArray(request.operations) || request.operations.length < 1 || request.operations.length > 20) {
    throw new RuleValidationError('Expected 1 through 20 operations');
  }
  const keys = new Set();
  const operations = Array.from(request.operations, operation => {
    assertRecordKeys(operation, operation?.op === 'set' ? ['op', 'key', 'value'] : ['op', 'key']);
    if (operation.op !== 'set' && operation.op !== 'delete') {
      throw new RuleValidationError('Invalid operation');
    }
    const key = canonicalizeBatchKey(operation.key);
    if (keys.has(key)) throw new RuleValidationError('Duplicate canonical key');
    keys.add(key);
    return operation.op === 'set'
      ? { op: 'set', key, value: validateScalar(operation.value) }
      : { op: 'delete', key };
  });
  return {
    requestId: request.requestId,
    expectedVersion: request.expectedVersion === 0 ? 0 : request.expectedVersion,
    operations,
  };
}

export function sameNormalizedPayload(left, right) {
  return left.expectedVersion === right.expectedVersion
    && left.operations.length === right.operations.length
    && left.operations.every((operation, index) => {
      const other = right.operations[index];
      return operation.op === other.op && operation.key === other.key
        && (operation.op !== 'set' || Object.is(operation.value, other.value));
    });
}

export class RuleStore {
  #rules = new Map();
  #version = 0;
  #requests = new Map();

  constructor(initialRules = {}) {
    for (const [key, value] of Object.entries(initialRules)) this.#rules.set(key, structuredClone(value));
  }

  get version() { return this.#version; }
  get(key) { return this.#rules.has(key) ? structuredClone(this.#rules.get(key)) : undefined; }
  list() {
    return Object.fromEntries([...this.#rules].map(([key, value]) => [key, structuredClone(value)]));
  }
  put(key, value) {
    this.#rules.set(key, structuredClone(value));
    this.#version += 1;
    return { version: this.#version, value: this.get(key) };
  }
  delete(key) {
    const existed = this.#rules.delete(key);
    this.#version += 1;
    return { version: this.#version, deleted: existed };
  }
  assertVersion(expectedVersion) {
    if (expectedVersion !== this.#version) throw new VersionConflictError(expectedVersion, this.#version);
  }

  // A controller-only override point lets artificial storage mutants isolate a
  // faulty commit policy without accidentally changing version semantics.
  _prepareBatchRules(rules) { return rules; }

  applyBatch(request) {
    const normalized = normalizeBatchRequest(request);
    const prior = this.#requests.get(normalized.requestId);
    if (prior) {
      if (!sameNormalizedPayload(prior.request, normalized)) {
        throw new IdempotencyConflictError(normalized.requestId);
      }
      return structuredClone(prior.receipt);
    }
    this.assertVersion(normalized.expectedVersion);
    let next = new Map(this.#rules);
    for (const operation of normalized.operations) {
      if (operation.op === 'set') next.set(operation.key, structuredClone(operation.value));
      else next.delete(operation.key);
    }
    next = this._prepareBatchRules(next);
    const receipt = {
      requestId: normalized.requestId,
      version: this.#version + 1,
      rules: Object.fromEntries([...next].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, value]) => [key, structuredClone(value)])),
    };
    this.#rules = next;
    this.#version = receipt.version;
    this.#requests.set(normalized.requestId, { request: structuredClone(normalized), receipt: structuredClone(receipt) });
    return structuredClone(receipt);
  }
}

export class RuleService {
  constructor(store) { this.store = store; }
  get(key) { return this.store.get(canonicalizeKey(key)); }
  list() { return this.store.list(); }
  put(key, value) { return this.store.put(canonicalizeKey(key), validateScalar(value)); }
  delete(key) { return this.store.delete(canonicalizeKey(key)); }
  applyBatch(request) { return this.store.applyBatch(request); }
}
