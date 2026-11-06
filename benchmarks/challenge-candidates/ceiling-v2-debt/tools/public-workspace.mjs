// New package identity over the existing public execution assets. Controller
// only: prepares/freezes data; never imports or executes a submission.
import {copyFileSync,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalDigest,inventory,isSubmission,noLinks,sha256} from './workspace-data.mjs';
export {canonicalDigest,inventory,isSubmission} from './workspace-data.mjs';
export const version='ceiling-public-v2-debt';
const readJson=path=>JSON.parse(readFileSync(path,'utf8'));
const runtimeNames=['scenario-engine.mjs','scenario-protocol.mjs','scenario-reporter.mjs','scenario-service-batch.mjs','scenario-test-batch.mjs','scenario-worker.mjs','scenario.mjs'];
const toolNames=['candidate-worker.mjs','assertion-reporter.mjs','batch-executor.mjs','safe-json.mjs'];
export function createWorkspaceController({packageRoot,sharedRuntimeRoot=resolve(packageRoot,'../ceiling-v1')}){
  const root=resolve(packageRoot),shared=resolve(sharedRuntimeRoot);
  const candidates=()=>readJson(resolve(root,'catalog.json')).candidates;
  const candidate=id=>{const item=candidates().find(c=>c.id===id);if(!item)throw Error('unknown debt-v2 task: '+id);return item;};
  function executionAssets(){
    const entries=[...runtimeNames.map(n=>['runtime/'+n,existsSync(resolve(root,'runtime',n))?resolve(root,'runtime',n):resolve(shared,'runtime',n)]),...toolNames.map(n=>['tools/'+n,resolve(shared,'tools',n)])];
    return entries.map(([path,source_path])=>{noLinks(source_path);const bytes=readFileSync(source_path);return {path,source_path,sha256:sha256(bytes),bytes:bytes.length,origin:source_path.startsWith(root+sep)?'debt-v2':'ceiling-v1-reused'};});
  }
  function executionAsset(path){const entry=executionAssets().find(x=>x.path===path);if(!entry)throw Error('unknown shared execution asset: '+path);return entry.source_path;}
  function executionAdapterDigest(){
    const own=['tools/public-workspace.mjs','tools/workspace-data.mjs','tools/service-batches.mjs'];
    return canonicalDigest([...own.map(path=>{const bytes=readFileSync(resolve(root,path));return {path,sha256:sha256(bytes),bytes:bytes.length};}),...executionAssets().map(({source_path,origin,...file})=>file)]);
  }
  function buildInputManifest(id){
    const item=candidate(id),workspace=resolve(root,'workspaces',id),files=inventory(workspace);
    for(const file of files){
      if(!/^(src|spec|test|data|harness)\//u.test(file.path)&&!['package.json','package-lock.json','RESULT.md'].includes(file.path))throw Error('outside public seed allowlist: '+file.path);
      if(file.path.split('/').some(p=>/^(\.git|node_modules|oracle|oracles|mutants|private|evaluator|evaluators)$/iu.test(p)))throw Error('nonpublic seed path: '+file.path);
    }
    const taskPath=resolve(root,item.task_path);if(!taskPath.startsWith(root+sep))throw Error('task path escapes package');
    const task=readFileSync(taskPath),all=[...files,{path:'task.md',sha256:sha256(task),bytes:task.length}].sort((a,b)=>a.path.localeCompare(b.path,'en'));
    return {version,id,input_digest:canonicalDigest(all),files:all};
  }
  function source(id){
    const expected=buildInputManifest(id),actual=readJson(resolve(root,'input-manifests',id+'.json'));
    if(canonicalDigest(actual)!==canonicalDigest(expected))throw Error('public input manifest mismatch: '+id);
    return {workspace:resolve(root,'workspaces',id),task:readFileSync(resolve(root,candidate(id).task_path)),manifest:actual};
  }
  function output(out){
    const path=resolve(out);noLinks(path);if(path===root||path.startsWith(root+sep))throw Error('output must be outside package');
    mkdirSync(path,{recursive:false});return path;
  }
  function prepare(id,out){
    const {workspace,task,manifest}=source(id),target=output(out);
    for(const file of manifest.files){if(file.path==='task.md')continue;const dest=resolve(target,file.path);mkdirSync(dirname(dest),{recursive:true});copyFileSync(resolve(workspace,file.path),dest);}
    mkdirSync(resolve(target,'test/added'),{recursive:true});writeFileSync(resolve(target,'task.md'),task,{flag:'wx'});
    return {id,workspace:target,input_digest:manifest.input_digest,ready_for_measurement:false};
  }
  function verify(id,workspace){
    const {manifest}=source(id),actual=inventory(workspace),base=new Map(manifest.files.map(f=>[f.path,f])),seen=new Map(actual.map(f=>[f.path,f])),violations=[];
    for(const file of manifest.files.filter(f=>!isSubmission(f.path)))if(canonicalDigest(file)!==canonicalDigest(seen.get(file.path)??null))violations.push('protected modified or missing: '+file.path);
    for(const file of actual)if(!base.has(file.path)&&!isSubmission(file.path))violations.push('outside submission scope: '+file.path);
    return {id,valid:violations.length===0,violations,input_digest:manifest.input_digest,submission_digest:canonicalDigest(actual.filter(f=>isSubmission(f.path))),files:actual};
  }
  function freeze(id,workspace,out,metadata){
    for(const key of ['trial_id','model','condition'])if(typeof metadata?.[key]!=='string'||!metadata[key].trim())throw Error('missing '+key);
    const observed=verify(id,workspace),adapter=executionAdapterDigest();if(!observed.valid)throw Error(observed.violations.join('\n'));
    const target=output(out);
    for(const f of observed.files){const dest=resolve(target,'workspace',f.path);mkdirSync(dirname(dest),{recursive:true});copyFileSync(resolve(workspace,f.path),dest);}
    const final=verify(id,resolve(target,'workspace'));if(!final.valid||canonicalDigest(final.files)!==canonicalDigest(observed.files)||adapter!==executionAdapterDigest())throw Error('workspace/adapter changed during freeze');
    const record={version,...metadata,id,controller_runtime:process.version,expected_runtime:'v24.21.0',observed_runtime:null,input_digest:observed.input_digest,submission_digest:observed.submission_digest,workspace_digest:canonicalDigest(final.files),execution_adapter_digest:adapter,files:final.files,evaluator_reference:null,quality_score:null,safety_blocker:null,ready_for_measurement:false};
    writeFileSync(resolve(target,'submission.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});return record;
  }
  function sealInputs({write=false}={}){
    return candidates().map(({id})=>{const manifest=buildInputManifest(id),path=resolve(root,'input-manifests',id+'.json');
      if(existsSync(path)&&canonicalDigest(readJson(path))===canonicalDigest(manifest))return {id,status:'unchanged',input_digest:manifest.input_digest};
      if(!write)throw Error('missing/stale input seal: '+id);
      if(readJson(resolve(root,'catalog.json')).input_freeze_status==='frozen')throw Error('frozen inputs require a new package revision');
      mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(manifest,null,2)+'\n');return {id,status:'written',input_digest:manifest.input_digest};});
  }
  return {root,version,inventory,isSubmission,candidates,prepare,verify,freeze,buildInputManifest,sealInputs,executionAssets,executionAsset,executionAdapterDigest};
}
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const defaultController=createWorkspaceController({packageRoot:root});
export const {candidates,prepare,verify,freeze,buildInputManifest,sealInputs,executionAssets,executionAsset,executionAdapterDigest}=defaultController;
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const [command,...args]=process.argv.slice(2),options={};
    for(let i=0;i<args.length;i+=2){if(!args[i].startsWith('--')||!args[i+1])throw Error('expected --key value');options[args[i].slice(2)]=args[i+1];}
    const controller=createWorkspaceController({packageRoot:root,...(options['shared-runtime-root']?{sharedRuntimeRoot:options['shared-runtime-root']}:{})});
    const result=command==='list'?controller.candidates():command==='seal'?controller.sealInputs({write:options.write==='true'}):command==='prepare'?controller.prepare(options.id,options.out):command==='verify'?controller.verify(options.id,options.workspace):command==='freeze'?controller.freeze(options.id,options.workspace,options.out,{trial_id:options.trial,model:options.model,condition:options.condition}):null;
    if(!result)throw Error('use list/seal/prepare/verify/freeze');if(result.valid===false)process.exitCode=1;console.log(JSON.stringify(result,null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
