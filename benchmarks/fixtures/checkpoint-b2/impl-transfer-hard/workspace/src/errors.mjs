export class TransferValidationError extends Error {
  constructor(message) { super(message); this.name = 'TransferValidationError'; this.code = 'TRANSFER_VALIDATION'; }
}

export class AccountNotFoundError extends Error {
  constructor(id) { super(`Account ${id} not found`); this.name = 'AccountNotFoundError'; this.code = 'ACCOUNT_NOT_FOUND'; this.accountId = id; }
}

export class InsufficientFundsError extends Error {
  constructor() { super('Insufficient funds'); this.name = 'InsufficientFundsError'; this.code = 'INSUFFICIENT_FUNDS'; }
}

export class VersionConflictError extends Error {
  constructor() { super('Account version conflict'); this.name = 'VersionConflictError'; this.code = 'VERSION_CONFLICT'; }
}
