// Private reference inputs remain in caller-owned files; never stage a grader in a task workspace.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {readJsonFileStrict,readStableBytes,canonicalDigest} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
const pin=ref=>assert.equal(hash(readStableBytes(ref.path,'fixed reference scoring input',16*1024*1024)),ref.digest,'fixed reference scoring drift');
const fraction=s=>{assert.ok(typeof s==='string'&&/^\d{1,18}(?:\/[1-9]\d{0,17})?$/u.test(s),'bounded exact fraction required');const [n,d='1']=s.split('/');return [BigInt(n),BigInt(d)];};
export function validateFixedPointReferenceSummary(v){
 assert.deepEqual(Object.keys(v).sort(),['kind','exact_lower','exact_upper','scale_maximum','mandatory_compliance','observation_completeness_reported','runtime_acceptance_verified','critical_status','partial_items','undetermined_items','formal_admission','evidence_truth_checked','capture_complete'].sort());
 assert.equal(v.kind,'fixed_point_reference_summary_v1');const lo=fraction(v.exact_lower),hi=fraction(v.exact_upper),max=fraction(v.scale_maximum);
 const le=(a,b)=>a[0]*b[1]<=b[0]*a[1];assert.ok(le(lo,hi)&&le(hi,max));
 for(const k of ['mandatory_compliance','observation_completeness_reported','runtime_acceptance_verified'])assert.ok(v[k]===null||typeof v[k]==='boolean');
 assert.ok(['none_observed','observed','suspected','undetermined'].includes(v.critical_status));
 for(const k of ['partial_items','undetermined_items'])assert.ok(Number.isSafeInteger(v[k])&&v[k]>=0&&v[k]<=10000);
 assert.equal(v.formal_admission,false);assert.equal(v.evidence_truth_checked,false);assert.equal(v.capture_complete,false);
 return v;
}
export function fixedPointReferenceSummary(score){
 if(!score)return null;const r=score.calculator_result;
 return validateFixedPointReferenceSummary({kind:'fixed_point_reference_summary_v1',exact_lower:r.exact_lower,exact_upper:r.exact_upper,scale_maximum:score.scale_maximum,
  mandatory_compliance:r.mandatory_compliance??null,observation_completeness_reported:r.observation_completeness_reported??null,runtime_acceptance_verified:r.runtime_acceptance_verified??null,
  critical_status:r.critical_status,partial_items:score.items.filter(x=>x.status==='partial').length,undetermined_items:score.items.filter(x=>x.status==='undetermined').length,
  formal_admission:false,evidence_truth_checked:false,capture_complete:false});
}
export function readFixedPointReference({config,reference,row,archiveDigest}){
 pin(reference);const refs=readJsonFileStrict(reference.path,'fixed point reference input',16*1024*1024);
 assert.equal(refs.kind,'fixed_point_reference_input_v1');assert.equal(refs.trial_id,row.trial_id);assert.equal(refs.fixture_id,row.fixture_id);assert.equal(refs.archive_sha256,archiveDigest,'fixed points belong to different answer');
 assert.equal(resolve(config.python),config.python);fraction(config.scale_maximum);pin(config.calculator);assert.ok(Array.isArray(config.dependencies));for(const p of config.dependencies)pin(p);
 const archive={path:join(row.trial_root,'controller/retained-work.tar.gz'),digest:archiveDigest};
 const request={config,refs,archive,public_paths:(row.public_inventory??[]).map(f=>f.path)};
 const out=spawnSync(config.python,['-I','-B',join(import.meta.dirname,'instruction-loop-fixed-scoring.py')],{input:JSON.stringify(request),encoding:'utf8',maxBuffer:4*1024*1024,timeout:60000});
 assert.equal(out.status,0,'fixed reference verification failed: '+String(out.stderr).slice(0,2048));
 const value=JSON.parse(out.stdout);assert.equal(value.kind,'fixed_point_reference_result_v1');
 assert.equal(value.calculator_result.runtime_acceptance_verified,null,'source-only calculator cannot assert runtime acceptance');
 assert.equal(value.calculator_result.official_benchmark_score,false);assert.equal(value.calculator_result.evidence_truth_checked,false);
 value.scale_maximum=config.scale_maximum;value.summary=fixedPointReferenceSummary(value);value.source_inputs=[reference,refs.packet,refs.assessment,refs.independent_verification,refs.review_document,config.calculator,...config.dependencies];
 value.result_digest=canonicalDigest(value);return value;
}
