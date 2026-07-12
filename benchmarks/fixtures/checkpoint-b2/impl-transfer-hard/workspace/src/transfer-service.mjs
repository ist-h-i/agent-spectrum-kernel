import { validateAccountId, validatePositiveAmount } from './validation.mjs';

export class TransferService {
  constructor(store) {
    this.store = store;
  }

  getAccount(id) {
    return this.store.getAccount(validateAccountId(id));
  }

  credit(id, amount) {
    return this.store.credit(validateAccountId(id), validatePositiveAmount(amount));
  }

  debit(id, amount) {
    return this.store.debit(validateAccountId(id), validatePositiveAmount(amount));
  }

  listTransfers() {
    return this.store.listTransfers();
  }

  async transfer(_request) {
    throw new Error('Not implemented');
  }
}
