import { createHash } from 'node:crypto';

export function createSink({ collect = true } = {}) {
  const outputs = [], rejections = [];
  const hash = createHash('sha256');
  let outputCount = 0, rejectionCount = 0;
  return {
    finalize(output) {
      const copy = structuredClone(output);
      hash.update(JSON.stringify(['output', copy]) + '\n');
      outputCount++;
      if (collect) outputs.push(copy);
    },
    reject(rejection) {
      const copy = structuredClone(rejection);
      hash.update(JSON.stringify(['reject', copy]) + '\n');
      rejectionCount++;
      if (collect) rejections.push(copy);
    },
    snapshot() { return { outputs: structuredClone(outputs), rejections: structuredClone(rejections), outputCount, rejectionCount, digest: hash.copy().digest('hex') }; }
  };
}
