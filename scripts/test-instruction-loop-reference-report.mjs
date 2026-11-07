import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
test('reference report preserves unknowns, binds judgments to archives and does not turn partial usage into a full total',async t=>{
  const root=realpathSync(mkdtempSync(join(tmpdir(),'ask-report-loop-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const rows=['baseline','challenger'].map((role,i)=>{const path=join(root,role,'controller');mkdirSync(path,{recursive:true});writeFileSync(join(path,'retained-work.tar.gz'),'synthetic archive '+i);
    return {trial_id:'fixture-'+i,fixture_id:'public-fixture',role,repetition:1,state:'completed',trial_root:join(root,role),cli_seconds:i+1,
      root_usage:i?null:{input_tokens:10,cached_input_tokens:4,output_tokens:2},observed_children:[],sampling_errors:[]};});
  t.mock.module('./retained-instruction-comparison.mjs',{namedExports:{readRetainedInstructionResults:()=>({rows})}});
  const {buildInstructionLoopReferenceReport:build}=await import('./instruction-loop-reference-report.mjs');
  const criteria=join(root,'criteria.json');writeFileSync(criteria,JSON.stringify([{fixture_id:'public-fixture',requirements:[{requirement_id:'quality',max_points:10}]}]));
  const pin=path=>({path,digest:hash(readFileSync(path))}),options={storeRoot:root,planObjectDigest:'synthetic-plan',criteria:pin(criteria)};
  let report=build(options);assert.equal(report.conditions.baseline.unknown_points,10);assert.equal(report.conditions.challenger.root_input_tokens,null);assert.equal(report.full_hierarchical_usage,null);assert.equal(report.formal_score,null);
  const assessment=join(root,'assessment.json');writeFileSync(assessment,JSON.stringify({trial_id:'fixture-0',fixture_id:'public-fixture',archive_sha256:hash(readFileSync(join(root,'baseline/controller/retained-work.tar.gz'))),formal_score:null,formal_admission:false,
    requirements:[{requirement_id:'quality',max_points:10,outcome:'pass',reference_points:10,reason:'Synthetic existing judgment only'}]}));
  report=build({...options,assessments:[pin(assessment)]});assert.equal(report.conditions.baseline.confirmed_points,10);assert.equal(report.conditions.challenger.unknown_points,10);
  rows[0].observed_children=[{thread_id:'observed-child',observed_partial_usage:{input_tokens:5,cached_input_tokens:1,output_tokens:2},models_efforts:[{model:'different-child-model',effort:'high'}]},{thread_id:'missing-child',observed_partial_usage:null}];
  report=build(options);assert.equal(report.conditions.baseline.observed_root_plus_recovered_children_usage.input_tokens,15);
  assert.equal(report.conditions.baseline.observed_child_missing_components.input_tokens,1);assert.equal(report.conditions.baseline.observed_sum_is_complete_tree_total,false);
  assert.equal(report.rows[0].observed_children[0].models_efforts[0].model,'different-child-model');
  writeFileSync(join(root,'baseline/controller/retained-work.tar.gz'),'changed');assert.throws(()=>build({...options,assessments:[pin(assessment)]}),/different answer/);
});
test('optional dynamic binary references preserve usable trials and reject duplicates without choosing an order',async t=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'ask-dynamic-reference-')));t.after(()=>rmSync(root,{recursive:true,force:true}));const trial_root=join(root,'trial');mkdirSync(join(trial_root,'controller'),{recursive:true});writeFileSync(join(trial_root,'controller/retained-work.tar.gz'),'archive');
 const row={trial_id:'t',fixture_id:'c',role:'baseline',repetition:1,state:'completed',trial_root,cli_seconds:1,root_usage:null,observed_children:[],sampling_errors:[]};
 t.mock.module('./retained-instruction-comparison.mjs',{namedExports:{readRetainedInstructionResults:()=>({rows:[row,{...row,trial_id:'other',role:'challenger'}]})}});const {buildInstructionLoopReferenceReport:build}=await import('./instruction-loop-reference-report.mjs?dynamic-binary');
 const pin=path=>({path,digest:hash(readFileSync(path))}),write=(name,v)=>{const p=join(root,name);writeFileSync(p,JSON.stringify(v));return pin(p);};
 const criteria=write('criteria.json',[{fixture_id:'c',requirements:[{requirement_id:'q',max_points:4}]}]);const a={trial_id:'t',fixture_id:'c',archive_sha256:hash(Buffer.from('archive')),formal_score:null,formal_admission:false,requirements:[{requirement_id:'q',max_points:4,outcome:'pass',reference_points:4}]};
 const ref=write('judgment.json',a),options={storeRoot:root,planObjectDigest:'synthetic',criteria};
 let r=build({...options,dynamicAssessments:[ref]});assert.equal(r.conditions.baseline.confirmed_points,4);
 r=build({...options,assessments:[ref],dynamicAssessments:[ref]});assert.equal(r.conditions.baseline.unknown_points,4);assert.equal(r.reference_scoring_incidents.length,1);
 const wrong=write('wrong.json',{...a,archive_sha256:hash(Buffer.from('other')),mandatory_final_validation_fulfilled_reference:false});r=build({...options,dynamicAssessments:[null,wrong]});assert.equal(r.conditions.baseline.unknown_points,4);assert.equal(r.reference_scoring_incidents.length,2);assert.equal(r.rows[0].state,'completed');assert.equal(r.rows[0].mandatory_final_validation,null);assert.equal(r.conditions.baseline.mandatory_validation_failed,0);assert.equal(r.conditions.baseline.mandatory_validation_unknown,1);
});
