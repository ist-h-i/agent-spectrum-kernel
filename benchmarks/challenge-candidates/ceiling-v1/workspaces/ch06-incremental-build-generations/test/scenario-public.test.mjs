import assert from 'node:assert/strict';
import { scenarioTest } from '../harness/scenario.mjs';

scenarioTest('ordinary cold build publishes both independent targets', {
  program: {
    steps: [
      { op: 'invoke', module: 'harness/compiler.mjs', export: 'createCompiler', args: [], as: 'compiler' },
      { op: 'invoke', module: 'harness/publisher.mjs', export: 'createPublisher', args: [], as: 'publisher' },
      {
        op: 'invoke', module: 'src/builder.mjs', export: 'createBuildSystem',
        args: [{ compiler: { $ref: 'compiler' }, publisher: { $ref: 'publisher' }, concurrency: 2 }], as: 'builder'
      },
      {
        op: 'call', target: 'builder', method: 'build',
        args: [{
          generation: 1,
          compilerVersion: 'local-compiler-1',
          config: { target: 'portable', optimize: false },
          files: {
            'apps/admin': { text: 'admin entry', imports: [], discover: [], globs: [] },
            'apps/shop': { text: 'shop entry', imports: [], discover: [], globs: [] }
          }
        }], as: 'result'
      },
      { op: 'call', target: 'publisher', method: 'latest', args: [], as: 'published' }
    ]
  },
  check(observations) {
    assert.ok(observations && typeof observations === 'object');
    const result = observations.result;
    assert.ok(result && typeof result === 'object' && !Array.isArray(result));
    assert.equal(result.generation, 1);
    assert.ok(result.results && typeof result.results === 'object' && !Array.isArray(result.results));
    assert.deepEqual(Object.keys(result.results).sort(), ['apps/admin', 'apps/shop']);
    for (const path of ['apps/admin', 'apps/shop']) {
      assert.equal(result.results[path]?.status, 'ok');
      assert.equal(typeof result.results[path]?.output, 'string');
    }
    assert.deepEqual(observations.published, result);
  }
});
