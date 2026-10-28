const copy=v=>structuredClone(v);
export class PolicyStore{
 #policies;#listeners=new Set();#events=[];#reads=0;
 constructor(policies={}){this.#policies=new Map(Object.entries(policies).map(([t,p])=>[t,copy(p)]));Object.freeze(this);}
 snapshot(t){this.#reads++;return copy(this.#policies.get(t)??null);}revision(t){return this.#policies.get(t)?.revision??null;}
 replace(t,p){const revision=(this.revision(t)??0)+1;this.#policies.set(t,{...copy(p),revision});const e={tenant:t,revision};this.#events.push(e);return copy(e);}
 subscribe(fn){this.#listeners.add(fn);return()=>this.#listeners.delete(fn);}deliver(i=0,duplicate=false){const e=this.#events[i];if(!e)throw Error('MISSING_NOTIFICATION');if(!duplicate)this.#events.splice(i,1);for(const f of this.#listeners)f(copy(e));}
 stats(){return{snapshots:this.#reads,listeners:this.#listeners.size};}
}
export class ContextStore{
 #values=new Map();#next=1;
 constructor(){Object.freeze(this);}open(value){const id='context-'+this.#next++;this.#values.set(id,{id,revision:1,active:true,tenant:value.tenant,user:value.user,capabilityId:value.capabilityId??null});return id;}
 get(id){return copy(this.#values.get(id)??null);}replace(id,value){const old=this.#values.get(id);if(!old)return null;this.#values.set(id,{id,revision:old.revision+1,active:true,tenant:value.tenant,user:value.user,capabilityId:value.capabilityId??null});return this.get(id);}
 close(id){const x=this.#values.get(id);if(!x)return null;x.active=false;x.revision++;return this.get(id);}
}
export class CapabilityStore{
 #values=new Map();#next=1;#clock=0;#listeners=new Set();#events=[];#reads=0;
 constructor(){Object.freeze(this);}now(){return this.#clock;}
 grant(value){const id='cap-'+this.#next++;this.#values.set(id,{...copy(value),id,revision:1,active:value.active??true,parent:value.parent??null});this.#events.push({tenant:value.tenant,id});return id;}
 get(id){this.#reads++;return copy(this.#values.get(id)??null);}
 replace(id,patch){const old=this.#values.get(id);if(!old)return null;this.#values.set(id,{...old,...copy(patch),id,revision:old.revision+1});this.#events.push({tenant:old.tenant,id});return this.get(id);}
 revoke(id){return this.replace(id,{active:false});}advance(delta){if(!Number.isSafeInteger(delta)||delta<0||!Number.isSafeInteger(this.#clock+delta))throw Error('INVALID_CLOCK');this.#clock+=delta;this.#events.push({tenant:null,id:null});return this.#clock;}
 subscribe(fn){this.#listeners.add(fn);return()=>this.#listeners.delete(fn);}deliver(i=0,duplicate=false){const e=this.#events[i];if(!e)throw Error('MISSING_NOTIFICATION');if(!duplicate)this.#events.splice(i,1);for(const f of this.#listeners)f(copy(e));}
 revisions(id){const seen=new Set(),v=[];let current=id;while(current!==null){if(seen.has(current)||seen.size>=32)return null;seen.add(current);const c=this.#values.get(current);if(!c||!c.active||this.#clock>=c.expiresAt)return null;v.push({id:current,revision:c.revision});current=c.parent;}return v.sort((a,b)=>a.id.localeCompare(b.id));}
 stats(){return{reads:this.#reads,listeners:this.#listeners.size};}
}
export class ChunkAdapter{
 #policies;#contexts;#caps;#accepted=new Map();#completed=[];#closed=new Set();#attempts=new Map();#next=1;#hook=null;#lose=false;#calls=0;
 constructor(policies,contexts,caps){this.#policies=policies;this.#contexts=contexts;this.#caps=caps;Object.freeze(this);}
 beforeAccept(fn){this.#hook=fn;}loseNextReply(){this.#lose=true;}
 beginChunk(request){this.#calls++;const key=JSON.stringify([request.jobId,request.attemptId]),fingerprint=JSON.stringify(request),prior=this.#attempts.get(key);
  if(prior)return prior.fingerprint===fingerprint?{status:'accepted',receipt:prior.receipt}:{status:'conflict'};const hook=this.#hook;this.#hook=null;hook?.();
  if(this.#closed.has(request.jobId))return{status:'cancelled'};const context=this.#contexts.get(request.contextId);
  if(!context?.active||context.revision!==request.expectedContextRevision||context.tenant!==request.tenant)return{status:'context-conflict'};
  if(this.#policies.revision(request.tenant)!==request.expectedPolicyRevision)return{status:'revision-conflict'};
  const vector=context.capabilityId===null?[]:this.#caps.revisions(context.capabilityId);if(vector===null||JSON.stringify(vector)!==JSON.stringify(request.expectedCapabilities))return{status:'capability-conflict'};
  const receipt='receipt-'+this.#next++;this.#accepted.set(receipt,{...copy(request),receipt,status:'accepted'});this.#attempts.set(key,{fingerprint,receipt});if(this.#lose){this.#lose=false;return{status:'unknown'};}return{status:'accepted',receipt};
 }
 finish(receipt){const x=this.#accepted.get(receipt);if(!x)return{status:'missing'};if(x.status!=='completed'){x.status='completed';this.#completed.push(copy(x));}return{status:'completed',receipt};}
 receipt(id){return copy(this.#accepted.get(id)??null);}cancel(jobId){this.#closed.add(jobId);return{status:'cancelled'};}
 snapshot(){return{accepted:copy([...this.#accepted.values()]),completed:copy(this.#completed),closed:[...this.#closed],attempts:this.#calls};}
 get accepted(){return new Map([...this.#accepted].map(([k,v])=>[k,copy(v)]));}get completed(){return copy(this.#completed);}
}
for(const type of [PolicyStore,ContextStore,CapabilityStore,ChunkAdapter])Object.freeze(type.prototype);
