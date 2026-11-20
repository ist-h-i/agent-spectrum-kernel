#!/usr/bin/env node
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readJsonFileStrict,canonicalDigest } from './content-addressed-store.mjs';
import { createPracticalEvaluationCommandRuntime } from './instruction-loop-command-runtime.mjs';
import { advancePracticalEvaluation,inspectPracticalEvaluation } from './practical-evaluation-runner.mjs';
import {listPracticalChallenges,preparePracticalChallenge,inspectPracticalChallenge,startPracticalChallenge,preparePracticalChallengeScoreHandoff} from './practical-challenge-evaluation.mjs';
import {importChallengeSemanticAssessment} from './practical-challenge-worker.mjs';
import {listEvaluationTasks} from './evaluation-task-catalog.mjs';
import {prepareEvaluationTaskInput} from './evaluation-task-inputs.mjs';
import {preparePrimaryPublicInputs,verifyPrimaryPublicInputs} from './ask-primary-evaluation-prepare.mjs';

function prepareSelectedTask(options) {
  assert.ok(options['--id'] && options['--root'], 'task-prepare requires --id and --root');
  const root = resolve(options['--root']);
  const task = listEvaluationTasks().find(row => row.id === options['--id']);
  assert.ok(task, `unknown evaluation task: ${options['--id']}`);
  const { input, assessment } = task;
  const deliveryMode = options['--delivery-mode'], logisticsSource = options['--logistics-source'];
  assert.ok(!deliveryMode || input.kind === 'business', '--delivery-mode requires CH02–06');
  assert.ok(!logisticsSource || input.kind === 'private', '--logistics-source requires the inventory/logistics task');
  assert.ok(input.kind !== 'private' || logisticsSource, 'the inventory/logistics task requires --logistics-source');
  const configPath = options['--config'];
  assert.ok(!configPath || input.kind === 'staged', '--config is for a staged run (RC01 or CH08)');
  const source = resolve(import.meta.dirname, '..');
  let prepared;
  if (configPath) {
    const config = readJsonFileStrict(resolve(configPath));
    assert.ok(config.id === undefined || config.id === task.id, 'staged config task ID differs from --id');
    assert.ok(config.root === undefined || resolve(config.root) === root, 'staged config root differs from --root');
    const staged_run = preparePracticalChallenge({ ...config, id: task.id, root,
      expectedRegistrationDigest: input.registration_digest });
    const workspace = join(root, 'workspace');
    prepared = { workspace, working_directory: workspace, task_file: join(workspace, input.task_path),
      input_manifest_digest: input.digest, staged_run };
  } else if (input.kind === 'primary') {
    const selection = { fixtureIds: [task.id] };
    preparePrimaryPublicInputs(root, selection);
    const [verified] = verifyPrimaryPublicInputs(root, selection).fixtures;
    assert.equal(verified.public_input_status, 'valid', verified.failures.join('\n'));
    assert.equal(verified.contract_digests['input-manifest.json'], input.digest);
    assert.equal(verified.contract_digests['requirement-record.json'], assessment.digest);
    const workspace = join(root, 'inputs', task.id);
    prepared = { workspace, working_directory: join(workspace, 'workspace'), task_file: join(workspace, 'task.md'),
      file_count: verified.public_files.length, input_manifest_digest: input.digest };
  } else {
    const sourceInput = { ...input };
    if (input.root) sourceInput.root = join(source, input.root);
    if (input.kind === 'staged') sourceInput.manifest = join(source, input.manifest);
    prepared = prepareEvaluationTaskInput({ id: task.id, input: sourceInput, assessment }, root, { deliveryMode, logisticsSource });
  }
  const report = { task_id: task.id, input, assessment, model_calls: 0, ...prepared };
  writeFileSync(join(root, 'evaluation-preparation.json'), JSON.stringify(report, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 });
  return report;
}

