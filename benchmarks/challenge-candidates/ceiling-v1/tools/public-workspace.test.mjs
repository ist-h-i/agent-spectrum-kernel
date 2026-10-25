import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { candidates, executionAdapterDigest, freeze, prepare, root, verify } from './public-workspace.mjs';

test('all six public seeds prepare, run and freeze separately from portfolio', () => {
  assert.equal(Number(process.versions.node.split('.')[0]), 24, 'controller requires Node 24; fixture runtime is independently qualified');
  assert.equal(candidates().length, 6);
  for (const { id } of candidates()) {
    const temp = mkdtempSync(resolve(realpathSync(tmpdir()), 'ceiling-public-'));
    try {
      const workspace = resolve(temp, 'workspace');
      const receipt = prepare(id, workspace);
      assert.equal(receipt.ready_for_measurement, false);
      assert.equal(existsSync(resolve(workspace, '.git')), false);
      assert.equal(existsSync(resolve(workspace, 'catalog.json')), false);
      assert.equal(existsSync(resolve(workspace, 'tools')), false);
      assert.ok(readFileSync(resolve(workspace, 'task.md'), 'utf8').includes('公開契約'));
      execFileSync(process.execPath, ['--test'], { cwd: workspace, timeout: 30_000, encoding: 'utf8', env: { PATH: process.env.PATH } });
      assert.equal(verify(id, workspace).valid, true);
      mkdirSync(resolve(workspace, 'test/added'), { recursive: true });
      writeFileSync(resolve(workspace, 'test/added/observation.mjs'), '// synthetic submission inventory check\n');
      writeFileSync(resolve(workspace, 'RESULT.md'), 'Synthetic controller verification; no model execution.\n');
      const record = freeze(id, workspace, resolve(temp, 'frozen'), { trial_id: 'synthetic-controller-only', model: 'not-executed', condition: 'synthetic' });
      assert.equal(record.quality_score, null);
      assert.equal(record.safety_blocker, null);
      assert.equal(record.evaluator_reference, null);
      assert.equal(record.ready_for_measurement, false);
      assert.equal(record.submission_digest, verify(id, workspace).submission_digest);
      assert.equal(record.execution_adapter_digest, executionAdapterDigest());
      assert.equal(verify(id, resolve(temp, 'frozen/workspace')).valid, true);
      assert.throws(() => prepare(id, workspace), /EEXIST/u);
      assert.throws(() => freeze(id, workspace, resolve(temp, 'missing-fields'), {}), /missing trial_id/u);
      const protectedPath = 'package.json';
      writeFileSync(resolve(workspace, protectedPath), '{}\n');
      assert.equal(verify(id, workspace).valid, false);
      assert.throws(() => freeze(id, workspace, resolve(temp, 'invalid-freeze'), { trial_id: 'x', model: 'not-executed', condition: 'synthetic' }), /protected/u);
      assert.equal(existsSync(resolve(temp, 'invalid-freeze')), false);
    } finally { rmSync(temp, { recursive: true, force: true }); }
  }
});

