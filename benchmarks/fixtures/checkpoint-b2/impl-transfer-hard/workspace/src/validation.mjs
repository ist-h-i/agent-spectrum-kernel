import { TransferValidationError } from './errors.mjs';

export function validateAccountId(id) {
  if (typeof id !== 'string' || !/^acct_[a-z0-9]{4,16}$/.test(id)) {
    throw new TransferValidationError('Invalid account ID');
  }
  return id;
}

export function validatePositiveAmount(amount) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new TransferValidationError('Amount must be a positive safe integer');
  }
  return amount;
}

export function normalizeTransferRequest(_request) {
  throw new Error('Not implemented');
}
