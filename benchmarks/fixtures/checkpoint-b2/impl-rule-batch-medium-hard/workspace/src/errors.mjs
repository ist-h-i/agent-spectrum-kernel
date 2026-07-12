export class RuleValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RuleValidationError';
    this.code = 'RULE_VALIDATION';
  }
}

export class VersionConflictError extends Error {
  constructor(expected, actual) {
    super(`Expected version ${expected}, got ${actual}`);
    this.name = 'VersionConflictError';
    this.code = 'VERSION_CONFLICT';
    this.expected = expected;
    this.actual = actual;
  }
}
