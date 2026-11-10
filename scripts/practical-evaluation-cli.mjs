#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { readJsonFileStrict,canonicalDigest } from './content-addressed-store.mjs';
import { createPracticalEvaluationCommandRuntime } from './instruction-loop-command-runtime.mjs';
import { advancePracticalEvaluation,inspectPracticalEvaluation } from './practical-evaluation-runner.mjs';
import {listPracticalChallenges,preparePracticalChallenge,inspectPracticalChallenge,startPracticalChallenge,preparePracticalChallengeScoreHandoff} from './practical-challenge-evaluation.mjs';
const args=process.argv.slice(2),command=args.shift(),o={};
try{
  while(args.length){const key=args.shift();assert.match(key,/^--[a-z-]+$/u);assert.equal(o[key],undefined);o[key]=key==='--allow-model-calls'?true:args.shift();}
  if(command==='challenge-list'){assert.equal(Object.keys(o).length,0);console.log(JSON.stringify(listPracticalChallenges(),null,2));}
  else if(command.startsWith('challenge-')){
    const allowed={ 'challenge-prepare':['--config'], 'challenge-status':['--root'], 'challenge-start':['--root','--confirm','--allow-model-calls'], 'challenge-resume':['--root','--confirm','--allow-model-calls'], 'challenge-score-handoff':['--root','--evaluator-root'] };
    assert.ok(allowed[command]&&Object.keys(o).every(k=>allowed[command].includes(k)),'unsupported challenge options');
    let report;
    if(command==='challenge-prepare'){assert.ok(o['--config']);report=preparePracticalChallenge(readJsonFileStrict(resolve(o['--config'])));}
    else{assert.ok(o['--root']);const root=resolve(o['--root']);
      if(command==='challenge-status')report=inspectPracticalChallenge(root);
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
