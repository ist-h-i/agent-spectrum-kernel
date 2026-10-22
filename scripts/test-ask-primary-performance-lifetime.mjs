// Public artificial controls only; no native probe, model or Codex executable.
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readStableFile } from './ask-benchmark-stable-file.mjs';
import * as boundary from './ask-benchmark-evaluator-boundary.mjs';
import * as grading from './ask-primary-evaluation-private-grading.mjs';
import * as safety from './ask-primary-engineering-safety.mjs';

test('async production execution rejects a forged authority before caller transport can run', async () => {
  let starts=0;
  await assert.rejects(async () => boundary.executeProductionSealedEvaluatorAsync({execution:{},
    executionControl:{executeProcess(){starts++;}}}), /module-owned|owned.*scope|authority/u);
  assert.equal(starts,0);
});

test('async prospective grading refuses absent authority and pre-abort with null quality and no worker', async () => {
  const controller=new AbortController();controller.abort();
  for(const controls of [{},{signal:controller.signal}]){
    const result=await grading.runPrimaryEvaluationPrivateGradingAsync({}, {condition:'plain'},controls);
    assert.equal(result.status,'blocked');assert.equal(result.quality,null);
    assert.equal(result.grader_process_starts,0);assert.equal(result.model_calls,0);
  }
  const legacy=grading.runPrimaryEvaluationPrivateGrading({}, {condition:'plain'});
  assert.equal(legacy?.then,undefined);assert.equal(legacy.status,'blocked');
});

test('async primary score cannot accept a caller verified object or bypass owned condition scope', async () => {
  await assert.rejects(async()=>safety.scorePrimaryEvaluatorResultAsync({verified:{evaluationReady:true}},{}), /owned.*scope|authority/u);
});

test('async score binds projection to authoritative normalized input and refuses caller mutation before publish',()=>{
  const result=spawnSync(process.execPath,['--experimental-test-module-mocks',fileURLToPath(new URL('./test-fixtures/primary-performance-score-lifetime.mjs',import.meta.url))],
    {encoding:'utf8',timeout:10000,env:{PATH:'/usr/bin:/bin',LANG:'C'}});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/no publication/);
});

test('async private authority rejects same-byte fragment replacement across the wait',t=>{
  const root=realpathSync(mkdtempSync(join(tmpdir(),'ask-lifetime-identity-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const recordPath=join(root,'record.json'),fragmentPath=join(root,'fragment.json');
  writeFileSync(recordPath,'{"artificial_record":true}\n');writeFileSync(fragmentPath,'{"artificial_fragment":true}\n');
  const recordRead=readStableFile(recordPath,'artificial record',1024),fragmentRead=readStableFile(fragmentPath,'artificial fragment',1024);
  const snapshot={canonicalEvaluationRoot:root,recordInfo:{authoritativePath:recordPath,relativePath:'record.json'},
    fragmentInfo:{authoritativePath:fragmentPath,relativePath:'fragment.json'},recordRead,fragmentRead,record:{private_fragment_inode:fragmentRead.evidence.finalPath.ino}};
  assert.doesNotThrow(()=>boundary.assertAsyncPrivateAuthorityUnchangedForTest(snapshot));
  writeFileSync(join(root,'replacement.json'),fragmentRead.bytes);renameSync(join(root,'replacement.json'),fragmentPath);
  assert.throws(()=>boundary.assertAsyncPrivateAuthorityUnchangedForTest(snapshot),/authority.*changed|fragment.*inode/u);
});
