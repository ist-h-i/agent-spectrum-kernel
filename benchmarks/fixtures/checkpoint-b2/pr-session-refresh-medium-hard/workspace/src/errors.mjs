export class AuthError extends Error {
  constructor(message = 'Authentication failed') {
    super(message);
    this.name = 'AuthError';
    this.code = 'AUTH_FAILED';
  }
}

export class StaleSessionError extends AuthError {
  constructor() {
    super('Refresh token was already rotated');
    this.name = 'StaleSessionError';
    this.code = 'STALE_SESSION';
  }
}
