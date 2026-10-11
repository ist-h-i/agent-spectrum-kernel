import { VersionConflictError } from './errors.mjs';

export class RuleStore {
  #rules = new Map();
  #version = 0;

  constructor(initialRules = {}) {
    for (const [key, value] of Object.entries(initialRules)) this.#rules.set(key, structuredClone(value));
  }

  get version() {
    return this.#version;
  }

  get(key) {
    return this.#rules.has(key) ? structuredClone(this.#rules.get(key)) : undefined;
  }

  list() {
    return Object.fromEntries([...this.#rules.entries()].map(([key, value]) => [key, structuredClone(value)]));
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
}
