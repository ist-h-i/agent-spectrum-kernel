import { canonicalizeKey, validateScalar } from './validation.mjs';

export class RuleService {
  constructor(store) {
    this.store = store;
  }

  get(key) {
    return this.store.get(canonicalizeKey(key));
  }

  list() {
    return this.store.list();
  }

  put(key, value) {
    return this.store.put(canonicalizeKey(key), validateScalar(value));
  }

  delete(key) {
    return this.store.delete(canonicalizeKey(key));
  }

  applyBatch(_request) {
    throw new Error('Not implemented');
  }
}
