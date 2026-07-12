import { AuthorizationError, JobConflictError, JobNotFoundError } from './errors.mjs';

export function createRetryHandler(service) {
  return function retryHandler(request) {
    try {
      return { status: 200, body: service.retry(request.params.id, request.principal) };
    } catch (error) {
      if (error instanceof AuthorizationError) return { status: 403, body: { error: error.code } };
      if (error instanceof JobNotFoundError) return { status: 404, body: { error: error.code } };
      if (error instanceof JobConflictError) return { status: 409, body: { error: error.code } };
      return { status: 500, body: { error: 'INTERNAL' } };
    }
  };
}
