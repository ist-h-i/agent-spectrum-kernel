// Reuse the existing once-only worker transport; unknown grading is inspected.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {canonicalDigest} from './content-addressed-store.mjs';
import {readInstructionLoopJson} from './instruction-loop-artifact.mjs';
import {createInlineHostReferenceScoringCommand,inspectHostReferenceScoringResult} from './instruction-loop-host-scoring.mjs';
import {createReferenceScoringCommandRuntime} from './instruction-loop-command-runtime.mjs';
const pending=message=>Object.assign(new Error(message),{code:'REFERENCE_SCORING_PENDING'});
export function instructionReferenceScoringCommand(p,{parent=null}={}){
 const provider=p.report?.scoringProvider;if(!provider)return p.report?.referenceScoringCommand;
 assert.equal(p.kind,'full_native_reference_loop_profile_v1','host scoring provider is native-only');assert.ok(!p.report.referenceScoringCommand,'choose scoringProvider or custom command');
 assert.ok(Object.keys(provider).every(k=>['kind','evidence_kind'].includes(k)));assert.equal(provider.kind,'external_host');
 return createInlineHostReferenceScoringCommand({protectedRoot:p.stateRoot,evidenceKind:provider.evidence_kind??'host_reported',parent});
}
export function instructionReferenceScoringJob(p,job){
 assert.equal(job.kind,'report');return {kind:'grade',input:{...job.input,source_report_job_digest:canonicalDigest(job),store_root:p.storeRoot,criteria:p.report.criteria,fixed_scoring:p.report.fixedScoring??null}};
}
export async function runInstructionReferenceScoring(p,job,{modelCallsAuthorized=false,inspectOnly=false,coordinatorRoot=null}={}){
 const parent=p.report.scoringProvider?{root:coordinatorRoot,report_job_digest:canonicalDigest(job)}:null;if(parent)assert.ok(typeof parent.root==='string'&&resolve(parent.root)===parent.root,'host scoring requires its exact coordinator root');
 const command=instructionReferenceScoringCommand(p,{parent});if(!command)return {assessments:p.report.fixedScoring?.assessments??[],referenceAssessments:[],execution:null};
 const runtime=createReferenceScoringCommandRuntime({definition:{commands:{grade:command}},modelCallsAuthorized});
 const gradeJob=instructionReferenceScoringJob(p,job);
 const root=join(p.stateRoot,'reference-scoring'),directory=join(root,'jobs',canonicalDigest(gradeJob).slice(7));
 let result=await runtime.inspect(gradeJob,{root});
 if(result.status==='unknown'){
  if(inspectOnly)return null;
  if(existsSync(directory))throw pending('reference grading uncertain; inspect the consumed invocation, never replay');
  mkdirSync(root,{recursive:true,mode:0o700});result=await runtime.grade(gradeJob,{root});
 }
 if(p.report.scoringProvider&&['completed','failed'].includes(result.status)){
  try{const expected=inspectHostReferenceScoringResult(directory,{inline:JSON.parse(command.argv[3])});assert.ok(expected,'host completion has no parent checkpoint');assert.equal(canonicalDigest(readInstructionLoopJson(join(directory,'result.json'))),canonicalDigest(expected),'cached host scoring result differs from parent-bound completion');
   let observed=expected;const transport=result.output?.transport;if(transport){assert.equal(transport.request_digest,canonicalDigest(gradeJob));assert.ok(transport.exit_code!==0||transport.signal!==null);observed={...expected,status:'failed',output:{...expected.output,transport}};}
   assert.equal(canonicalDigest(result),canonicalDigest(observed),'host scoring observation differs from its retained result/transport');}
  catch(error){if(inspectOnly)return null;throw pending('host reference scoring authority unresolved: '+String(error.message).slice(0,512));}
 }
 if(!['completed','failed'].includes(result.status))throw pending('reference grading completion unknown');
 if(command.model_calls&&result.output?.ready_for_next_root!==true)throw pending('model grading provider completion unconfirmed');
 const refs=result.status==='completed'?result.output?.fixed_point_assessments:[];
 const validReference=r=>r!==null&&typeof r==='object'&&!Array.isArray(r)&&typeof r.path==='string'&&!r.path.includes('\0')&&resolve(r.path)===r.path&&typeof r.digest==='string'&&/^sha256:[a-f0-9]{64}$/u.test(r.digest);
 const usable=Array.isArray(refs)&&refs.length<=256&&refs.every(validReference);
 const binaryRefs=result.status==='completed'?(result.output?.reference_assessments??[]):[];
 const binaryUsable=Array.isArray(binaryRefs)&&binaryRefs.length<=256&&binaryRefs.every(validReference);
 const outputIssue=usable?null:'fixed_point_references_invalid_or_missing';
 const execution={request_digest:canonicalDigest(gradeJob),runtime_digest:runtime.digest,result_digest:canonicalDigest(result),
  status:result.status,output_issue:outputIssue,reference_output_issue:binaryUsable?null:'reference_assessments_invalid',resources:result.output?.resources??null,complete_cost:null,model_calls_declared:command.model_calls};
 return {assessments:usable?refs.map(({path,digest})=>({path,digest})):[],referenceAssessments:binaryUsable?binaryRefs.map(({path,digest})=>({path,digest})):[],execution};
}
