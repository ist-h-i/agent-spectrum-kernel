// Run with Node 24. This writes configuration only; it never calls a model.
// Arguments: workspace, public case directory, codex executable, CLI version,
// model ID, operator authority declaration file, output JSON, normal target or '-'.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const [workspaceArg,caseArg,codexArg,cliVersion,model,authorityArg,outputArg,targetArg]=process.argv.slice(2);
assert.ok(targetArg,'Usage: node npm-loop-spec-example.mjs WORKSPACE CASE_DIR CODEX CLI_VERSION MODEL AUTHORITY_FILE OUTPUT TARGET_OR_-');
const workspace=resolve(workspaceArg),caseRoot=resolve(caseArg),executable=resolve(codexArg);
const {canonicalDigest}=await import(pathToFileURL(join(workspace,'source/scripts/content-addressed-store.mjs')));
const digest=path=>'sha256:'+createHash('sha256').update(readFileSync(path)).digest('hex');
// Keep task-specific source files in this public inventory as needed.
const files=['task.md','criterion.mjs'].map(target=>({source:join(caseRoot,target),target,digest:digest(join(caseRoot,target))}));
const context={cli_version:cliVersion,model,reasoning:'low',platform:process.platform,global_context_ref:null};
const condition={context,codex:{executable,model,reasoning:'low',task_file:'task.md',timeout_ms:900000}};
const spec={
 skills:['controlled-implementation'],
 provider:{kind:'codex',executable,model,timeoutMs:900000},
 runtime:{cli_version:cliVersion,model,ambient_config:'Unknown'},
 normal:{target:targetArg==='-'?null:resolve(targetArg)},
 assetAuthority:{kind:'external_asset_lifecycle_authority',authority_id:'local-operator',authority_revision:'1',authority_evidence_digest:digest(resolve(authorityArg))},
 policy:{kind:'reference_instruction_loop_v1',id:'local-efficiency-cycle',observation:{goal:'Preserve correctness on the approved task while reducing unnecessary implementation work and elapsed time. Keep useful recommendations supplementary.'},
  catalog:[{id:'public-task',public_input_digest:canonicalDigest(files.map(({target,digest})=>({target,digest}))),tags:['implementation'],domain:'local-application'}],conditions:['baseline','candidate'],repetitions:1,max_trials:2},
 selection:{limit:1},
 practical:{evidence_kind:'observed',conditions:{baseline:condition,candidate:structuredClone(condition)},
  cases:[{id:'public-task',task_ref:'task.md',input_ref:'public-input-v1',success_criteria_ref:'criterion.mjs',files,
   grader:{argv:[process.execPath,'criterion.mjs'],pins:[{path:join(caseRoot,'criterion.mjs'),digest:digest(join(caseRoot,'criterion.mjs'))}],timeout_ms:30000,model_calls:false}}],
  recovery:{max_extra_trials:0,max_retries_per_row:0,allow_reference:true,allow_exclusion:true,required_dimensions:['execution','duration','usage']},
  global_context:{ask_presence:'unknown',change_status:'unknown'}}
};
writeFileSync(resolve(outputArg),JSON.stringify(spec,null,2)+'\n',{flag:'wx'});
console.log(resolve(outputArg));
