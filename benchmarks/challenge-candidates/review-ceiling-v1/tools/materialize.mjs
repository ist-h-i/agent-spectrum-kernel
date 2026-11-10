import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {inventory,workspace} from './manifest.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=process.argv[process.argv.indexOf('--out')+1];
if(!process.argv.includes('--out')||!output) throw new Error('Usage: node tools/materialize.mjs --out /absolute/new-directory');
if(!path.isAbsolute(output)) throw new Error('Absolute output required');
const target=path.resolve(output);const repo=path.resolve(root,'../../..');
if(target===repo||target.startsWith(repo+path.sep)) throw new Error('Measured input must be outside source repository');
const parent=await fs.realpath(path.dirname(target));
if(parent!==path.dirname(target)) throw new Error('Symlink output parent forbidden');
await fs.mkdir(target); // no overwrite, no merging with existing evaluator/source artifacts
try {
 const expected=JSON.parse(await fs.readFile(path.join(root,'input-manifests/rc01-shared-review-platform.json'),'utf8'));
 const rows=await inventory();
 if(JSON.stringify(rows)!==JSON.stringify(expected.files)) throw new Error('Source manifest drift');
 for(const row of rows) {const to=path.join(target,row.path);await fs.mkdir(path.dirname(to),{recursive:true});await fs.copyFile(path.join(workspace,row.path),to);}
 const copied=await inventory(target);
 if(JSON.stringify(copied)!==JSON.stringify(rows)) throw new Error('Materialized bytes differ');
 await fs.writeFile(path.join(target,'INPUT-MANIFEST.json'),JSON.stringify(expected,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({status:'materialized',target,files:rows.length,model_execution:false,private_evaluator_included:false}));
}catch(error){console.error('Incomplete output retained for inspection; not usable as input.');throw error;}
