export function responseFromFault(fault) {
 const known = fault.kind === 'missing_record' || fault.kind === 'temporary_unavailable';
 const code = known ? fault.kind : 'internal_error';
 const message = known ? fault.publicMessage : 'The request could not be completed';
 const retryable = fault.kind === 'temporary_unavailable';
 const status = fault.kind === 'missing_record' ? 409 : fault.kind === 'temporary_unavailable' ? 503 : 500;
 const headers = {};
 if (retryable && fault.retryAfterSeconds) headers['Retry-After'] = String(fault.retryAfterSeconds);
 return {status, headers, body: {error: {code, message, retryable}}};
}
