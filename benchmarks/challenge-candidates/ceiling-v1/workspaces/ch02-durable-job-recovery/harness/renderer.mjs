import { createHash } from 'node:crypto';
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
export function payloadDigest(payload) { return createHash('sha256').update(canonical(payload)).digest('hex'); }
export function render(payload) {
  if (typeof payload.title !== 'string' || !Array.isArray(payload.rows)) {
    const error = new Error('invalid report'); error.code = 'PERMANENT'; throw error;
  }
  return canonical({ title: payload.title, rows: payload.rows });
}
