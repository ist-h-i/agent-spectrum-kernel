import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateScenario } from './scenario-protocol.mjs';

const mapArray = Function.call.bind(Array.prototype.map);

export async function executeScenario(input, capabilities, workspace = process.cwd()) {
  const program = validateScenario(input, capabilities), refs = new Map(), observations = Object.create(null), modules = new Map();
  let executed = 0;
  class ReturnValue { constructor(value) { this.value = value; } }
  function project(value) {
    if (value === undefined || typeof value === 'function') return null;
    if (typeof value === 'bigint') return String(value);
    if (value instanceof Map) return { size: value.size, entries: mapArray([...value], ([key, item]) => [project(key), project(item)]) };
    if (Array.isArray(value)) return mapArray(value, project);
    if (value && typeof value === 'object') {
      return Object.fromEntries(mapArray(Object.entries(value), ([key, item]) => [key, project(item)]));
    }
    return value;
  }
  function pathValue(value, path = []) {
    for (const key of path) {
      if (value === null || value === undefined || !Object.hasOwn(Object(value), key)) return undefined;
      value = value[key];
    }
    return value;
  }
  function resolveValue(value, callbackArgs = []) {
    if (!value || typeof value !== 'object') return value;
    if (Object.hasOwn(value, '$literal')) return structuredClone(value.$literal);
    if (Object.hasOwn(value, '$ref')) {
      const reference = refs.get(value.$ref);
      if (value.path?.length) return pathValue(projectField(reference, value.path[0]), value.path.slice(1));
      return reference.value;
    }
    if (Object.hasOwn(value, '$arg')) return pathValue(project(callbackArgs[value.$arg]), value.path);
    if (value.$callback) return (...args) => {
      try { for (const step of value.$callback) executeSync(step, args); }
      catch (error) { if (error instanceof ReturnValue) return error.value; throw error; }
    };
    if (Array.isArray(value)) return value.map(item => resolveValue(item, callbackArgs));
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveValue(item, callbackArgs)]));
  }
  function projectField(reference, key) {
    if (reference.kind === 'json') return reference.value != null && Object.hasOwn(Object(reference.value), key) ? reference.value[key] : undefined;
    if (!(capabilities.get?.[reference.kind] ?? []).includes(key)) throw new Error('nonpublic field');
    return project(reference.value?.[key]);
  }
  function scanValue(value) {
    if (!value || typeof value !== 'object' || Object.hasOwn(value, '$literal')) return;
    if (value.$callback) scanSteps(value.$callback);
    else for (const item of Object.values(value)) scanValue(item);
  }
  function scanSteps(steps) {
    for (const step of steps) {
      if (step.op === 'construct' || step.op === 'invoke') modules.set(step.module, null);
      scanValue(step.args); scanValue(step.value);
    }
  }
  scanSteps(program.steps);
  for (const name of modules.keys()) {
    const path = resolve(workspace, name);
    if (!path.startsWith(resolve(workspace) + sep)) throw new Error('module escape');
    try { modules.set(name, await import(pathToFileURL(path).href)); }
    catch (cause) { throw Object.assign(new Error('scenario service module unavailable'), { ceilingPhase: 'load', code: cause?.code ?? null }); }
  }
  function raw(step, args) {
    if (++executed > 4096) throw new Error('invalid scenario: executed operation budget');
    const inputs = () => (step.args ?? []).map(item => resolveValue(item, args));
    if (step.op === 'construct' || step.op === 'invoke') {
      const callable = modules.get(step.module)[step.export];
      return { value: step.op === 'construct' ? new callable(...inputs()) : callable(...inputs()), kind: capabilities.modules[step.module][step.op][step.export] };
    }
    if (step.op === 'call') {
      const target = refs.get(step.target);
      return { value: target.value[step.method](...inputs()), kind: capabilities.calls[target.kind][step.method] };
    }
    if (step.op === 'get') {
      const target = refs.get(step.target), path = step.path ?? [];
      if (!path.length && target.kind !== 'json') throw new Error('invalid scenario: opaque object');
      return { value: path.length ? pathValue(projectField(target, path[0]), path.slice(1)) : project(target.value), kind: 'json' };
    }
    if (step.op === 'release') return { value: refs.get(step.target).value(), kind: 'json' };
    if (step.op === 'await') return refs.get(step.target);
    if (step.op === 'dataset') return { value: JSON.parse(readFileSync(resolve(workspace, step.path), 'utf8')), kind: 'json' };
    if (step.op === 'record') return { value: step.append ? [...(refs.get(step.as)?.value ?? []), project(resolveValue(step.value, args))] : resolveValue(step.value, args), kind: 'json' };
    if (step.op === 'return') throw new ReturnValue(project(resolveValue(step.value, args)));
    if (step.op === 'raise') throw Object.assign(new Error(step.message), { code: step.code });
    throw new Error('unknown operation');
  }
  function store(step, value, kind) {
    if (!step.as) return;
    if (refs.has(step.as) && refs.get(step.as).kind !== kind) throw new Error('invalid scenario: alias kind is immutable');
    refs.set(step.as, { value: kind === 'json' ? project(value) : value, kind });
    observations[step.as] = kind === 'json' ? project(value) : null;
  }
  function executeSync(step, args) {
    try {
      const result = raw(step, args);
      if (result.value instanceof Promise && step.await !== false) throw new Error('async callback must use await:false');
      store(step, result.value, step.await === false ? 'promise:' + result.kind : result.kind);
    } catch (error) {
      if (error instanceof ReturnValue || !step.catch) throw error;
      store(step, { error: { name: error?.name ?? null, code: error?.code ?? null, message: error?.message ?? String(error) } }, 'json');
    }
  }
  for (const step of program.steps) {
    try {
      const result = raw(step, []), value = step.await === false ? result.value : await result.value;
      const kind = step.op === 'await' ? result.kind.replace(/^promise:/u, '') : result.kind;
      store(step, value, step.await === false ? 'promise:' + kind : kind);
    } catch (error) {
      if (!step.catch) {
        if (error?.message?.startsWith('invalid scenario:')) throw error;
        throw Object.assign(new Error('public API operation failed'), { ceilingPhase: 'operation', code: error?.code ?? null,
          ceilingObservations: observations, ceilingOperationIndex: executed });
      }
      store(step, { error: { name: error?.name ?? null, code: error?.code ?? null, message: error?.message ?? String(error) } }, 'json');
    }
  }
  return observations;
}
