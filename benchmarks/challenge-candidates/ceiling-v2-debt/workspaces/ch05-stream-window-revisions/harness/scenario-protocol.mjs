import { createHash } from 'node:crypto';

export const protocolVersion = 'ceiling-scenario-v1';
const forbidden = new Set(['__proto__', 'prototype', 'constructor', 'toString', 'valueOf', 'caller', 'callee', 'arguments']);
const own = (object, key) => object != null && Object.hasOwn(object, key);
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
export const scenarioDigest = value => 'sha256:' + createHash('sha256').update(canonical(value)).digest('hex');
function fail(message) { throw new Error(`invalid scenario: ${message}`); }
const safeName = name => typeof name === 'string' && /^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/u.test(name) && !forbidden.has(name);
function safePath(path) {
  if (!Array.isArray(path) || path.length > 32 || path.some(key => !(typeof key === 'string' && !forbidden.has(key)) && !(Number.isSafeInteger(key) && key >= 0))) fail('unsafe data path');
}

export function validateScenario(input, capabilities) {
  if (capabilities.version !== protocolVersion) fail('capability version');
  const serialized = JSON.stringify(input, (_key, value) => {
    if (['function', 'symbol', 'bigint', 'undefined'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) fail('JSON data only');
    return value;
  });
  if (!serialized || Buffer.byteLength(serialized) > 524288) fail('input size');
  const program = JSON.parse(serialized), aliases = new Map(); let count = 0;
  if (!program || !Array.isArray(program.steps)) fail('steps required');
  const kinds = new Set(['json', ...(capabilities.functionKinds ?? []), ...Object.keys(capabilities.calls)]);
  function reference(descriptor) {
    if (!safeName(descriptor.$ref) || !aliases.has(descriptor.$ref)) fail('unknown reference');
    const kind = aliases.get(descriptor.$ref), path = descriptor.path ?? []; safePath(path);
    if (path.length) {
      if (kind !== 'json' && !(capabilities.get?.[kind] ?? []).includes(path[0])) fail('nonpublic field');
      return 'json';
    }
    return kind;
  }
  function values(value, pointer, operation, callback, depth = 0) {
    if (depth > 32) fail('value nesting');
    if (!value || typeof value !== 'object') return;
    if (own(value, '$literal')) return;
    if (own(value, '$ref')) {
      const kind = reference(value);
      if (kind !== 'json' && capabilities.references?.[operation]?.[pointer] !== kind) fail('opaque reference outside approved injection point');
      return;
    }
    if (own(value, '$arg')) {
      if (!callback || !Number.isSafeInteger(value.$arg) || value.$arg < 0 || value.$arg > 31) fail('callback argument');
      safePath(value.path ?? []); return;
    }
    if (own(value, '$callback')) { steps(value.$callback, true); return; }
    for (const [key, item] of Object.entries(value)) values(item, pointer + '/' + key.replaceAll('~', '~0').replaceAll('/', '~1'), operation, callback, depth + 1);
  }
  function steps(list, callback = false) {
    if (!Array.isArray(list)) fail('callback steps');
    for (const step of list) {
      if (++count > 1024 || !step || typeof step !== 'object' || Array.isArray(step)) fail('step bound/type');
      if (step.as !== undefined && !safeName(step.as)) fail('alias');
      if (step.await !== undefined && typeof step.await !== 'boolean') fail('await flag');
      if (step.catch !== undefined && typeof step.catch !== 'boolean') fail('catch flag');
      let result = 'json', operation = step.op;
      if (step.op === 'construct' || step.op === 'invoke') {
        if (!own(capabilities.modules, step.module) || !own(capabilities.modules[step.module][step.op], step.export)) fail('module/export not public');
        result = capabilities.modules[step.module][step.op][step.export]; operation += ':' + step.module + ':' + step.export;
      } else if (step.op === 'call') {
        const kind = aliases.get(step.target);
        if (!own(capabilities.calls?.[kind], step.method)) fail('method not public');
        result = capabilities.calls[kind][step.method]; operation += ':' + kind + ':' + step.method;
      } else if (step.op === 'get') {
        reference({ $ref: step.target, path: step.path ?? [] });
        if (aliases.get(step.target) !== 'json' && !(step.path?.length)) fail('opaque get requires a public field');
      }
      else if (step.op === 'release') {
        if (!(capabilities.functionKinds ?? []).includes(aliases.get(step.target))) fail('release target');
        if (step.args?.length) fail('release has no arguments');
      } else if (step.op === 'await') {
        const kind = aliases.get(step.target);
        if (!kind?.startsWith('promise:')) fail('await target');
        result = kind.slice(8);
      } else if (step.op === 'dataset') {
        if (!(capabilities.datasets ?? []).includes(step.path)) fail('dataset not public');
      } else if (step.op === 'record') values(step.value, '', operation, callback);
      else if (step.op === 'return') {
        if (!callback) fail('return outside callback'); values(step.value, '', operation, callback);
      } else if (step.op === 'raise') {
        if (!callback || !['RETRYABLE', 'PERMANENT', 'PROCESS_CRASH'].includes(step.code) || typeof step.message !== 'string' || step.message.length > 256) fail('typed callback error');
      } else fail('unknown operation');
      if (!kinds.has(result)) fail('unknown result kind');
      if (step.args !== undefined && !Array.isArray(step.args)) fail('arguments');
      values(step.args ?? [], '', operation, callback);
      if (step.as) {
        const kind = step.await === false ? 'promise:' + result : result;
        if (aliases.has(step.as) && aliases.get(step.as) !== kind) fail('alias kind is immutable');
        aliases.set(step.as, kind);
      }
    }
  }
  steps(program.steps);
  return program;
}
