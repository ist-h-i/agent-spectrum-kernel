import { createHash } from 'node:crypto';
import {safeStringify} from './safe-json.mjs';
const clone=structuredClone,maximum=Math.max,freeze=Object.freeze,append=Function.call.bind(Array.prototype.push),hashFactory=createHash;
const hashPrototype=Object.getPrototypeOf(hashFactory('sha256'));
const updateHash=Function.call.bind(hashPrototype.update),digestHash=Function.call.bind(hashPrototype.digest);
const MapType=Map,mapSet=Function.call.bind(Map.prototype.set),mapGet=Function.call.bind(Map.prototype.get),mapDelete=Function.call.bind(Map.prototype.delete);
const mapEntries=Function.call.bind(Map.prototype.entries),iteratorNext=Function.call.bind(Object.getPrototypeOf(new Map().entries()).next);

const digest=value=>{const hash=hashFactory('sha256');updateHash(hash,safeStringify(value));return digestHash(hash,'hex');};
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
  const pending = new MapType(), calls = [];
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
      const copy = clone(request);
      const id = ++sequence;
      active++;
      peakActive = maximum(peakActive, active);
      append(calls,{ id, projectId:copy.snapshot.projectId??'default', generation: copy.snapshot.generation, path: copy.path });
      if (!manual) {
        active--;
        return Promise.resolve(evaluate(copy));
      }
      return new Promise(resolve => mapSet(pending,id, { request: copy, resolve }));
    },
    pending() {const rows=[],iterator=mapEntries(pending);for(;;){const next=iteratorNext(iterator);if(next.done)break;const [id,item]=next.value;append(rows,{id,projectId:item.request.snapshot.projectId??'default',generation:item.request.snapshot.generation,path:item.request.path});}return rows;},
    complete(id) {
      const item = mapGet(pending,id);
      if (!item) throw new Error(`No pending compile ${id}`);
      mapDelete(pending,id);
      active--;
      item.resolve(evaluate(item.request));
    },
    observation() { return { calls: clone(calls), active, peakActive }; }
  };
  return freeze(api);
}
