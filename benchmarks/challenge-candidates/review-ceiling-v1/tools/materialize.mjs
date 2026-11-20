import fs from 'node:fs/promises';
import path from 'node:path';
import {manifestBytes,sealedInput} from './manifest.mjs';
import {evaluationFile,evaluationSource} from '../../../../scripts/evaluation-task-inputs.mjs';
const output=process.argv[process.argv.indexOf('--out')+1];
if(!process.argv.includes('--out')||!output) throw new Error('Usage: node tools/materialize.mjs --out /absolute/new-directory');
if(!path.isAbsolute(output)) throw new Error('Absolute output required');
const target=path.resolve(output);
if(target===evaluationSource||target.startsWith(evaluationSource+path.sep)) throw new Error('Measured input must be outside source repository');
const parent=await fs.realpath(path.dirname(target));
if(parent!==path.dirname(target)) throw new Error('Symlink output parent forbidden');
const rows=sealedInput().files;
const manifest=manifestBytes();
await fs.mkdir(target); // no overwrite, no merging with existing evaluator/source artifacts
try {
 for(const row of rows) {
  const to=path.join(target,row.path);
  await fs.mkdir(path.dirname(to),{recursive:true});
  await fs.writeFile(to,row.bytes,{flag:'wx'});
  evaluationFile(to,'materialized review input',row.digest,row.bytes.length);
 }
 await fs.writeFile(path.join(target,'INPUT-MANIFEST.json'),manifest,{flag:'wx'});
 console.log(JSON.stringify({status:'materialized',target,files:rows.length,model_execution:false,private_evaluator_included:false}));
}catch(error){console.error('Incomplete output retained for inspection; not usable as input.');throw error;}
