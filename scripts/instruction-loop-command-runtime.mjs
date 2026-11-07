import {readInstructionLoopJson as readJsonFileStrict,readInstructionLoopBytes as readStableBytes,INSTRUCTION_LOOP_ARTIFACT_MAX_BYTES} from './instruction-loop-artifact.mjs';
// Host-configured local process transport. Workers receive request/result paths;
// they publish terminal results themselves so coordinator loss does not require
// replaying an expensive or mutating operation. No shell or model-selected code.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {canonicalDigest,stableCanonicalJson,assertNoSymlinkPathSegments,writeCanonicalJsonNoReplace} from './content-addressed-store.mjs';
import { instructionBytesDigest } from './instruction-environment.mjs';

const kinds=['generate','register','select','trial','report','plan','apply','version','cleanup','restore'];
function checkedDefinition(definition,requiredKinds){
  assert.deepEqual(Object.keys(definition.commands).sort(),[...requiredKinds].sort());
  for(const c of Object.values(definition.commands)){
    assert.ok(Array.isArray(c.argv)&&c.argv.length>=2&&c.argv.every(x=>typeof x==='string'&&!x.includes('\0')));
    assert.equal(resolve(c.argv[0]),c.argv[0]);
    assert.ok(Array.isArray(c.pins)&&c.pins.length>0);
    assert.equal(typeof c.model_calls,'boolean');
    if(c.inspect_argv)assert.ok(Array.isArray(c.inspect_argv)&&c.inspect_argv.length>=2&&c.inspect_argv[0]===c.argv[0]&&c.inspect_argv.every(x=>typeof x==='string'&&!x.includes('\0')));
    for(const p of c.pins){assert.equal(resolve(p.path),p.path);assert.match(p.digest,/^sha256:[a-f0-9]{64}$/u);}
  }
}
export function createInstructionLoopCommandRuntime({definition,modelCallsAuthorized=false}){
  return createPinnedCommandRuntime({definition,modelCallsAuthorized,requiredKinds:kinds});
}
export function createPracticalEvaluationCommandRuntime({definition,modelCallsAuthorized=false}){
  const requiredKinds=definition.commands.assess?['trial','assess']:['trial'];
  return createPinnedCommandRuntime({definition,modelCallsAuthorized,requiredKinds});
}
export function createReferenceScoringCommandRuntime({definition,modelCallsAuthorized=false}){
  return createPinnedCommandRuntime({definition,modelCallsAuthorized,requiredKinds:['grade']});
}
function createPinnedCommandRuntime({definition,modelCallsAuthorized,requiredKinds}){
  definition=JSON.parse(JSON.stringify(definition));checkedDefinition(definition,requiredKinds);
  const digest=canonicalDigest(definition);
  const folder=(job,root)=>join(root,'jobs',canonicalDigest(job).slice(7));
  function verifyPins(command){
    for(const p of command.pins)assert.equal(instructionBytesDigest(readStableBytes(p.path,'trusted loop worker')),p.digest,'loop worker source drift');
  }
  async function inspect(job,{root}){
    const directory=folder(job,root);assertNoSymlinkPathSegments(directory,'loop job',{allowMissingLeaf:true});
    const file=join(directory,'result.json');
    const command=definition.commands[job.kind];
    if(!existsSync(file)&&existsSync(join(directory,'request.json'))&&command.inspect_argv){
      verifyPins(command);
      const err=openSync(join(directory,'inspector.stderr.log'),'a',0o600);
      let code;
      try{
        const child=spawn(command.inspect_argv[0],[...command.inspect_argv.slice(1),join(directory,'request.json'),file],{
          cwd:directory,shell:false,stdio:['ignore','ignore',err],env:{...process.env,ASK_LOOP_MODEL_CALLS_AUTHORIZED:'0'}});
        code=await new Promise((done,fail)=>{child.once('error',fail);child.once('close',done);});
      }finally{closeSync(err);}
      if(code!==0&&!existsSync(file))return {status:'unknown',inspection_exit_code:code,inspection_error_log:join(directory,'inspector.stderr.log')};
    }
    if(existsSync(file)){
      const result=readJsonFileStrict(file);assert.equal(result.request_digest,canonicalDigest(job),'worker result transplant');
      const transport=join(directory,'transport.json');
      if(existsSync(transport)){
        const closed=readJsonFileStrict(transport);assert.equal(closed.request_digest,canonicalDigest(job));
        if(closed.exit_code!==0||closed.signal!==null){
          if(job.kind==='trial'&&result.output.recovered_from_native_records===true&&result.output.ready_for_next_root===true)
            return {...result,output:{...result.output,transport_interruption:closed}};
          return {...result,status:'failed',output:{...result.output,transport:closed}};
        }
      }
      return result;
    }
    // A missing result never proves a job did not run. PID liveness is useful
    // for diagnosis only; it cannot authorize a retry after PID reuse/exit.
    return {status:'unknown',request_digest:canonicalDigest(job)};
  }
  function preflight(job,{root}){
    const command=definition.commands[job.kind];verifyPins(command);
    assert.ok(!command.model_calls||modelCallsAuthorized,'model calls not authorized for this runtime');
    assert.ok(Buffer.byteLength(stableCanonicalJson(job))+1<=INSTRUCTION_LOOP_ARTIFACT_MAX_BYTES,'loop request exceeds16MiB');
    assert.ok(!existsSync(folder(job,root)),'loop job already allocated; inspect before dispatch');
  }
  async function execute(job,{root}){
    preflight(job,{root});const command=definition.commands[job.kind];
    const directory=folder(job,root);assertNoSymlinkPathSegments(directory,'loop job',{allowMissingLeaf:true});
    mkdirSync(join(root,'jobs'),{recursive:true,mode:0o700});
    mkdirSync(directory,{mode:0o700}); // Existing allocation is never retried.
    const request=join(directory,'request.json'),result=join(directory,'result.json');
    writeCanonicalJsonNoReplace({outputPath:request,artifact:job,label:'loop worker request',maximumBytes:INSTRUCTION_LOOP_ARTIFACT_MAX_BYTES});
    const out=openSync(join(directory,'stdout.log'),'wx',0o600),err=openSync(join(directory,'stderr.log'),'wx',0o600);
    try{
      const child=spawn(command.argv[0],[...command.argv.slice(1),request,result],{
        cwd:directory,shell:false,stdio:['ignore',out,err],env:{...process.env,ASK_LOOP_MODEL_CALLS_AUTHORIZED:command.model_calls&&modelCallsAuthorized?'1':'0'}});
      if(child.pid)writeCanonicalJsonNoReplace({outputPath:join(directory,'process.json'),artifact:{pid:child.pid,request_digest:canonicalDigest(job)},label:'loop worker process'});
      const closed=await new Promise((done,fail)=>{child.once('error',fail);child.once('close',(exit_code,signal)=>done({exit_code,signal}));});
      writeCanonicalJsonNoReplace({outputPath:join(directory,'transport.json'),artifact:{...closed,request_digest:canonicalDigest(job)},label:'loop worker exit'});
    }finally{closeSync(out);closeSync(err);}
    return inspect(job,{root});
  }
  return {digest,inspect,preflight,...Object.fromEntries(requiredKinds.map(k=>[k,execute]))};
}
