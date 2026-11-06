import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { executeScenario } from '../runtime/scenario-engine.mjs';
import { validateScenario } from '../runtime/scenario-protocol.mjs';
import { candidates, root } from './public-workspace.mjs';

test('all six capability tables reject native modules, reflection and opaque data injection', () => {
  for (const { id } of candidates()) {
    const caps = JSON.parse(readFileSync(resolve(root, 'runtime/capabilities', id + '.json')));
    assert.throws(() => validateScenario({ steps: [{ op: 'invoke', module: 'node:fs', export: 'readFileSync', args: ['/private/oracle'] }] }, caps), /module\/export/u);
    const [module, exports] = Object.entries(caps.modules).find(([, value]) => Object.keys(value.construct ?? {}).length || Object.keys(value.invoke ?? {}).length);
    const op = Object.keys(exports.construct ?? {}).length ? 'construct' : 'invoke';
    const [name, kind] = Object.entries(exports[op])[0];
    const create = { op, module, export: name, args: [], as: 'instance' };
    for (const method of ['constructor', 'toString', 'valueOf', '__defineGetter__']) assert.throws(() => validateScenario({ steps: [create, { op: 'call', target: 'instance', method }] }, caps), /method not public/u);
    assert.throws(() => validateScenario({ steps: [create, { op: 'get', target: 'instance', path: ['constructor'], as: 'f' }] }, caps), /unsafe data path/u);
    if (kind !== 'json') assert.throws(() => validateScenario({ steps: [create, { op: 'record', value: { $ref: 'instance' }, as: 'leak' }] }, caps), /opaque reference/u);
    assert.throws(() => validateScenario({ steps: [{ op: 'dataset', path: '../src/answer.mjs', as: 'source' }] }, caps), /dataset not public/u);
    assert.throws(() => validateScenario({ steps: Array.from({ length: 1025 }, () => ({ op: 'record', value: 0, as: 'n' })) }, caps), /step bound/u);
  }
});

test('an unexecuted callback cannot relabel an opaque reference as JSON', async () => {
  const parent = mkdtempSync(resolve(realpathSync(tmpdir()), 'ceiling-opaque-alias-'));
  try {
    writeFileSync(resolve(parent, 'example.mjs'), `export class Example {
      constructor(){this.secret='private implementation state';}
      defer(callback){this.saved=callback;}
    }`);
    const caps = { version: 'ceiling-scenario-v1', modules: { 'example.mjs': { construct: { Example: 'example' } } },
      calls: { example: { defer: 'json' } }, get: { example: [] }, references: {}, datasets: [] };
    const program = { steps: [
      { op: 'construct', module: 'example.mjs', export: 'Example', as: 'instance' },
      { op: 'call', target: 'instance', method: 'defer', args: [{ $callback: [
        { op: 'record', value: 0, as: 'instance' },
      ] }] },
      { op: 'record', value: { $ref: 'instance' }, as: 'leak' },
    ] };
    assert.throws(() => validateScenario(program, caps), /invalid scenario:.*alias/u);
    await assert.rejects(executeScenario(program, caps, parent), /invalid scenario:.*alias/u);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

test('JSON observations, finite callbacks and release do not expose executable references', async () => {
  const parent = mkdtempSync(resolve(realpathSync(tmpdir()), 'ceiling-protocol-unit-'));
  try {
    mkdirSync(resolve(parent, 'src'));
    writeFileSync(resolve(parent, 'src/example.mjs'), `export class Example {
      constructor(value){this.seen=value;}
      value(){return this.seen;}
      run(callback){return callback(4);}
      subscribe(){return ()=>{this.seen='released';};}
      functionValue(){return function privateFunction(){return 'source must not be exposed';};}
      loop(callback){for(let i=0;i<10000;i++)callback();}
    }`);
    const caps = { version: 'ceiling-scenario-v1', modules: { 'src/example.mjs': { construct: { Example: 'example' } } },
      calls: { example: { value: 'json', run: 'json', subscribe: 'unsubscribe', functionValue: 'json', loop: 'json' } },
      get: { example: ['seen'] }, functionKinds: ['unsubscribe'], references: {}, datasets: [] };
    const create = { op: 'construct', module: 'src/example.mjs', export: 'Example', args: [{ $literal: { module: 'not-an-import.mjs' } }], as: 'example' };
    const observations = await executeScenario({ steps: [create,
      { op: 'call', target: 'example', method: 'value', as: 'data' },
      { op: 'call', target: 'example', method: 'run', args: [{ $callback: [{ op: 'record', value: { $arg: 0 }, as: 'argument' }, { op: 'return', value: { $arg: 0 } }] }], as: 'returned' },
      { op: 'call', target: 'example', method: 'functionValue', as: 'functionData' },
      { op: 'call', target: 'example', method: 'subscribe', as: 'unsubscribe' },
      { op: 'release', target: 'unsubscribe' },
      { op: 'get', target: 'example', path: ['seen'], as: 'released' },
    ] }, caps, parent);
    assert.deepEqual(observations.data, { module: 'not-an-import.mjs' });
    assert.equal(observations.argument, 4); assert.equal(observations.returned, 4);
    assert.equal(observations.functionData, null); assert.equal(observations.released, 'released');
    assert.throws(() => validateScenario({ steps: [create, { op: 'call', target: 'example', method: 'subscribe', as: 'unsubscribe' }, { op: 'call', target: 'example', method: 'run', args: [{ $ref: 'unsubscribe' }] }] }, caps), /opaque reference/u);
    await assert.rejects(executeScenario({ steps: [create, { op: 'call', target: 'example', method: 'loop', args: [{ $callback: [{ op: 'record', value: 1, as: 'n' }] }] }] }, caps, parent), /executed operation budget/u);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});
