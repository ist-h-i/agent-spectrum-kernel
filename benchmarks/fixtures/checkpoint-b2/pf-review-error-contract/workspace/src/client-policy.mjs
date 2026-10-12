export function consumeError(response, request) {
 const label = response.status === 404 ? 'missing' : response.status === 409 ? 'conflict' : response.status >= 500 ? 'service' : 'other';
 const retry = request.method === 'GET' && response.body.error.retryable === true && request.attempt < request.maximumAttempts;
 const raw = response.headers['Retry-After'];
 const seconds = raw === undefined ? null : Number(raw);
 const delayMs = retry ? seconds !== null && Number.isInteger(seconds) && seconds >= 0 ? seconds * 1000 : 1000 : null;
 return {label, retry, delayMs};
}
