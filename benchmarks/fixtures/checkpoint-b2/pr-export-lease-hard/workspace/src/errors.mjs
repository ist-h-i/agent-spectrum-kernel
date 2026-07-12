export class JobNotFoundError extends Error {
  constructor() { super('Job not found'); this.name = 'JobNotFoundError'; this.code = 'JOB_NOT_FOUND'; }
}

export class JobConflictError extends Error {
  constructor(message = 'Job state conflict') { super(message); this.name = 'JobConflictError'; this.code = 'JOB_CONFLICT'; }
}

export class AuthorizationError extends Error {
  constructor() { super('Forbidden'); this.name = 'AuthorizationError'; this.code = 'FORBIDDEN'; }
}
