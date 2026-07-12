import { RuleValidationError } from './errors.mjs';

export function canonicalizeKey(key) {
  if (typeof key !== 'string') throw new RuleValidationError('Key must be a string');
  const canonical = key.trim().toLowerCase();
  if (!/^[a-z][a-z0-9._-]{0,31}$/.test(canonical)) {
    throw new RuleValidationError('Invalid rule key');
  }
  return canonical;
}

export function validateScalar(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new RuleValidationError('Value must be a documented scalar');
}

export function normalizeBatchRequest(_request) {
  throw new Error('Not implemented');
}
