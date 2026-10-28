import { createHash } from 'node:crypto';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const match = (path, pattern) => {
  const pieces = pattern.split('*');
  if (pieces.length === 1) return path === pattern;
  if (pieces.length !== 2) throw new Error('Only one * is supported');
  return path.length >= pieces[0].length + pieces[1].length &&
    path.startsWith(pieces[0]) && path.endsWith(pieces[1]) &&
    !path.slice(pieces[0].length, path.length - pieces[1].length).includes('/');
};

export function inspect(snapshot, path) {
  const file = snapshot.files[path];
  if (!file) return { imports: [], globMatches: [] };
  return {
    imports: [...new Set(file.imports ?? [])].sort(),
    globMatches: [...new Set((file.globs ?? []).flatMap(pattern => Object.keys(snapshot.files).filter(name => match(name, pattern))))].sort()
  };
}

export function createCompiler({ manual = false } = {}) {
  let sequence = 0, active = 0, peakActive = 0;
  const pending = new Map(), calls = [];
  function evaluate({ snapshot, path, dependencies }) {
    const file = snapshot.files[path];
    if (!file) return { status: 'failed', reason: 'missing_source', path };
    if (file.fail) return { status: 'failed', reason: 'compile_error', path };
    const visible = inspect(snapshot, path);
    const required = [...new Set([...visible.imports, ...visible.globMatches, ...(file.discover ?? [])])].sort();
    const missingSource = required.find(name => !snapshot.files[name]);
    if (missingSource) return { status: 'failed', reason: 'missing_dependency', path: missingSource };
    const needed = required.filter(name => typeof dependencies[name] !== 'string');
    if (needed.length) return { status: 'dependencies', paths: required };
    return { status: 'ok', output: digest({ ...(snapshot.projectId&&snapshot.projectId!=='default'?{projectId:snapshot.projectId}:{}), path, text: file.text, compilerVersion: snapshot.compilerVersion,
      config: snapshot.config, dependencies: required.map(name => [name, dependencies[name]]) }), dependencies: required };
  }
  const api = {
    inspect,
    compile(request) {
      const copy = structuredClone(request);
      const id = ++sequence;
      active++;
      peakActive = Math.max(peakActive, active);
      calls.push({ id, projectId:copy.snapshot.projectId??'default', generation: copy.snapshot.generation, path: copy.path });
      if (!manual) {
        active--;
        return Promise.resolve(evaluate(copy));
      }
      return new Promise(resolve => pending.set(id, { request: copy, resolve }));
    },
    pending() { return [...pending].map(([id, item]) => ({ id, projectId:item.request.snapshot.projectId??'default', generation: item.request.snapshot.generation, path: item.request.path })); },
    complete(id) {
      const item = pending.get(id);
      if (!item) throw new Error(`No pending compile ${id}`);
      pending.delete(id);
      active--;
      item.resolve(evaluate(item.request));
    },
    observation() { return { calls: structuredClone(calls), active, peakActive }; }
  };
  return api;
}
