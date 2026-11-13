import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,lstatSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export const root=resolve(import.meta.dirname,'..');
export const source=resolve(root,'../../..');
export const id='ch08-growth-workspace';
const prefix='benchmarks/challenge-candidates/ui-reconstruction-v1';
const digest=p=>'sha256:'+createHash('sha256').update(readFileSync(p)).digest('hex');
export function inventory(dir=join(root,'workspace'),rel=''){
 return readdirSync(join(dir,rel)).sort().flatMap(name=>{
  const path=rel?rel+'/'+name:name,stat=lstatSync(join(dir,path));
  assert.ok(!stat.isSymbolicLink(),'public input symlink');
  if(stat.isDirectory())return inventory(dir,path);
  assert.ok(stat.isFile());return [{path,sha256:digest(join(dir,path)).slice(7),bytes:stat.size}];
 });
}
export function expectedRegistration(){return {
 kind:'practical_challenge_registration_v1',id,display_id:'CH08',ordinal:8,
 series:'ui-reconstruction-v1',input_version:'ui-functional-v2',workspace:prefix+'/workspace',freeze_submission:true,
 input_manifest:{path:prefix+'/input-manifests/'+id+'.json',digest:digest(join(root,'input-manifests',id+'.json'))},
 stages:[{id:'initial',outputs:['DELIVERY.md'],prompt:'Read task.md and all referenced public specifications. Design, implement and verify the local web UI in app/. Save DELIVERY.md with exact startup and verification instructions, observed results and limitations. Keep all original public files unchanged. Complete runnable artifacts before ending this turn; stage two is read-only and freezes every file, with no dependency symlinks. Use only this workspace, localhost and allowed system toolchains, never external services, host repositories or history. Do not call an actual AI service. Stop after delivery.'},
 {id:'reassessment',outputs:['REASSESSMENT.md'],update:{target:'OPERATIONAL-UPDATE.md',path:prefix+'/stages/verification-turn.md',digest:digest(join(root,'stages/verification-turn.md'))},prompt:'Continue this same trial. Read OPERATIONAL-UPDATE.md and perform its read-only checks against the frozen implementation. Add REASSESSMENT.md only. Change no existing files and add no other files. Retain the original workspace, local-only network boundary, tools, model and settings. Missing runtime evidence must remain explicit. Stop when the reassessment is saved.'}],
 evaluator:{kind:'external_semantic_assessment',maximum:100,categories:{functional:40,ux:60},automatic_semantic_scoring:false,files:['rubric.json','score.mjs','README.md'].map(path=>({path,digest:digest(join(root,'evaluator-v2',path))}))},
 primary_catalog_member:false,formal_primary_admission:false,
 calibration:{status:'not_run',ready_for_measurement:false,limits:'Registered task and model-free contract checks only. No actual solver trial, correct UI reference implementation or difficulty calibration has been run. Historical seven-challenge acceptance is unchanged.'}
};}
export function seal(write=false){
 const files=inventory(),manifest={schema:'ask.ui-challenge-input@1',fixture_id:id,counts:{files:files.length,bytes:files.reduce((s,f)=>s+f.bytes,0)},files};
 const manifestPath=join(root,'input-manifests',id+'.json');
 if(write)writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 else assert.deepEqual(JSON.parse(readFileSync(manifestPath)),manifest,'CH08 public input drift');
 const catalogPath=join(source,'benchmarks/practical-challenges.json'),catalog=JSON.parse(readFileSync(catalogPath));
 const registration=expectedRegistration(),index=catalog.challenges.findIndex(c=>c.id===id);
 if(write){if(index<0)catalog.challenges.push(registration);else catalog.challenges[index]=registration;writeFileSync(catalogPath,JSON.stringify(catalog,null,2)+'\n');}
 else {assert.ok(index>=0,'CH08 not registered');assert.deepEqual(catalog.challenges[index],registration,'CH08 registration drift');}
 return manifest.counts;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){console.log(JSON.stringify({status:'ok',...seal(process.argv.includes('--write'))}));}