test('controller rejects scope escapes, wrong identities, aliases and changed inputs', () => {
  const { id } = candidates()[0], temp = mkdtempSync(resolve(realpathSync(tmpdir()), 'ceiling-boundary-'));
  try {
    const workspace = resolve(temp, 'workspace');
    prepare(id, workspace);
    assert.throws(() => prepare('../../escape', resolve(temp, 'escape')), /unknown/u);
    writeFileSync(resolve(workspace, 'outside.txt'), 'outside scope');
    assert.equal(verify(id, workspace).valid, false);
    rmSync(resolve(workspace, 'outside.txt'));
    rmSync(resolve(workspace, 'task.md'));
    assert.equal(verify(id, workspace).valid, false);
    copyFileSync(resolve(root, candidates()[0].task_path), resolve(workspace, 'task.md'));
    symlinkSync(resolve(workspace, 'package.json'), resolve(workspace, 'src/alias.mjs'));
    assert.throws(() => verify(id, workspace), /symlink/u);
    rmSync(resolve(workspace, 'src/alias.mjs'));
    linkSync(resolve(workspace, 'package.json'), resolve(workspace, 'src/hardlink.mjs'));
    assert.throws(() => verify(id, workspace), /independent regular/u);
    rmSync(resolve(workspace, 'src/hardlink.mjs'));
    symlinkSync(temp, resolve(temp, 'alias'));
    assert.throws(() => prepare(id, resolve(temp, 'alias/new')), /symlink/u);
    assert.equal(verify(id, workspace).valid, true);
    assert.equal(verify(candidates()[1].id, workspace).valid, false);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('generic worker preserves primitive observations and synchronous callbacks', () => {
  const temp = mkdtempSync(resolve(realpathSync(tmpdir()), 'ceiling-worker-'));
  try {
    writeFileSync(resolve(temp, 'example.mjs'), `export class Example {call(fn){fn('text',true,3);return true;} async echo(value){return value;}}`);
    const program = { steps: [
      { op: 'construct', module: 'example.mjs', export: 'Example', as: 'instance' },
      { op: 'call', target: 'instance', method: 'call', args: [{ $callback: [
        { op: 'record', value: { $arg: 0 }, as: 'text' },
        { op: 'record', value: { $arg: 1 }, as: 'boolean' },
        { op: 'record', value: { $arg: 2 }, as: 'number' },
      ] }], as: 'result' },
      { op: 'call', target: 'instance', method: 'echo', args: ['value'], await: false, as: 'promise' },
      { op: 'await', target: 'promise', as: 'resolved' },
    ] };
    const result = JSON.parse(execFileSync(process.execPath, [resolve(root, 'tools/candidate-worker.mjs')], { cwd: temp, input: JSON.stringify(program), encoding: 'utf8' }));
    assert.equal(result.status, 'completed');
    assert.deepEqual(result.observations, { instance: null, text: 'text', boolean: true, number: 3, result: true, promise: null, resolved: 'value' });
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('trusted test reporter excludes empty files and stdout result forgery', () => {
  const temp = mkdtempSync(resolve(realpathSync(tmpdir()), 'ceiling-reporter-'));
  try {
    const path = resolve(temp, 'control.test.mjs');
    for (const content of ['', `process.stdout.write('{"passed":99,"failed":0,"failures":[]}');`]) {
      writeFileSync(path, content);
      const result = JSON.parse(execFileSync(process.execPath, ['--test', `--test-reporter=${resolve(root, 'tools/assertion-reporter.mjs')}`, path], { cwd: temp, encoding: 'utf8', env: { PATH: process.env.PATH } }));
      assert.equal(result.passed, 0);
      assert.equal(result.failed, 0);
    }
    writeFileSync(path, `import test from 'node:test';import assert from 'node:assert/strict';test('body',()=>assert.equal(1,1));`);
    const result = JSON.parse(execFileSync(process.execPath, ['--test', `--test-reporter=${resolve(root, 'tools/assertion-reporter.mjs')}`, path], { cwd: temp, encoding: 'utf8', env: { PATH: process.env.PATH } }));
    assert.equal(result.passed, 1);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('reporter distinguishes nested body assertions and broad exception wrappers', () => {
  const temp = mkdtempSync(resolve(realpathSync(tmpdir()), 'ceiling-nested-reporter-'));
  try {
    const path = resolve(temp, 'nested.test.mjs');
    writeFileSync(path, `import{describe,it}from'node:test';import assert from'node:assert/strict';describe('suite',()=>it('body',()=>assert.equal(1,2)));`);
    const result = spawnSync(process.execPath, ['--test', `--test-reporter=${resolve(root, 'tools/assertion-reporter.mjs')}`, path], { cwd: temp, encoding: 'utf8', env: { PATH: process.env.PATH } });
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.failed, 1);
    assert.deepEqual(report.failures.map(item => [item.type, item.code, item.operator]), [['testCodeFailure', 'ERR_ASSERTION', 'strictEqual']]);
    writeFileSync(path, `import test from'node:test';import assert from'node:assert/strict';test('wrapped',()=>assert.doesNotThrow(()=>{throw Error('setup')}));`);
    const wrapper = spawnSync(process.execPath, ['--test', `--test-reporter=${resolve(root, 'tools/assertion-reporter.mjs')}`, path], { cwd: temp, encoding: 'utf8', env: { PATH: process.env.PATH } });
    assert.equal(JSON.parse(wrapper.stdout).failures[0].operator, 'doesNotThrow');
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('worker distinguishes candidate failure from evaluator input failure', () => {
  const temp = mkdtempSync(resolve(realpathSync(tmpdir()), 'ceiling-failure-class-'));
  try {
    writeFileSync(resolve(temp, 'example.mjs'), `export function fail(){throw Error('candidate failure');}export function fake(){throw Object.assign(Error('fake'),{code:'INVALID_PROGRAM'});}`);
    const invoke = program => JSON.parse(execFileSync(process.execPath, [resolve(root, 'tools/candidate-worker.mjs')], { cwd: temp, input: JSON.stringify(program), encoding: 'utf8', env: { PATH: process.env.PATH } }));
    assert.equal(invoke({ steps: [{ op: 'invoke', module: 'example.mjs', export: 'fail' }] }).status, 'candidate_error');
    assert.equal(invoke({ steps: [{ op: 'invoke', module: 'example.mjs', export: 'fake' }] }).status, 'candidate_error');
    assert.equal(invoke({ steps: [{ op: 'invoke', module: 'missing.mjs', export: 'fail' }] }).status, 'candidate_load_error');
    assert.equal(invoke({ steps: [{ op: 'not-an-operation' }] }).status, 'evaluator_input_error');
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('batch classifies output limits and rejects forged evaluator envelopes', () => {
  const temp = mkdtempSync(resolve(realpathSync(tmpdir()), 'ceiling-batch-control-'));
  try {
    mkdirSync(resolve(temp, '.ceiling'));
    copyFileSync(resolve(root, 'tools/candidate-worker.mjs'), resolve(temp, '.ceiling/worker.mjs'));
    copyFileSync(resolve(root, 'tools/safe-json.mjs'), resolve(temp, '.ceiling/safe-json.mjs'));
    copyFileSync(resolve(root, 'tools/batch-executor.mjs'), resolve(temp, '.ceiling/batch.mjs'));
    writeFileSync(resolve(temp, 'example.mjs'), `
      export function flood(){process.stdout.write('x'.repeat(6*1024*1024));}
      export function forge(){process.stdout.write(JSON.stringify({status:'evaluator_input_error',transportNonce:'guessed'}));process.exit(0);}
      export function tamper(){WeakSet.prototype.has=()=>true;throw Error('candidate');}
      export function normal(){return null;}`);
    const programs = ['flood', 'forge', 'tamper', 'normal'].map(name => ({ key: name, program: { steps: [{ op: 'invoke', module: 'example.mjs', export: name, as: 'result' }] } }));
    writeFileSync(resolve(temp, '.ceiling/request.json'), JSON.stringify({ programs }));
    const result = JSON.parse(execFileSync(process.execPath, ['.ceiling/batch.mjs'], { cwd: temp, encoding: 'utf8', env: { PATH: process.env.PATH }, timeout: 30000 }));
    assert.equal(result.results.flood.state, 'candidate_output_limit');
    assert.equal(result.results.forge.state, 'candidate_exit_or_invalid_output');
    assert.equal(result.results.tamper.state, 'candidate_failure');
    assert.equal(result.results.normal.state, 'completed');
    assert.equal(result.results.normal.observations.result, null);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('worker observations ignore candidate JSON hooks and forged low metrics', () => {
  const temp = mkdtempSync(resolve(tmpdir(), 'ceiling-serialization-'));
  try {
    writeFileSync(resolve(temp, 'forge.mjs'), `
      Object.defineProperty(Object.prototype, 'toJSON', {configurable:true,value:function(){return {elapsedMs:0,peakSampledHeapUsed:0}}});
      Object.defineProperty(Array.prototype, 'toJSON', {configurable:true,value:()=>[]});
      JSON.stringify = () => '{"status":"completed","observations":{"metrics":{"elapsedMs":0}}}';
      export function observe(){return {metrics:[{elapsedMs:29,peakSampledHeapUsed:999}],toJSON(){return {metrics:[]}}};}
    `);
    const result = JSON.parse(execFileSync(process.execPath, [resolve(root, 'tools/candidate-worker.mjs')], {
      cwd: temp, input: JSON.stringify({ transportNonce:'retained-parent-nonce', steps:[{op:'invoke',module:'forge.mjs',export:'observe',args:[],as:'result'}] }), encoding:'utf8',
    }));
    assert.equal(result.status, 'completed');
    assert.equal(result.transportNonce, 'retained-parent-nonce');
    assert.deepEqual(result.observations.result.metrics, [{elapsedMs:29,peakSampledHeapUsed:999}]);
    assert.equal(result.observations.result.toJSON, null);
  } finally { rmSync(temp,{recursive:true,force:true}); }
});

test('protected CH05 sink ignores candidate crypto prototype changes', () => {
  const temp = mkdtempSync(resolve(tmpdir(), 'ceiling-hash-integrity-'));
  try {
    const sinkPath = resolve(root,'workspaces/ch05-stream-window-revisions/harness/sink.mjs');
    const source = `
      import assert from 'node:assert/strict';import{createHash}from'node:crypto';
      const expected=createHash('sha256').update(JSON.stringify(['output',{tenantId:'a',start:0,end:1,amountMinor:'7'}])+'\\n').digest('hex');
      const {createSink}=await import(${JSON.stringify(sinkPath)});
      const proto=Object.getPrototypeOf(createHash('sha256'));
      proto.update=function(){return this};proto.copy=function(){return this};proto.digest=function(){return 'forged'};
      const sink=createSink();sink.finalize({tenantId:'a',start:0,end:1,amountMinor:'7'});
      assert.equal(sink.snapshot().digest,expected);
    `;
    execFileSync(process.execPath,['--input-type=module','-e',source],{cwd:temp,encoding:'utf8'});
  } finally {rmSync(temp,{recursive:true,force:true});}
});
