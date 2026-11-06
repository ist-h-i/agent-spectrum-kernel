// Trusted synthetic projection regression only. Never imports a benchmark src.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const workspaces=resolve(root,'workspaces'),ids=readdirSync(workspaces).sort();
const canonical=readFileSync(resolve(workspaces,ids[0],'harness/scenario-engine.mjs'),'utf8');
function legacy(source){
 assert.equal((source.match(/const mapArray = Function.call.bind\(Array.prototype.map\);/g)??[]).length,1);
 return source.replace('\nconst mapArray = Function.call.bind(Array.prototype.map);\n','\n')
  .replace('mapArray([...value], ([key, item]) => [project(key), project(item)])','[...value].map(([key, item]) => [project(key), project(item)])')
  .replace('mapArray(value, project)','value.map(project)')
  .replace('mapArray(Object.entries(value), ([key, item]) => [key, project(item)])','Object.entries(value).map(([key, item]) => [key, project(item)])');
}
const source=`const row=()=>({mode:'steady',samples:[{count:4096,heapUsed:123,rss:456}]});
export function ordinary(){return [row()];}
export function outerNull(){return Object.setPrototypeOf([row()],null);}
export function nestedNull(){const item=row();Object.setPrototypeOf(item.samples,null);return Object.setPrototypeOf([item],null);}
export function objectNested(){return {profiles:nestedNull()};}
export function mapNested(){return new Map([['profiles',nestedNull()]]);}
`;
const expected=[{mode:'steady',samples:[{count:4096,heapUsed:123,rss:456}]}];
const capabilities={version:'ceiling-scenario-v1',modules:{'synthetic.mjs':{invoke:{ordinary:'json',outerNull:'json',nestedNull:'json',objectNested:'json',mapNested:'json'},construct:{}}},calls:{},get:{},functionKinds:[]};
const program=method=>({steps:[{op:'invoke',module:'synthetic.mjs',export:method,args:[],catch:true,as:'value'}]});
async function withEngines(body){
 const directory=mkdtempSync(resolve(tmpdir(),'ceiling-projection-synthetic-'));
 try{
  writeFileSync(resolve(directory,'synthetic.mjs'),source);
  writeFileSync(resolve(directory,'scenario-protocol.mjs'),readFileSync(resolve(workspaces,ids[0],'harness/scenario-protocol.mjs')));
  writeFileSync(resolve(directory,'before.mjs'),legacy(canonical));writeFileSync(resolve(directory,'after.mjs'),canonical);
  const before=await import(pathToFileURL(resolve(directory,'before.mjs'))),after=await import(pathToFileURL(resolve(directory,'after.mjs')));
  await body(before.executeScenario,after.executeScenario,directory);
 }finally{rmSync(directory,{recursive:true,force:true});}
}
test('all six canonical engines have identical helper bytes',()=>{
 assert.equal(ids.length,6);const digest=createHash('sha256').update(canonical).digest('hex');
 for(const id of ids)assert.equal(createHash('sha256').update(readFileSync(resolve(workspaces,id,'harness/scenario-engine.mjs'))).digest('hex'),digest);
});
test('ordinary array retains exact semantic JSON before and after fix',()=>withEngines(async(before,after,directory)=>{
 assert.deepEqual(await before(program('ordinary'),capabilities,directory),Object.assign(Object.create(null),{value:expected}));
 assert.deepEqual(await after(program('ordinary'),capabilities,directory),Object.assign(Object.create(null),{value:expected}));
}));
for(const method of ['outerNull','nestedNull','objectNested','mapNested'])test(method+': original engine TypeError, captured native map returns semantic JSON',()=>withEngines(async(before,after,directory)=>{
 // Requested catch retains the original TypeError; an uncaught operation wrapper would hide it.
 const failed=await before(program(method),capabilities,directory);assert.equal(failed.value?.error?.name,'TypeError');assert.match(failed.value.error.message,/map/);
 const value=method==='objectNested'?{profiles:expected}:method==='mapNested'?{size:1,entries:[['profiles',expected]]}:expected;
 assert.deepEqual(await after(program(method),capabilities,directory),Object.assign(Object.create(null),{value}));
}));
