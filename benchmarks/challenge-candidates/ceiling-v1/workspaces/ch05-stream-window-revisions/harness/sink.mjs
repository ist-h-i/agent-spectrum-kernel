import { createHash } from 'node:crypto';
import { safeData, safeStringify } from './safe-json.mjs';
const clone = structuredClone;
const hashFactory = createHash;
const hashPrototype = Object.getPrototypeOf(hashFactory('sha256'));
const updateHash = Function.call.bind(hashPrototype.update);
const copyHash = Function.call.bind(hashPrototype.copy);
const digestHash = Function.call.bind(hashPrototype.digest);

export function createSink({ collect = true } = {}) {
  const outputs = [], rejections = [];
  const hash = hashFactory('sha256');
  let outputCount = 0, rejectionCount = 0;
  return {
    finalize(output) {
      const copy = clone(safeData(output));
      updateHash(hash, safeStringify(['output', copy]) + '\n');
      outputCount++;
      if (collect) outputs.push(copy);
    },
    reject(rejection) {
      const copy = clone(safeData(rejection));
      updateHash(hash, safeStringify(['reject', copy]) + '\n');
      rejectionCount++;
      if (collect) rejections.push(copy);
    },
    snapshot() { return { outputs: clone(outputs), rejections: clone(rejections), outputCount, rejectionCount, digest: digestHash(copyHash(hash), 'hex') }; }
  };
}
