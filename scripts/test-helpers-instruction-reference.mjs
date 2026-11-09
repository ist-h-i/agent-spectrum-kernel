import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {canonicalDigest} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
// Entirely synthetic references; no real model or human result is represented.
export function referenceFixture(dir,candidate){
 const manifest={kind:'instruction_loop_reference_evidence_v1',candidate_digest:canonicalDigest(candidate),source_revision:candidate.source_revision,baseline_revision:candidate.baseline_revision,environment_object_digest:candidate.environment_object_digest,artifacts:[],attempts:[],limitations:['Synthetic same-candidate comparison. Setup and permissions differ; partial usage excludes descendants.']};
 const artifact=(id,role,value)=>{const path=join(dir,id+'.json'),bytes=Buffer.from(JSON.stringify(value));writeFileSync(path,bytes);manifest.artifacts.push({id,role,path,digest:hash(bytes)});};
 artifact('approved-case','case_approval',{synthetic:true,scope:'Same public task in three contexts only; no adoption permission.'});artifact('input','input',{synthetic:true,task:'Implement a public search page.'});artifact('comparison','report',{synthetic:true,quality:'Not an instruction-effect measurement.'});
 for(const [i,status] of ['completed','failed','completed','completed'].entries()){
  const id='attempt-'+i,condition=['plain','framework','framework','foundation'][i];
  artifact(id,'receipt',{synthetic:true,condition,status,usage:i===1?null:{root_input_tokens:100,root_output_tokens:50},descendants:'unknown'});
  manifest.attempts.push({id,condition,status,selected:status==='completed',closure:'host_observed_closed',receipt:id,input:'input',case_approval:'approved-case',environment_object_digest:candidate.environment_object_digest,source_revision:candidate.source_revision});
 }
 return manifest;
}
