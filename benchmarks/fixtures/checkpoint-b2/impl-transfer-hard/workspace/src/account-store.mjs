import { AccountNotFoundError, InsufficientFundsError } from './errors.mjs';
import { SerialExecutor } from './serial-executor.mjs';

export class AccountStore {
  #accounts = new Map();
  #transfers = [];
  #executor = new SerialExecutor();

  constructor(accounts = [], { auditSink = async () => {} } = {}) {
    for (const account of accounts) this.#accounts.set(account.id, structuredClone(account));
    this.auditSink = auditSink;
  }

  getAccount(id) {
    const account = this.#accounts.get(id);
    return account ? structuredClone(account) : null;
  }

  listTransfers() {
    return structuredClone(this.#transfers);
  }

  runExclusive(operation) {
    return this.#executor.run(operation);
  }

  credit(id, amount) {
    const account = this.#accounts.get(id);
    if (!account) throw new AccountNotFoundError(id);
    account.balance += amount;
    account.version += 1;
    return this.getAccount(id);
  }

  debit(id, amount) {
    const account = this.#accounts.get(id);
    if (!account) throw new AccountNotFoundError(id);
    if (account.balance - amount < account.minBalance) throw new InsufficientFundsError();
    account.balance -= amount;
    account.version += 1;
    return this.getAccount(id);
  }
}
