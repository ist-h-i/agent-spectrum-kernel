const clone = value => structuredClone(value);
export const jobKey = (tenantId, requestId) => JSON.stringify([tenantId, requestId]);
export class DurableStore {
  #jobs = new Map();
  #now = 0;
  now() { return this.#now; }
  advance(ms) { if (!Number.isSafeInteger(ms) || ms < 0) throw new Error('invalid clock'); this.#now += ms; }
  read(key) { return clone(this.#jobs.get(key) ?? null); }
  scan() { return [...this.#jobs.values()].map(clone); }
  putIfAbsent(key, value) {
    if (this.#jobs.has(key)) return { inserted: false, job: this.read(key) };
    this.#jobs.set(key, { ...clone(value), key, version: 1 });
    return { inserted: true, job: this.read(key) };
  }
  cas(key, version, value) {
    if (this.#jobs.get(key)?.version !== version) return false;
    this.#jobs.set(key, { ...clone(value), key, version: version + 1 }); return true;
  }
  transaction(fn) {
    const backup = clone(this.#jobs);
    try {
      const result = fn(this);
      if (result?.then) throw new Error('transaction must be synchronous');
      return result;
    } catch (error) { this.#jobs = backup; throw error; }
  }
}
