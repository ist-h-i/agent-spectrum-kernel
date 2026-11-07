// Reuse the existing once-only worker transport; unknown grading is inspected.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {canonicalDigest} from './content-addressed-store.mjs';
import {createReferenceScoringCommandRuntime} from './instruction-loop-command-runtime.mjs';
const pending=message=>Object.assign(new Error(message),{code:'REFERENCE_SCORING_PENDING'});
export async function runInstructionReferenceScoring(p,job,{modelCallsAuthorized=false,inspectOnly=false}={}){
 const command=p.report.referenceScoringCommand;if(!command)return {assessments:p.report.fixedScoring?.assessments??[],execution:null};
 const runtime=createReferenceScoringCommandRuntime({definition:{commands:{grade:command}},modelCallsAuthorized});
 const gradeJob={kind:'grade',input:{...job.input,source_report_job_digest:canonicalDigest(job),store_root:p.storeRoot,
  criteria:p.report.criteria,fixed_scoring:p.report.fixedScoring}};
 const root=join(p.stateRoot,'reference-scoring'),directory=join(root,'jobs',canonicalDigest(gradeJob).slice(7));
 let result=await runtime.inspect(gradeJob,{root});
 if(result.status==='unknown'){
  if(inspectOnly)return null;
  if(existsSync(directory))throw pending('reference grading uncertain; inspect the consumed invocation, never replay');
  mkdirSync(root,{recursive:true,mode:0o700});result=await runtime.grade(gradeJob,{root});
 }
 if(!['completed','failed'].includes(result.status))throw pending('reference grading completion unknown');
 if(command.model_calls&&result.output?.ready_for_next_root!==true)throw pending('model grading provider completion unconfirmed');
 const refs=result.status==='completed'?result.output?.fixed_point_assessments:[];
 const validReference=r=>r!==null&&typeof r==='object'&&!Array.isArray(r)&&typeof r.path==='string'&&!r.path.includes('\0')&&resolve(r.path)===r.path&&typeof r.digest==='string'&&/^sha256:[a-f0-9]{64}$/u.test(r.digest);
 const usable=Array.isArray(refs)&&refs.length<=256&&refs.every(validReference);
 const outputIssue=usable?null:'fixed_point_references_invalid_or_missing';
 const execution={request_digest:canonicalDigest(gradeJob),runtime_digest:runtime.digest,result_digest:canonicalDigest(result),
  status:result.status,output_issue:outputIssue,resources:result.output?.resources??null,complete_cost:null,model_calls_declared:command.model_calls};
 return {assessments:usable?refs.map(({path,digest})=>({path,digest})):[],execution};
}
