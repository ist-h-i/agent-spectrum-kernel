const clone = value => structuredClone(value);
export class IdempotentSink {
  #entries = new Map();
  #lost = new Set();
  loseNextReply(method = 'put') { this.#lost.add(method); }
  #reply(method, result) {
    if (this.#lost.delete(method)) { const error = new Error('sink reply lost'); error.code = 'RETRYABLE'; throw error; }
    return clone(result);
  }
  lookup(key) { return clone(this.#entries.get(key) ?? null); }
  putIfAbsent(key, digest, bytes) {
    const existing = this.#entries.get(key);
    let result;
    if (existing?.status === 'closed') result = { status: 'closed' };
    else if (existing) result = existing.digest === digest ? existing : { status: 'conflict' };
    else { result = { status: 'stored', receipt: `receipt:${key}`, digest, bytes }; this.#entries.set(key, result); }
    return this.#reply('put', result);
  }
  closeIfAbsent(key) {
    const existing = this.#entries.get(key);
    if (existing) return this.#reply('close', existing);
    const result = { status: 'closed' }; this.#entries.set(key, result); return this.#reply('close', result);
  }
  entries() { return [...this.#entries].map(([key, value]) => ({ key, ...clone(value) })); }
}
