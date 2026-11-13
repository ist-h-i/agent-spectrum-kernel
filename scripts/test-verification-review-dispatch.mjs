import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { dispatchVerificationReview } from './verification-review-dispatch.mjs';
import { createMeasurementFixture, REVISIONS } from './verification-reuse-measurement-fixture.mjs';
function fixture(t,options={}){
  const f=createMeasurementFixture(options);t.after(()=>f.dispose());
  f.bindBaseline('baseline',f.gates.map(g=>f.execute(g,f.stores.baseline)));return f;
}
const options=f=>({repositoryRoot:f.root,storeRoot:f.stores.reuse,targetRevision:f.head()});
const pass=request=>({result:{request_digest:request.request_digest,target_revision:request.target_revision,
  reviewed_paths:[...request.paths],reviewed_obligations:request.obligations.map(o=>o.ref),judgment_refs:[...request.judgment_refs],findings:[],decision:'pass'}});
test('unchanged and unrelated revisions dispatch no reviewer',async t=>{
  const f=fixture(t);let count=0;
  for(const revision of [REVISIONS[0],REVISIONS[1]]){
    if(revision.path)f.revise(revision);
    const r=await dispatchVerificationReview({...options(f),reviewer:()=>{count++;throw Error('unexpected');}});
    assert.equal(r.status,'not_required');assert.equal(r.reviewer_calls,0);assert.equal(r.usage.input_tokens,null);
  }
  assert.equal(count,0);
});
test('delta binds material, full coverage and native usage without persisting code',async t=>{
  const f=fixture(t);f.revise(REVISIONS[2]);let captured;
  const r=await dispatchVerificationReview({...options(f),reviewer:async(request,{signal})=>{
    captured=request;assert.equal(signal.aborted,false);
    return {...pass(request),usage:{input_tokens:100,cached_input_tokens:20,output_tokens:30}};
  }});
  assert.equal(r.status,'reviewed');assert.equal(r.reviewer_calls,1);assert.equal(r.authorizes_action,false);
  assert.deepEqual(captured.paths,['src/limit.mjs']);assert.ok(captured.material[0].before.includes('amount <= limit'));assert.ok(captured.material[0].after.includes('amount < limit'));
  assert.deepEqual(captured.obligations,[{ref:'AC-limit-inclusive',paths:['src/limit.mjs']}]);
  assert.equal(r.usage.input_tokens,100);assert.ok(!JSON.stringify(r).includes('export const'));
  assert.deepEqual(captured.prior_review_refs,['measurement-baseline-review']);
  assert.equal(captured.prior_review_authority,'baseline_reference_only');
  assert.ok(Array.isArray(captured.prior_finding_refs));
  assert.ok(captured.verified_evidence_refs.length>0);
});
test('unchanged independent gate expands to its full semantic surface',async t=>{
  const f=fixture(t,{independent:true});let captured;
  const r=await dispatchVerificationReview({...options(f),reviewer:request=>{captured=request;return pass(request);}});
  assert.equal(r.status,'reviewed');assert.deepEqual(captured.paths,['src/limit.mjs']);
  assert.deepEqual(captured.judgment_refs,['gate:source-test']);assert.equal(captured.material[0].before,captured.material[0].after);
});
for(const variant of ['paths','obligations','judgments','binding','usage','finding','extra'])test(`incomplete or invalid ${variant} is blocked`,async t=>{
  const f=fixture(t);f.revise(REVISIONS[2]);
  const r=await dispatchVerificationReview({...options(f),reviewer:request=>{
    const response=pass(request);
    if(variant==='paths')response.result.reviewed_paths=[];
    if(variant==='obligations')response.result.reviewed_obligations=[];
    if(variant==='judgments')response.result.judgment_refs=[];
    if(variant==='binding')response.result.request_digest='sha256:'+'0'.repeat(64);
    if(variant==='usage')response.usage={input_tokens:1,cached_input_tokens:2,output_tokens:0};
    if(variant==='finding')response.result.findings=[{path:'src/view.mjs',obligation_ref:'AC-limit-inclusive',severity:'minor'}];
    if(variant==='extra')response.result.raw_prompt='not allowed';return response;
  }});
  assert.equal(r.status,'blocked');assert.equal(r.authorizes_action,false);assert.equal(r.result,undefined);
});
test('reviewer failure, dirty target and missing evidence never become successful reviews',async t=>{
  const f=fixture(t);f.revise(REVISIONS[2]);
  let r=await dispatchVerificationReview({...options(f),reviewer:()=>{throw Error('private provider detail');}});
  assert.equal(r.status,'blocked');assert.ok(!JSON.stringify(r).includes('private provider detail'));
  const empty=join(f.parent,'empty');mkdirSync(empty);
  r=await dispatchVerificationReview({...options(f),storeRoot:empty,reviewer:pass});assert.equal(r.status,'blocked');assert.equal(r.reviewer_calls,0);
  writeFileSync(join(f.root,'untracked'),'dirty');
  r=await dispatchVerificationReview({...options(f),reviewer:pass});assert.equal(r.status,'blocked');assert.equal(r.reviewer_calls,0);
});
test('target change during callback invalidates the returned review',async t=>{
  const f=fixture(t);f.revise(REVISIONS[2]);
  const r=await dispatchVerificationReview({...options(f),reviewer:request=>{f.revise(REVISIONS[1]);return pass(request);}});
  assert.equal(r.status,'blocked');assert.equal(r.result,undefined);
});
test('oversized material does not dispatch and real blocker stays a review decision, not approval',async t=>{
  const f=fixture(t);f.revise(REVISIONS[2]);
  const r=await dispatchVerificationReview({...options(f),reviewer:request=>{
    const response=pass(request);response.result.findings=[{path:'src/limit.mjs',obligation_ref:'AC-limit-inclusive',severity:'blocker'}];response.result.decision='block';return response;
  }});
  assert.equal(r.status,'reviewed');assert.equal(r.result.decision,'block');assert.equal(r.authorizes_action,false);
  f.revise({name:'too big',path:'src/limit.mjs',content:'x'.repeat(1024*1024+1)});
  const blocked=await dispatchVerificationReview({...options(f),reviewer:pass});assert.equal(blocked.status,'blocked');assert.equal(blocked.reviewer_calls,0);
});

