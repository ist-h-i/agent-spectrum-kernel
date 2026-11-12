import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { buildNpmPackage } from './build-npm-package.mjs';
import { createMeasurementFixture, REVISIONS, REVIEW_ACTOR } from './verification-reuse-measurement-fixture.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const run=(exe,args,options={})=>spawnSync(exe,args,{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,...options});
const okay=r=>{assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout;};
const sha=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');

test('installed npm verification: reuse, invalidation, missing evidence and explicit host provider', {timeout:180000},()=>{
  const temp=mkdtempSync(join(tmpdir(),'ask-installed-verification-'));
  const f=createMeasurementFixture({independent:true});
  try {
    buildNpmPackage(ROOT);
    const env={...process.env,npm_config_cache:join(temp,'npm-cache')};
    const packed=JSON.parse(okay(run('npm',['pack','--ignore-scripts','--json','--pack-destination',temp],{cwd:ROOT,env})))[0];
    const app=join(temp,'app');mkdirSync(app);writeFileSync(join(app,'package.json'),'{"private":true}');
    okay(run('npm',['install','--ignore-scripts','--no-audit','--no-fund',join(temp,packed.filename)],{cwd:app,env}));
    const bin=join(app,'node_modules','.bin','ask');
    const calls=join(temp,'provider-calls.jsonl'), provider=join(temp,'trusted-provider.mjs');
    // Synthetic host authority, deliberately outside the repository under review.
    // This validates transport/current-query binding, not real AI review quality.
    writeFileSync(provider,`import {appendFileSync} from 'node:fs';\nexport const providers={'measurement-review-state': query=>{appendFileSync(${JSON.stringify(calls)},JSON.stringify(query)+'\\n');return {query,status:'satisfied',actor_id:${JSON.stringify(REVIEW_ACTOR)},evidence_digest:'sha256:${'a'.repeat(64)}'};}};\n`);
    const pin=sha(readFileSync(provider));
    const observed=[];
    const invoke=(command,extra=[],store=f.stores.reuse)=>{
      const started=performance.now();
      const result=run(process.execPath,[bin,'verification',command,'--repository',f.root,'--store',store,'--target',f.head(),...extra],{cwd:app,env});
      observed.push({command,elapsed_ms:performance.now()-started,status:result.status});return result;
    };
    const parsed=(command,extra=[],store)=>JSON.parse(okay(invoke(command,extra,store)));
    const trusted=['--provider-module',provider,'--provider-sha256',pin];
    const initial=f.gates.map(g=>f.execute(g,f.stores.baseline));
    f.bindBaseline('baseline',initial);
    let plan=parsed('prepare');
    assert.equal(plan.deterministic_coverage,'covered');
    assert.equal(plan.dispositions.filter(g=>g.execution_evidence_reusable).length,2);
    let blocked=invoke('coverage');assert.equal(blocked.status,1);assert.equal(JSON.parse(blocked.stdout).status,'blocked');
    let coverage=parsed('coverage',trusted);assert.equal(coverage.status,'covered');assert.equal(coverage.authorizes_action,false);
    const phases=readFileSync(calls,'utf8').trim().split('\n').map(JSON.parse).map(q=>q.phase);
    assert.ok(phases.includes('initial'));assert.ok(phases.includes('confirm'));
    // No affected dependency: both executed baseline records remain reusable.
    f.revise(REVISIONS[1]);plan=parsed('prepare');
    assert.equal(plan.dispositions.filter(g=>g.execution_evidence_reusable).length,2);
    assert.equal(parsed('coverage',trusted).status,'covered');
    // A valid source modification still requires fresh deterministic evidence.
    f.revise({name:'changed implementation',path:'src/limit.mjs',content:'export const withinLimit = (amount, limit) => 0 <= amount && amount <= limit;\n'});
    plan=parsed('prepare');
    assert.equal(plan.dispositions.filter(g=>g.execution_evidence_reusable).length,1);
    assert.equal(plan.deterministic_coverage,'blocked');
    blocked=invoke('coverage',trusted);assert.equal(blocked.status,1);assert.equal(JSON.parse(blocked.stdout).status,'blocked');
    const rerun=f.execute(f.gates[0],f.stores.reuse);
    assert.equal(parsed('prepare').deterministic_coverage,'covered');
    assert.equal(parsed('coverage',trusted).status,'covered');
    // The installed command must dispatch the planner's actual scope rather
    // than relying on a caller to choose changed paths manually.
    const reviewer=join(temp,'trusted-reviewer.mjs');
    writeFileSync(reviewer,`export const providers={review:request=>({result:{request_digest:request.request_digest,target_revision:request.target_revision,reviewed_paths:request.paths,reviewed_obligations:request.obligations.map(o=>o.ref),judgment_refs:request.judgment_refs,findings:[],decision:'pass'}})};`);
    const reviewFlags=['--allow-review','true','--provider-module',reviewer,'--provider-sha256',sha(readFileSync(reviewer))];
    const reviewed=parsed('review',reviewFlags);
    assert.equal(reviewed.status,'reviewed');
    assert.equal(reviewed.authorizes_action,false);
    assert.deepEqual(reviewed.result.reviewed_paths,['src/limit.mjs']);
    assert.deepEqual(reviewed.result.reviewed_obligations,['AC-limit-inclusive']);
    assert.notEqual(invoke('review',reviewFlags.slice(2)).status,0,'model dispatch must be explicitly opted in');
    const empty=join(temp,'empty-store');mkdirSync(empty);
    blocked=invoke('coverage',trusted,empty);assert.equal(blocked.status,1);assert.equal(JSON.parse(blocked.stdout).status,'blocked');
    assert.notEqual(invoke('coverage',['--provider-module',provider]).status,0);
    assert.notEqual(invoke('coverage',['--provider-module',provider,'--provider-sha256','sha256:'+ '0'.repeat(64)]).status,0);
    // Host module was explicitly pinned; byte drift invalidates that permission.
    writeFileSync(provider,readFileSync(provider,'utf8')+'\n// drift\n');
    assert.notEqual(invoke('coverage',trusted).status,0);
    assert.ok(observed.every(v=>Number.isFinite(v.elapsed_ms)&&v.elapsed_ms>=0));
    console.log(JSON.stringify({acceptance:'installed-npm-synthetic-host-authority',deterministic_executions:initial.length+1,
      reused_gate_counts:{unchanged:2,unrelated_change:2,affected_change_before_rerun:1},
      deterministic_elapsed_ms:initial.reduce((n,e)=>n+e.duration_ms,0)+rerun.duration_ms,cli_observations:observed,
      model_tokens:{status:'unavailable',value:null,reason:'no_model_invocation'},live_model_quality:'not_measured'}));
  } finally { f.dispose();rmSync(temp,{recursive:true,force:true}); }
});
