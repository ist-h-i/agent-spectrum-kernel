// Public execution adapter. It receives inputs, never expected outputs or grading rules.
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd(), program = JSON.parse(readFileSync(0, 'utf8'));
const modules = new Map(), refs = new Map(), observations = {};
function scan(value) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.module === 'string') modules.set(value.module, null);
  for (const child of Object.values(value)) scan(child);
}
scan(program);
for (const name of modules.keys()) {
  const path = resolve(root, name);
  if (!path.startsWith(root + sep) || !name.endsWith('.mjs')) throw new Error('module outside workspace');
  modules.set(name, await import(pathToFileURL(path).href));
}
function snapshot(value) {
  if (value === undefined || typeof value === 'function' || value instanceof Promise) return null;
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return null;
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? String(item) : item));
}
function pathValue(value, path = []) { for (const key of path) value = value?.[key]; return value; }
function value(input, args = []) {
  if (!input || typeof input !== 'object') return input;
  if (Object.hasOwn(input, '$ref')) {
    if (!refs.has(input.$ref)) throw new Error(`unknown ref ${input.$ref}`);
    return pathValue(refs.get(input.$ref), input.path);
  }
  if (Object.hasOwn(input, '$arg')) return pathValue(args[input.$arg], input.path);
  if (input.$callback) return (...callbackArgs) => { for (const step of input.$callback) executeSync(step, callbackArgs); };
  if (Array.isArray(input)) return input.map(item => value(item, args));
  return Object.fromEntries(Object.entries(input).map(([key, item]) => [key, value(item, args)]));
}
function raw(step, args) {
  const inputs = () => (step.args ?? []).map(item => value(item, args));
  if (step.op === 'construct') return new (modules.get(step.module)[step.export])(...inputs());
  if (step.op === 'invoke') return modules.get(step.module)[step.export](...inputs());
  if (step.op === 'call') return refs.get(step.target)[step.method](...inputs());
  if (step.op === 'get') return pathValue(refs.get(step.target), step.path);
  if (step.op === 'await') return refs.get(step.target);
  if (step.op === 'record') {
    const next = snapshot(value(step.value, args));
    return step.append ? [...(refs.get(step.as) ?? []), next] : next;
  }
  throw new Error(`unknown operation ${step.op}`);
}
function store(step, result) {
  if (step.as) { refs.set(step.as, result); observations[step.as] = snapshot(result); }
}
function errorResult(error) { return { error: { name: error.name, code: error.code ?? null, message: error.message } }; }
function executeSync(step, args = []) {
  try { store(step, raw(step, args)); }
  catch (error) { if (!step.catch) throw error; store(step, errorResult(error)); }
}
try {
  for (const step of program.steps) {
    try {
      const result = raw(step, []);
      store(step, step.await === false ? result : await result);
    } catch (error) { if (!step.catch) throw error; store(step, errorResult(error)); }
  }
  process.stdout.write(JSON.stringify({ status: 'completed', observations }) + '\n');
} catch (error) {
  process.stdout.write(JSON.stringify({ status: 'execution_error', error: errorResult(error), observations }) + '\n');
  process.exitCode = 1;
}
