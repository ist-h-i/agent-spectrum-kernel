export class AccountStore {
  #accounts = new Map();

  constructor(accounts = []) {
    for (const account of accounts) this.#accounts.set(account.id, structuredClone(account));
  }

  getById(id) {
    const account = this.#accounts.get(id);
    return account ? structuredClone(account) : null;
  }

  update(id, patch) {
    const current = this.#accounts.get(id);
    if (!current) return null;
    const next = { ...current, ...structuredClone(patch) };
    this.#accounts.set(id, next);
    return structuredClone(next);
  }
}
