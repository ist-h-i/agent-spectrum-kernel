// Isolated fake factories; no production callback or model is dispatched.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync}from'node:fs';
import {join}from'node:path';
import {canonicalDigest}from'./content-addressed-store.mjs';
import {buildFixture}from'./test-helpers-personal-prompt-repetition.mjs';
import * as grading from './ask-primary-evaluation-grading.mjs';
import * as pair from './ask-personal-evolution-primary-pair.mjs';
test('opt-in driver refuses foreign member and drift in another repeat before any dispatch',async t=>{
 const f=buildFixture(t,{withGrading:true});let preflights=0,dispatches=0;
 t.mock.module('./ask-primary-evaluation-grading.mjs',{exports:{...grading,createPrimaryEvaluationGradingAdapter:()=>({preflight:()=>{preflights++;return{status:'ready',blockers:[]};}})}});
 t.mock.module('./ask-personal-evolution-primary-pair.mjs',{exports:{...pair,startPersonalEvolutionPromptPair:()=>{dispatches++;throw new Error('artificial dispatch must never occur');}}});
 const driver=await import('./ask-personal-evolution-driver.mjs?repetition-boundary-fixture');
 const selected=f.members[0],input={...f.args,experimentObjectDigest:selected.experimentObjectDigest,pairRegistrationObjectDigest:selected.pairRegistrationObjectDigest};
 assert.throws(()=>driver.inspectPreparedPersonalEvolutionLoop({...input,pairRegistrationObjectDigest:canonicalDigest('foreign pair')}),/outside fixed repetition population/);assert.equal(preflights,0);
 const inspected=driver.inspectPreparedPersonalEvolutionLoop(input);assert.equal(inspected.models_started,false);assert.equal(preflights,2);assert.equal(dispatches,0);
 const other=f.members[1].blocks.challenger[0].grading.resources.path,bytes=readFileSync(other);writeFileSync(other,Buffer.concat([bytes,Buffer.from('\n')]));
 await assert.rejects(driver.startPreparedPersonalEvolutionLoop(inspected.handle,selected.pairRegistrationObjectDigest),/grading resource.*changed/);
 await assert.rejects(driver.startPreparedPersonalEvolutionLoop(inspected.handle,selected.pairRegistrationObjectDigest),/opaque prepared driver handle/);
 assert.equal(dispatches,0);assert.equal(preflights,2);assert.ok(f.members.every(m=>!existsSync(join(m.registration.output_root,'invocation'))));
});
