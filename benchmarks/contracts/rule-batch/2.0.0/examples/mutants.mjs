// Artificial controller-only faults. Each named export is an API namespace
// accepted by the verifier; none is a candidate result or model output.
import * as reference from './reference.mjs';
import { canonicalizeKey } from '../../../../fixtures/checkpoint-b2/impl-rule-batch-medium-hard/workspace/src/validation.mjs';

function api(RuleService = reference.RuleService, RuleStore = reference.RuleStore) {
  return {
    RuleService, RuleStore,
    RuleValidationError: reference.RuleValidationError,
    VersionConflictError: reference.VersionConflictError,
    IdempotencyConflictError: reference.IdempotencyConflictError,
  };
}

function identityMutant({ ignore = null, equals = Object.is, unordered = false, always = false } = {}) {
  return api(class extends reference.RuleService {
    #accepted = new Map();

    applyBatch(request) {
      const normalized = reference.normalizeBatchRequest(request);
      const prior = this.#accepted.get(normalized.requestId);
      const comparableOperations = operations => unordered
        ? [...operations].sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0)
        : operations;
      const same = (left, right) => {
        if (always) return true;
        if (ignore !== 'expectedVersion' && left.expectedVersion !== right.expectedVersion) return false;
        const operations = comparableOperations(left.operations);
        const others = comparableOperations(right.operations);
        return operations.length === others.length && operations.every((operation, index) => {
          const other = others[index];
          if (ignore !== 'op' && operation.op !== other.op) return false;
          if (ignore !== 'key' && operation.key !== other.key) return false;
          if (ignore === 'value') return true;
          // The op-drop fault also forgets set/delete value presence.
          return operation.op !== 'set' || other.op !== 'set' || equals(operation.value, other.value);
        });
      };
      if (prior && same(prior.request, normalized)) return structuredClone(prior.receipt);
      const receipt = super.applyBatch(request);
      this.#accepted.set(normalized.requestId, { request: normalized, receipt: structuredClone(receipt) });
      return receipt;
    }
  });
}

export const payloadAlwaysEqual = identityMutant({ always: true });
export const signedZeroConflation = identityMutant({ equals: (left, right) => left === right });
export const droppedExpectedVersion = identityMutant({ ignore: 'expectedVersion' });
export const droppedKey = identityMutant({ ignore: 'key' });
export const droppedValue = identityMutant({ ignore: 'value' });
export const droppedType = identityMutant({ equals: (left, right) => String(left) === String(right) });
export const droppedOp = identityMutant({ ignore: 'op' });
export const droppedOrder = identityMutant({ unordered: true });

export const replayVersionIncrease = api(class extends reference.RuleService {
  #seen = new Set();
  applyBatch(request) {
    const receipt = super.applyBatch(request);
    if (this.#seen.has(request.requestId)) this.store.delete('__artificial_missing_key__');
    this.#seen.add(request.requestId);
    return receipt;
  }
});

export const partialCommitOnInvalid = api(class extends reference.RuleService {
  applyBatch(request) {
    try { return super.applyBatch(request); }
    catch (error) {
      if (error instanceof reference.RuleValidationError && Array.isArray(request?.operations)
          && request.operations.length > 1 && request.expectedVersion === this.store.version) {
        const first = request.operations[0];
        // Commit a valid prefix before propagating the later validation error.
        const prefix = reference.normalizeBatchRequest({
          requestId: request.requestId, expectedVersion: request.expectedVersion, operations: [first],
        }).operations[0];
        if (prefix.op === 'set') this.store.put(prefix.key, prefix.value);
        else this.store.delete(prefix.key);
      }
      throw error;
    }
  }
});

export const unicodeBatchLeak = api(class extends reference.RuleService {
  applyBatch(request) {
    if (!Array.isArray(request?.operations)) return super.applyBatch(request);
    return super.applyBatch({
      ...request,
      operations: request.operations.map(operation => ({ ...operation, key: canonicalizeKey(operation.key) })),
    });
  }
});

export const unicodeExistingKeyRewrite = api(reference.RuleService, class extends reference.RuleStore {
  _prepareBatchRules(rules) {
    return new Map([...rules].map(([key, value]) => [key.normalize('NFKC').toLowerCase(), value]));
  }
});

export const unicodeExistingKeyRemoval = api(reference.RuleService, class extends reference.RuleStore {
  _prepareBatchRules(rules) { return new Map([...rules].filter(([key]) => !/[^\x00-\x7f]/u.test(key))); }
});

export const unicodeExistingValueRewrite = api(reference.RuleService, class extends reference.RuleStore {
  _prepareBatchRules(rules) {
    return new Map([...rules].map(([key, value]) => [key,
      typeof value === 'string' ? value.normalize('NFKC') : value]));
  }
});

export const unicodeExistingValueRemoval = api(reference.RuleService, class extends reference.RuleStore {
  _prepareBatchRules(rules) {
    return new Map([...rules].filter(([, value]) => typeof value !== 'string' || !/[^\x00-\x7f]/u.test(value)));
  }
});

export const legacyUnicodeAliasBreak = api(class extends reference.RuleService {
  get(key) { return this.store.get(reference.canonicalizeBatchKey(key)); }
  put(key, value) { return super.put(reference.canonicalizeBatchKey(key), value); }
  delete(key) { return this.store.delete(reference.canonicalizeBatchKey(key)); }
});

export const mutants = Object.freeze({
  replayVersionIncrease, payloadAlwaysEqual, signedZeroConflation,
  droppedExpectedVersion, droppedKey, droppedValue, droppedType, droppedOp, droppedOrder,
  partialCommitOnInvalid, unicodeBatchLeak, unicodeExistingKeyRewrite, unicodeExistingKeyRemoval,
  unicodeExistingValueRewrite, unicodeExistingValueRemoval, legacyUnicodeAliasBreak,
});
