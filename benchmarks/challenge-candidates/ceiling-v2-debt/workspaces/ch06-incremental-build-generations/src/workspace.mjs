import {normalize,signature} from './normalize.mjs';
import {createPool} from './pool.mjs';
import {createEngine} from './engine.mjs';
export function createWorkspaceBuilder({compiler,publisher,concurrency=2}){
  const projects=new Map(),tokens=new Map(),pool=createPool(concurrency);let sequence=0;
  function record(id){if(projects.has('shared'))return projects.get('shared');
    const state={generation:0,signature:null,latest:null};
    const visible=s=>{const token=tokens.get(s.__requestTag);return !!token;};
    const proxy={inspect:(s,p)=>compiler.inspect(s,p),async compile(request){const token=tokens.get(request.snapshot.__requestTag);if(!token||!await pool.acquire(token))return {status:'failed',reason:'cancelled',path:request.path};
      try{if(token.cancelled)return {status:'failed',reason:'cancelled',path:request.path};const result=await compiler.compile(request);return result;}finally{pool.release();}}};
    state.engine=createEngine({compiler:proxy,publisher:{publish(result){const token=tokens.get(result.__requestTag);if(token)publisher.publish({projectId:id,generation:result.generation,results:result.results});}},concurrency,canCommit:visible});
    projects.set('shared',state);return state;
  }
  async function start(input,legacy){let snapshot;try{snapshot=normalize(input,legacy);}catch(error){return {projectId:input?.project??input?.projectId??'default',generation:input?.revision??input?.generation,status:'rejected',reason:error.code??'invalid_legacy',results:{}};}
    const project=record(snapshot.projectId),sig=signature(snapshot);
    if(snapshot.generation<project.generation)return {projectId:snapshot.projectId,generation:snapshot.generation,status:'rejected',reason:'stale_generation',results:{}};
    if(snapshot.generation===project.generation&&sig!==project.signature)return {projectId:snapshot.projectId,generation:snapshot.generation,status:'rejected',reason:'generation_conflict',results:{}};
    project.generation=snapshot.generation;project.signature=sig;
    const token={tag:String(++sequence),projectId:snapshot.projectId,generation:snapshot.generation,cancelled:false};tokens.set(token.tag,token);project.latest=token.tag;snapshot.__requestTag=token.tag;
    try{const result=await project.engine.build(snapshot);return {projectId:snapshot.projectId,generation:snapshot.generation,status:token.cancelled?'cancelled':'completed',results:token.cancelled?{}:result.results};}
    finally{tokens.delete(token.tag);}
  }
  return {build:input=>start(input,false),buildLegacy:input=>start(input,true),cancel(projectId,generation){let changed=false;for(const token of tokens.values())if(token.projectId===projectId&&token.generation===generation&&!token.cancelled){token.cancelled=true;pool.cancel(token);changed=true;}return changed;}};
}
