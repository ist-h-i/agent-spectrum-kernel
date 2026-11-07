import test from 'node:test';import assert from 'node:assert/strict';import{mkdtempSync,realpathSync,rmSync,writeFileSync,readFileSync,existsSync}from'node:fs';import{join}from'node:path';import{tmpdir}from'node:os';
import{canonicalDigest}from'./content-addressed-store.mjs';import{instructionBytesDigest as hash}from'./instruction-environment.mjs';import{buildInstructionRecoveryPacket,validateInstructionRecoveryAssessment}from'./instruction-evaluation-recovery.mjs';
test('one closed AI comparison limit is repaired without changing the judgment or calling a model twice; invalid authority still rejects',async t=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'ask-assessment-shape-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const policy={max_extra_trials:4,max_retries_per_row:1,allow_reference:true,allow_exclusion:true,required_dimensions:['execution','duration','usage','quality']};
 const row={case_id:'synthetic',repetition:1,condition:'baseline'},job={kind:'trial',key:'synthetic',input:{row}};
 const packet=buildInstructionRecoveryPacket({policy,job,result:{status:'completed',output:{ready_for_next_root:true,cli_seconds:1,root_usage:{input_tokens:5,output_tokens:2,cached_input_tokens:0},notes:{outcome:'unknown',evidence_refs:[]}}},logicalRow:row,retriesUsed:0,extraTrialsUsed:0,retrySupported:true});
 let calls=0,response;const received=[];
 t.mock.module('./codex-exec-runner.mjs',{namedExports:{executeCodexSession:async input=>{calls++;received.push(input);writeFileSync(input.argv[input.argv.indexOf('-o')+1],JSON.stringify(response));return{spawnObserved:true,terminationConfirmed:true,exitCode:0,durationMs:7};}}});
 const{assessPracticalEvaluation}=await import('./practical-evaluation-assessor.mjs?shape-regression');const settings={kind:'codex',executable:'synthetic-never-executed',model:'synthetic',timeout_ms:1000};
 const base={packet_digest:canonicalDigest(packet),action:'reference',reason:'Use retained execution and usage; quality is unavailable.',retry_scope:null,selection_basis:'practical_reference',used_dimensions:['execution','duration','usage'],comparison_limits:'Quality remains unknown.'};
 const old=process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED='1';
 try{
  for(const [i,limits]of['Quality remains unknown.',['Quality remains unknown.'],'','x'.repeat(2049)].entries()){
   response={...base,comparison_limits:limits};const original=structuredClone(response),file=join(root,'result-'+i+'.json'),r=await assessPracticalEvaluation(settings,{kind:'assess',input:{packet}},file),session=join(root,'assessment-session');
   assert.equal(calls,i+1);assert.equal(r.output.assessment_execution.model_calls,1);assert.equal(r.output.assessment_execution.usage,null);
   assert.deepEqual(JSON.parse(readFileSync(join(session,'answer.json'))),original,'original model response must remain intact');
   if(i===0){assert.deepEqual(r.output.assessment,{...original,comparison_limits:[limits]});validateInstructionRecoveryAssessment(packet,r.output.assessment);
    const ref=r.output.assessment_execution.output_shape_repair;assert.equal(hash(readFileSync(ref.path)),ref.digest);const receipt=JSON.parse(readFileSync(ref.path));assert.equal(receipt.additional_model_calls,0);assert.equal(receipt.original_assessment_digest,canonicalDigest(original));assert.equal(receipt.repaired_assessment_digest,canonicalDigest(r.output.assessment));assert.equal(hash(readFileSync(receipt.original_response.path)),receipt.original_response.digest);assert.equal(hash(readFileSync(receipt.repaired_response.path)),receipt.repaired_response.digest);
   }else{assert.deepEqual(r.output.assessment,original);assert.equal(r.output.assessment_execution.output_shape_repair,undefined);assert.equal(existsSync(join(session,'assessment-shape-repair.json')),false);if(i===1)validateInstructionRecoveryAssessment(packet,r.output.assessment);else assert.throws(()=>validateInstructionRecoveryAssessment(packet,r.output.assessment));}
   rmSync(session,{recursive:true});
  }
  response={...base,used_dimensions:'execution'};const bad=await assessPracticalEvaluation(settings,{kind:'assess',input:{packet}},join(root,'invalid.json'));assert.equal(bad.output.assessment.used_dimensions,'execution');assert.throws(()=>validateInstructionRecoveryAssessment(packet,bad.output.assessment));assert.equal(calls,5);
  assert.ok(received.every(r=>r.input.includes('used_dimensions and comparison_limits must be arrays of strings')));
  assert.ok(received.every(r=>r.input.includes('used_dimensions:["execution","duration"]')&&r.input.includes('comparison_limits:["quality remains unknown"]')));
  assert.ok(received.every(r=>!r.input.includes('\\"execution\\"')));
 }finally{if(old===undefined)delete process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;else process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED=old;}
});
