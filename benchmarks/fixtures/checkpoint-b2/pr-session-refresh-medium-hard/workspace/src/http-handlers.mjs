import { AuthError, StaleSessionError } from './errors.mjs';

export function createLoginHandler(authService) {
  return async function loginHandler(request) {
    try {
      const result = await authService.login(request.body?.accountId);
      return { status: 200, body: result };
    } catch (error) {
      if (error instanceof AuthError) return { status: 401, body: { error: error.code } };
      return { status: 500, body: { error: 'INTERNAL' } };
    }
  };
}

export function createRefreshHandler(authService) {
  return async function refreshHandler(request) {
    try {
      const result = await authService.refresh(request.body?.refreshToken);
      return { status: 200, headers: { 'cache-control': 'no-store' }, body: result };
    } catch (error) {
      if (error instanceof AuthError || error instanceof StaleSessionError) {
        return { status: 401, body: { error: error.code } };
      }
      return { status: 500, body: { error: 'INTERNAL' } };
    }
  };
}