for(const invalidation of ['result-binding','target-change'])test(`observed usage survives ${invalidation} without accepting the review`,async t=>{
  const f=fixture(t);f.revise(REVISIONS[2]);
  const usage={input_tokens:123,cached_input_tokens:23,output_tokens:7};
  const r=await dispatchVerificationReview({...options(f),reviewer:request=>{
    const response={...pass(request),usage};
    if(invalidation==='result-binding')response.result.request_digest='sha256:'+'0'.repeat(64);
    else f.revise(REVISIONS[1]);
    return response;
  }});
  assert.equal(r.status,'blocked');assert.equal(r.result,undefined);
  assert.equal(r.reviewer_calls,1);assert.deepEqual(r.usage,usage);
  assert.equal(r.authorizes_action,false);
});

test('enabled intake captures dispatched results and separates review executions',async t=>{
 const {initializeFindingIntake,listFindings}=await import('./finding-intake.mjs');
 const f=fixture(t);f.revise(REVISIONS[2]);initializeFindingIntake(f.root,'review-project');
 const reviewer=request=>{const response=pass(request);response.result.findings=[{path:'src/limit.mjs',obligation_ref:'AC-limit-inclusive',severity:'major'}];response.result.decision='block';return response;};
 for(let i=0;i<2;i++){const r=await dispatchVerificationReview({...options(f),reviewer});assert.equal(r.status,'reviewed');assert.equal(r.finding_capture.status,'recorded');assert.equal(r.finding_capture.events.length,1);}
 const records=listFindings(f.root);assert.equal(records.length,2);assert.ok(records.every(r=>r.source.kind==='ai_review'&&r.evidence_status==='Hypothesis'));
});
test('capture failure preserves completed review and does not rerun it',async t=>{
 const {initializeFindingIntake}=await import('./finding-intake.mjs');const {rmSync}=await import('node:fs');
 const f=fixture(t);f.revise(REVISIONS[2]);initializeFindingIntake(f.root,'review-project');
 rmSync(join(f.root,'.agent-spectrum-kernel/findings/events'),{recursive:true});let calls=0;
 const r=await dispatchVerificationReview({...options(f),reviewer:request=>{calls++;const response=pass(request);response.result.findings=[{path:'src/limit.mjs',obligation_ref:'AC-limit-inclusive',severity:'major'}];response.result.decision='block';return response;}});
 assert.equal(calls,1);assert.equal(r.status,'reviewed');assert.equal(r.finding_capture.status,'failed');assert.equal(r.result.decision,'block');
});
