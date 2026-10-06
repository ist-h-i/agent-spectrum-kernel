#!/usr/bin/env node
import { replayCoreScoredCapture } from './ask-core-grading-authority.mjs';

const [action,root,digest,...extra]=process.argv.slice(2);
if(action!=='replay'||!root||!/^sha256:[a-f0-9]{64}$/u.test(digest??'')||extra.length){
  console.error('Usage: node scripts/ask-core-scored-replay.mjs replay /absolute/capsule sha256:<external-digest>');
  process.exitCode=2;
}else{
  const result=replayCoreScoredCapture(root,digest);
  console.log(JSON.stringify(result));
  process.exitCode=result.status==='offline_scored_capture_verified'?0:1;
}
