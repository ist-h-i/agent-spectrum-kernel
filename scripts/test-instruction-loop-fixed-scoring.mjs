import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {canonicalDigest} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {readFixedPointReference} from './instruction-loop-fixed-scoring.mjs';
function fixture(t){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'ask-fixed-score-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const dir=join(root,'capture/work/workspace/app');mkdirSync(dir,{recursive:true});const bytes=Buffer.from('throw new Error("candidate must never run");');writeFileSync(join(dir,'main.js'),bytes);
 const trial=join(root,'trial'),archive=join(trial,'controller/retained-work.tar.gz');mkdirSync(join(trial,'controller'),{recursive:true});assert.equal(spawnSync('/usr/bin/tar',['-czf',archive,'-C',join(root,'capture'),'work']).status,0);
 const pin=path=>({path,digest:hash(readFileSync(path))}),json=(name,v)=>{const path=join(root,name);writeFileSync(path,JSON.stringify(v));return pin(path);};
 const inventory=[{path:'workspace/app/main.js',sha256:hash(bytes).slice(7),bytes:bytes.length,mode:'100644'}],result={exact_lower:'5/2',exact_upper:'7/2',lower:2.5,upper:3.5,quality_score:null,mandatory_compliance:false,observation_completeness_reported:false,runtime_acceptance_verified:null,critical_status:'undetermined',official_benchmark_score:false,evidence_truth_checked:false};
 const calculator=join(root,'calculator.py');writeFileSync(calculator,'def validate(a):\n assert a["items"][0]["status"]=="partial"\n return '+JSON.stringify(result).replaceAll('null','None').replaceAll('false','False')+'\n');
 const identity={candidate_digest:canonicalDigest(inventory),public_input_digest:canonicalDigest('public'),policy_digest:canonicalDigest('fixed-policy')};
 const packet=json('packet.json',{task_id:'synthetic',candidate_inventory:inventory,candidate_digest:identity.candidate_digest,assessment_public_input_digest:identity.public_input_digest,policy_digest:identity.policy_digest});
 const assessment=json('assessment.json',{task_id:'synthetic',identity,items:[{id:'fixed-item',status:'partial',verification:'observed',known_defect:true}]});
 const review=join(root,'review.md');writeFileSync(review,'Independent synthetic source review, no execution.');
 const independent=json('independent.json',{status:'pass',assessment:'assessment.json',assessment_sha256:assessment.digest.slice(7),review_sha256:pin(review).digest.slice(7),reviewer:'synthetic-reviewer',validation:result});
 const refs={kind:'fixed_point_reference_input_v1',trial_id:'baseline-1',fixture_id:'case',task_id:'synthetic',archive_sha256:pin(archive).digest,packet,assessment,independent_verification:independent,review_document:pin(review)};
 const reference=json('reference.json',refs),python=spawnSync('python3',['-c','import sys;print(sys.executable)'],{encoding:'utf8'}).stdout.trim();
 const config={python,calculator:pin(calculator),dependencies:[],scale_maximum:'10',assessments:[reference]},row={trial_id:'baseline-1',fixture_id:'case',role:'baseline',repetition:1,state:'completed',trial_root:trial,cli_seconds:1,root_usage:null,observed_children:[],sampling_errors:[],public_inventory:[]};
 return {root,config,reference,row,refs,pin,json,archiveDigest:pin(archive).digest};
}
test('fixed partial ranges retain exact fractions and unknowns without executing retained source',t=>{
 const f=fixture(t),value=readFixedPointReference(f);assert.equal(value.summary.exact_lower,'5/2');assert.equal(value.summary.exact_upper,'7/2');assert.equal(value.summary.partial_items,1);assert.equal(value.summary.mandatory_compliance,false);assert.equal(value.summary.runtime_acceptance_verified,null);assert.equal(value.candidate_executed,false);assert.equal(value.formal_admission,false);
});
test('archive source, independent review, calculator and trial identity mismatches refuse import',t=>{
 for(const change of [f=>f.row.trial_id='other',f=>writeFileSync(f.refs.review_document.path,'changed review'),f=>writeFileSync(f.config.calculator.path,'def validate(a):return {}'),f=>{const p=JSON.parse(readFileSync(f.refs.packet.path));p.candidate_inventory[0].sha256='0'.repeat(64);p.candidate_digest=canonicalDigest(p.candidate_inventory);f.refs.packet=f.json('packet.json',p);f.reference=f.json('reference.json',f.refs);}]){
  const f=fixture(t);change(f);assert.throws(()=>readFixedPointReference(f));
 }
});
test('standard report and next-cycle summary preserve the separate fixed-point lane while binary results stay unknown',async t=>{
 const f=fixture(t),other={...f.row,trial_id:'candidate-1',role:'challenger'};
 t.mock.module('./retained-instruction-comparison.mjs',{namedExports:{readRetainedInstructionResults:()=>({rows:[f.row,other]})}});
 const {buildInstructionLoopReferenceReport:build}=await import('./instruction-loop-reference-report.mjs?fixed-points');
 const criteria=f.json('criteria.json',[{fixture_id:'case',requirements:[{requirement_id:'binary',max_points:10}]}]);
 const report=build({storeRoot:f.root,planObjectDigest:canonicalDigest('plan'),criteria,fixedScoring:f.config});
 assert.equal(report.rows[0].fixed_reference.summary.exact_lower,'5/2');assert.equal(report.rows[0].unknown_points,10);assert.equal(report.rows[0].confirmed_points,0);assert.equal(report.rows[1].fixed_reference,null);
 report.rows[0].fixed_reference.calculator_result.critical_status='suspected';
 const {summarizeInstructionLoopEvaluation}=await import('./instruction-loop-feedback.mjs');const summary=summarizeInstructionLoopEvaluation(report);
 const condition=summary.cases[0].conditions.find(c=>c.condition==='baseline');assert.equal(condition.fixed_reference.exact_upper,'7/2');assert.equal(condition.fixed_reference.critical_status,'suspected');assert.equal(condition.outcome,'unknown');
 assert.equal(JSON.stringify(summary).includes(f.root),false);assert.equal(JSON.stringify(summary).includes('candidate must never run'),false);
});
test('bad optional fixed judgment is recorded without erasing usable execution or selecting an ambiguous duplicate',async t=>{
 const f=fixture(t);t.mock.module('./retained-instruction-comparison.mjs',{namedExports:{readRetainedInstructionResults:()=>({rows:[f.row,{...f.row,trial_id:'candidate-1',role:'challenger'}]})}});
 const {buildInstructionLoopReferenceReport:build}=await import('./instruction-loop-reference-report.mjs?optional-fixed');
 const criteria=f.json('criteria.json',[{fixture_id:'case',requirements:[{requirement_id:'binary',max_points:10}]}]);
 const options={storeRoot:f.root,planObjectDigest:canonicalDigest('plan'),criteria,fixedScoring:f.config};
 writeFileSync(f.refs.review_document.path,'invalid independent source');let report=build(options);
 assert.equal(report.rows[0].fixed_reference,null);assert.equal(report.rows[0].cli_seconds,1);assert.equal(report.fixed_scoring_incidents.length,1);
 f.config.assessments=[f.reference,f.reference];report=build(options);assert.equal(report.rows[0].fixed_reference,null);assert.match(report.fixed_scoring_incidents[0].reason,/ambiguous/);
});
test('unsafe archive paths, duplicate entries and a selected symlink never become source-grade evidence',t=>{
 for(const kind of ['traversal','duplicate','symlink']){
  const f=fixture(t),archive=join(f.row.trial_root,'controller/retained-work.tar.gz');
  const script=`import io,tarfile,sys\np,kind=sys.argv[1:]\ndata=b'throw new Error("candidate must never run");'\nwith tarfile.open(p,'w:gz') as t:\n m=tarfile.TarInfo('work/workspace/app/main.js');m.size=len(data);m.mode=0o644\n if kind=='symlink':m.type=tarfile.SYMTYPE;m.linkname='other';m.size=0;t.addfile(m)\n else:t.addfile(m,io.BytesIO(data))\n if kind=='duplicate':t.addfile(m,io.BytesIO(data))\n if kind=='traversal':m=tarfile.TarInfo('work/../escape');m.size=0;t.addfile(m)\n`;
  assert.equal(spawnSync(f.config.python,['-B','-c',script,archive,kind]).status,0);f.archiveDigest=f.pin(archive).digest;f.refs.archive_sha256=f.archiveDigest;f.reference=f.json('reference.json',f.refs);
  assert.throws(()=>readFixedPointReference(f),/verification failed/);
 }
});
test('pinned calculator and local Python dependencies execute verified source rather than stale unpinned bytecode',t=>{
 const f=fixture(t),dependency=join(f.root,'factor.py');writeFileSync(dependency,'def factor():return 2.5\n');
 const calc=f.config.calculator.path;writeFileSync(calc,'from factor import factor\n'+readFileSync(calc,'utf8').replace(' assert a[',' assert factor()==2.5\n assert a['));f.config.calculator=f.pin(calc);f.config.dependencies=[f.pin(dependency)];
 const poison=`import sys,os,py_compile\nfrom pathlib import Path\nfor name in sys.argv[1:]:\n p=Path(name);original=p.read_bytes();before=p.stat();bad=b'raise Exception\\n';p.write_bytes(bad+b'#'*(len(original)-len(bad)));os.utime(p,ns=(before.st_atime_ns,before.st_mtime_ns));py_compile.compile(str(p),doraise=True);p.write_bytes(original);os.utime(p,ns=(before.st_atime_ns,before.st_mtime_ns))\n`;
 assert.equal(spawnSync(f.config.python,['-c',poison,calc,dependency]).status,0);
 const unchecked=spawnSync(f.config.python,['-I','-B','-c','import sys;sys.path.insert(0,sys.argv[1]);import factor',f.root],{encoding:'utf8'});assert.notEqual(unchecked.status,0,'fixture must contain usable unpinned cache');
 assert.equal(readFixedPointReference(f).summary.exact_lower,'5/2');
});
