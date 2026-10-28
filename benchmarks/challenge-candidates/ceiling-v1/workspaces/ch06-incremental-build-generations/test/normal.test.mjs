import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBuildSystem } from '../src/builder.mjs';
import { createCompiler } from '../harness/compiler.mjs';
import { createPublisher } from '../harness/publisher.mjs';
import { buildView } from '../harness/consumer.mjs';
import { drain } from '../harness/scheduler.mjs';

const input = () => JSON.parse(readFileSync(new URL('../data/monorepo.json', import.meta.url)));

test('normal build publishes fixed consumer results and reuses identical inputs', async () => {
  const compiler = createCompiler();
  const publisher = createPublisher();
  const builder = createBuildSystem({ compiler, publisher, concurrency: 2 });
  const first = await builder.build(input());
  assert.deepEqual(buildView(publisher), { generation: 1, successful: ['apps/admin', 'apps/shop'], failed: [] });
  assert.equal(compiler.observation().calls.length, 2);
  const second = await builder.build({ ...input(), generation: 2 });
  assert.deepEqual(second.results, first.results);
  assert.equal(compiler.observation().calls.length, 2);
});

test('manual compiler completion is deterministic', async () => {
  const compiler = createCompiler({ manual: true });
  const publisher = createPublisher();
  const builder = createBuildSystem({ compiler, publisher, concurrency: 1 });
  const result = builder.build(input());
  assert.equal(publisher.latest(), null);
  await drain(compiler);
  assert.equal((await result).generation, 1);
  assert.equal(compiler.observation().peakActive, 1);
});
