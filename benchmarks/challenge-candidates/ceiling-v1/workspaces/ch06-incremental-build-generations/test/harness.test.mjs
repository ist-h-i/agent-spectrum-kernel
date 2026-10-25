import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompiler } from '../harness/compiler.mjs';
import { nextSnapshot } from '../harness/watch.mjs';

test('compiler exposes imports, glob membership and compile-time dependencies', async () => {
  const compiler = createCompiler();
  const snapshot = { generation: 1, compilerVersion: '1', config: {}, files: {
    'app': { text: 'entry', imports: ['lib/a'], globs: ['plugins/*'], discover: ['generated/x'] },
    'lib/a': { text: 'library' }, 'plugins/p': { text: 'plugin' }, 'generated/x': { text: 'generated' }
  } };
  assert.deepEqual(compiler.inspect(snapshot, 'app'), { imports: ['lib/a'], globMatches: ['plugins/p'] });
  assert.deepEqual(await compiler.compile({ snapshot, path: 'app', dependencies: {} }), {
    status: 'dependencies', paths: ['generated/x', 'lib/a', 'plugins/p']
  });
  const output = await compiler.compile({ snapshot, path: 'app', dependencies: { 'generated/x': 'x', 'lib/a': 'a', 'plugins/p': 'p' } });
  assert.equal(output.status, 'ok');
  assert.match(output.output, /^[a-f0-9]{64}$/);
});

test('watch changes create independent snapshots and deletion changes glob membership', () => {
  const before = { generation: 1, compilerVersion: '1', config: {}, files: {
    app: { text: 'app', globs: ['plugins/*'] }, 'plugins/p': { text: 'p' }
  } };
  const after = nextSnapshot(before, { generation: 2, delete: 'plugins/p' });
  assert.equal(before.files['plugins/p'].text, 'p');
  assert.deepEqual(createCompiler().inspect(after, 'app').globMatches, []);
});