const args=process.argv.slice(2),command=args.shift(),o={};
try{
  while(args.length){
    const key=args.shift();assert.match(key,/^--[a-z-]+$/u);assert.equal(o[key],undefined);
    if(key==='--allow-model-calls')o[key]=true;
    else{const value=args.shift();assert.ok(value&&!value.startsWith('--'),`missing value for ${key}`);o[key]=value;}
  }
  if(command==='task-list'){
    assert.ok(Object.keys(o).every(key=>['--difficulty','--type','--skill'].includes(key)),'unsupported task-list options');
    console.log(JSON.stringify(listEvaluationTasks({difficulty:o['--difficulty'],type:o['--type'],skill:o['--skill']}),null,2));
  }
  else if(command==='task-prepare'){
    assert.ok(Object.keys(o).every(key=>['--id','--root','--delivery-mode','--logistics-source','--config'].includes(key)),
      'unsupported task-prepare options');
    console.log(JSON.stringify(prepareSelectedTask(o),null,2));
  }
  else if(command==='challenge-list'){
    // Compatibility for callers that consume staged registration JSON.
    assert.equal(Object.keys(o).length,0);
    console.log(JSON.stringify(listPracticalChallenges(),null,2));
  }
  else if(command.startsWith('challenge-')){
    const allowed={ 'challenge-prepare':['--config'], 'challenge-status':['--root'], 'challenge-start':['--root','--confirm','--allow-model-calls'], 'challenge-resume':['--root','--confirm','--allow-model-calls'], 'challenge-score-handoff':['--root','--evaluator-root'], 'challenge-import-score':['--root','--assessment'] };
    assert.ok(allowed[command]&&Object.keys(o).every(k=>allowed[command].includes(k)),'unsupported challenge options');
    let report;
    if(command==='challenge-prepare'){assert.ok(o['--config']);report=preparePracticalChallenge(readJsonFileStrict(resolve(o['--config'])));}
    else{assert.ok(o['--root']);const root=resolve(o['--root']);
      if(command==='challenge-status')report=inspectPracticalChallenge(root);
      else if(command==='challenge-import-score'){assert.ok(o['--assessment']);report=await importChallengeSemanticAssessment(root,readJsonFileStrict(resolve(o['--assessment'])));}
      else if(command==='challenge-score-handoff')report=preparePracticalChallengeScoreHandoff(root,{evaluatorRoot:o['--evaluator-root']??null});
      else{
        if(o['--allow-model-calls']===true)process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED='1';
        report=await startPracticalChallenge(root,o['--confirm'],{allowModelCalls:o['--allow-model-calls']===true,stage:command==='challenge-start'?'initial':'reassessment'});
      }
    }
    console.log(JSON.stringify(report,null,2));
  }else{
  assert.ok(o['--root']);const root=resolve(o['--root']);
  if(command==='status'){assert.deepEqual(Object.keys(o),['--root']);console.log(JSON.stringify(inspectPracticalEvaluation(root),null,2));}
  else{
    assert.equal(command,'advance');assert.ok(o['--config']);
    assert.ok(Object.keys(o).every(k=>['--root','--config','--decision','--packet','--reason','--assessment','--allow-model-calls'].includes(k)));
    const config=readJsonFileStrict(resolve(o['--config'])),runtime=createPracticalEvaluationCommandRuntime({definition:config.runtime,modelCallsAuthorized:o['--allow-model-calls']===true});
    const result=await advancePracticalEvaluation({root,plan:config.plan,runtime,
      decision:o['--decision']?{disposition:o['--decision'],packet_digest:o['--packet'],reason:o['--reason']}:null,
      assessment:o['--assessment']?readJsonFileStrict(resolve(o['--assessment'])):null});
    console.log(JSON.stringify({...result,pending_packet_digest:result.pending_gate?canonicalDigest(result.pending_gate):null},null,2));
  }
  }
}catch(error){console.error(String(error.message));process.exitCode=1;}
