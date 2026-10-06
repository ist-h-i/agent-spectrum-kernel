import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { deriveEvaluatorDependencyGraph } from './ask-benchmark-evaluator-boundary.mjs';

function graph(source){
 const root=mkdtempSync(join(tmpdir(),'ask-core-regex-closure-'));
 try{
  writeFileSync(join(root,'entry.mjs'),source);
  for(const args of [['init'],['add','.'],['-c','user.name=ASK test','-c','user.email=ask-test@example.invalid','commit','-m','regex closure fixture']])execFileSync('git',args,{cwd:root,stdio:'ignore'});
  const baseRevision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  return deriveEvaluatorDependencyGraph({root,baseRevision,entryPaths:['entry.mjs'],authorityPaths:[]});
 }finally{rmSync(root,{recursive:true,force:true});}
}

test('logical operands preserve regex bodies without inventing local imports',()=>{
 const source=String.raw`export function inspect(value) {
  if (!value || /^[a-z][a-z0-9+.-]*:/iu.test(value)) return false;
  if (value && /import\('\.\/missing\.mjs'\)/u.test(value)) return false;
  return true;
 }`;
 const value=graph(source);
 assert.deepEqual(value.node_inventory.map(n=>n.path),['entry.mjs']);
 assert.deepEqual(value.edge_inventory,[]);
});

test('logical operands still reject an actual computed dynamic import',()=>{
 assert.throws(()=>graph('export const load = value => value && import(value);'),/unsupported computed dynamic import/u);
});
