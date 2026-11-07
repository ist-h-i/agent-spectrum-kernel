// Read retained execution records and fixed, hash-bound reference judgments.
// Missing judgments stay Unknown; this is not formal admission or a new grader.
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {readStableBytes,readJsonFileStrict,canonicalDigest} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {readFixedPointReference} from './instruction-loop-fixed-scoring.mjs';
import {readRetainedInstructionResults} from './retained-instruction-comparison.mjs';
const keys=['input_tokens','cached_input_tokens','output_tokens'];
const checked=r=>{assert.equal(hash(readStableBytes(r.path,'fixed report input',16*1024*1024)),r.digest,'report input drift');return readJsonFileStrict(r.path,'fixed report input',16*1024*1024);};
const referenceDigest=ref=>typeof ref?.digest==='string'&&/^sha256:[a-f0-9]{64}$/u.test(ref.digest)?ref.digest:canonicalDigest(ref??null);
const total=(rows,key)=>rows.every(r=>Number.isFinite(r[key]))?rows.reduce((n,r)=>n+r[key],0):null;
export function buildInstructionLoopReferenceReport({storeRoot,planObjectDigest,trustedAssetAuthorityContexts=[],criteria,assessments=[],recovery=null,limits=[],executionKind='real_codex',fixedScoring=null}){
  const retained=readRetainedInstructionResults({storeRoot,planObjectDigest,trustedAssetAuthorityContexts}),fixed=checked(criteria);
  assert.ok(retained.rows.every(r=>['completed','failed_or_interrupted'].includes(r.state)),'report cannot hide unfinished/uncertain trial');
  const recovered=recovery?checked(recovery):null;
  const byChild=new Map((recovered?.children??[]).map(c=>[c.thread_id,c.decoder_observation??null]));
  const judgments=new Map(assessments.map(ref=>{const a=checked(ref);assert.equal(a.formal_score,null);assert.equal(a.formal_admission,false);return [a.trial_id,{ref,a}];}));
  assert.equal(judgments.size,assessments.length,'duplicate reference assessment');
  const pointRefs=new Map(),duplicatePointTrials=new Set(),fixedScoringIncidents=[];
  for(const ref of fixedScoring?.assessments??[]){
    try{const a=checked(ref);assert.ok(retained.rows.some(r=>r.trial_id===a.trial_id),'fixed point reference has an unknown trial');
      if(pointRefs.has(a.trial_id)||duplicatePointTrials.has(a.trial_id)){pointRefs.delete(a.trial_id);duplicatePointTrials.add(a.trial_id);throw new Error('duplicate fixed point reference; no ambiguous result selected');}pointRefs.set(a.trial_id,ref);
    }catch(error){fixedScoringIncidents.push({reference_digest:referenceDigest(ref),reason:String(error.message).slice(0,512)});}
  }
  const rows=retained.rows.map(r=>{
    const f=fixed.find(f=>f.fixture_id===r.fixture_id);assert.ok(f,'fixed criterion missing');
    const item=judgments.get(r.trial_id),archive=hash(readStableBytes(join(r.trial_root,'controller/retained-work.tar.gz'),'retained answer archive',128*1024*1024));
    let requirements=f.requirements.map(q=>({requirement_id:q.requirement_id,max_points:q.max_points,outcome:'unknown',reason:'No fixed reference judgment is available for this retained answer.'}));
    if(item){
      const {a}=item;assert.equal(a.fixture_id,r.fixture_id);assert.equal(a.archive_sha256,archive,'reference judgment belongs to a different answer');
      assert.deepEqual(a.requirements.map(q=>[q.requirement_id,q.max_points]),f.requirements.map(q=>[q.requirement_id,q.max_points]),'reference weights changed');
      requirements=a.requirements;for(const q of requirements){assert.ok(['pass','fail','unknown'].includes(q.outcome));assert.equal(q.reference_points,q.outcome==='unknown'?null:q.outcome==='pass'?q.max_points:0);}
    }
    const children=(r.observed_children??[]).map(c=>({...c,usage:byChild.get(c.thread_id)?.partial_observed_usage??c.observed_partial_usage??null,
      models_efforts:byChild.get(c.thread_id)?.models_efforts??c.models_efforts??null,
      terminal_state:byChild.get(c.thread_id)?.terminal_state??c.terminal_state??null}));
    const child=Object.fromEntries(keys.map(k=>[k,children.some(c=>Number.isSafeInteger(c.usage?.[k]))?children.reduce((n,c)=>n+(Number.isSafeInteger(c.usage?.[k])?c.usage[k]:0),0):null]));
    let fixedReference=null;
    if(pointRefs.has(r.trial_id))try{fixedReference=readFixedPointReference({config:fixedScoring,reference:pointRefs.get(r.trial_id),row:r,archiveDigest:archive});}
    catch(error){fixedScoringIncidents.push({trial_id:r.trial_id,reference_digest:pointRefs.get(r.trial_id).digest,reason:String(error.message).slice(0,512)});}
    return {fixed_reference:fixedReference,trial_id:r.trial_id,fixture_id:r.fixture_id,role:r.role,repetition:r.repetition,state:r.state,archive_sha256:archive,
      cli_seconds:r.cli_seconds,root_input_tokens:r.root_usage?.input_tokens??null,root_cached_input_tokens_subset:r.root_usage?.cached_input_tokens??null,root_output_tokens:r.root_usage?.output_tokens??null,
      confirmed_points:requirements.filter(q=>q.outcome==='pass').reduce((n,q)=>n+q.max_points,0),unknown_points:requirements.filter(q=>q.outcome==='unknown').reduce((n,q)=>n+q.max_points,0),
      unmet_points:requirements.filter(q=>q.outcome==='fail').reduce((n,q)=>n+q.max_points,0),maximum_points:f.requirements.reduce((n,q)=>n+q.max_points,0),requirements,
      mandatory_final_validation:item?.a.mandatory_final_validation_fulfilled_reference??null,
      observed_children:children,observed_child_partial_usage:child,sampling_errors:r.sampling_errors,root_usage_status:r.root_usage_status??'unknown',
      runner_returncode:r.runner_returncode??null,usage_pipeline_status:r.native_usage_status??null,formal_score:null,full_hierarchical_usage:null};
  });
  const childIds=rows.flatMap(r=>r.observed_children.map(c=>c.thread_id));
  const duplicateChildren=[...new Set(childIds.filter((id,i)=>childIds.indexOf(id)!==i))];
  const conditions=Object.fromEntries(['baseline','challenger'].map(role=>{
    const rs=rows.filter(r=>r.role===role),children=rs.flatMap(r=>r.observed_children);
    return [role,{trials:rs.length,...Object.fromEntries(['confirmed_points','unknown_points','unmet_points','maximum_points','cli_seconds','root_input_tokens','root_cached_input_tokens_subset','root_output_tokens'].map(k=>[k,total(rs,k)])),
      observed_child_partial_usage:Object.fromEntries(keys.map(k=>[k,duplicateChildren.length===0&&rs.some(r=>r.observed_child_partial_usage[k]!==null)?rs.reduce((n,r)=>n+(r.observed_child_partial_usage[k]??0),0):null])),
      observed_child_records:children.length,mandatory_validation_failed:rs.filter(r=>r.mandatory_final_validation===false).length,mandatory_validation_unknown:rs.filter(r=>r.mandatory_final_validation===null).length,
      observed_child_missing_components:Object.fromEntries(keys.map(k=>[k,children.filter(c=>!Number.isSafeInteger(c.usage?.[k])).length])),
      full_hierarchical_usage:null,formal_score:null}];
  }));
  for(const c of Object.values(conditions)){
    c.observed_root_plus_recovered_children_usage=Object.fromEntries(keys.map((k,i)=>{
      const root=c[['root_input_tokens','root_cached_input_tokens_subset','root_output_tokens'][i]],child=c.observed_child_partial_usage[k];
      return [k,root!==null&&child!==null?root+child:null];
    }));
    c.observed_sum_is_complete_tree_total=false;
  }
  const pairs=[];
  for(const b of rows.filter(r=>r.role==='baseline')){
    const c=rows.find(r=>r.role==='challenger'&&r.fixture_id===b.fixture_id&&r.repetition===b.repetition);assert.ok(c,'unpaired report row');
    pairs.push({fixture_id:b.fixture_id,repetition:b.repetition,baseline_trial:b.trial_id,challenger_trial:c.trial_id,
      deltas:Object.fromEntries(['confirmed_points','unknown_points','cli_seconds','root_input_tokens','root_output_tokens'].map(k=>[k,b[k]===null||c[k]===null?null:c[k]-b[k]]))});
  }
  return {kind:'supervised_instruction_reference_report_v1',plan_object_digest:planObjectDigest,execution_kind:executionKind,rows,pairs,conditions,
    fixed_scoring_incidents:fixedScoringIncidents,duplicate_child_thread_ids:duplicateChildren,source_inputs:[criteria,...assessments,...(fixedScoring?.assessments??[]),...(fixedScoring?[fixedScoring.calculator,...fixedScoring.dependencies]:[]),...rows.flatMap(r=>r.fixed_reference?.source_inputs??[]),...(recovery?[recovery]:[])],limits:[...limits,'Observed tasks and reference judgments, not independent formal admission.','Cached input is an input subset; child observations are partial; complete hierarchical usage remains unknown.'],
    formal_score:null,full_hierarchical_usage:null,adoption:{status:'awaiting_human_change_decision',formally_certified:false},report_digest:canonicalDigest({planObjectDigest,rows,limits})};
}
