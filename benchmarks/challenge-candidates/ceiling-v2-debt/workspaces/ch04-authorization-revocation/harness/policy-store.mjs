const copy=value=>structuredClone(value);
export class PolicyStore{
 constructor(policies={}){this.policies=new Map(Object.entries(policies).map(([id,p])=>[id,copy(p)]));this.listeners=new Set();this.notifications=[];}
 snapshot(tenant){return copy(this.policies.get(tenant)??null);}revision(tenant){return this.policies.get(tenant)?.revision??null;}
 replace(tenant,policy){const revision=(this.revision(tenant)??0)+1;this.policies.set(tenant,{...copy(policy),revision});const event={tenant,revision};this.notifications.push(event);return copy(event);}
 subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
 deliver(index=0,duplicate=false){const event=this.notifications[index];if(!event)throw Error('MISSING_NOTIFICATION');if(!duplicate)this.notifications.splice(index,1);for(const fn of this.listeners)fn(copy(event));}
}
export class ContextStore{
 constructor(){this.contexts=new Map();this.next=1;}
 open(value){const id='context-'+this.next++;this.contexts.set(id,{id,revision:1,active:true,tenant:value.tenant,user:value.user,linkToken:value.linkToken??null});return id;}
 get(id){return copy(this.contexts.get(id)??null);}
 replace(id,value){const old=this.contexts.get(id);if(!old)return null;this.contexts.set(id,{id,revision:old.revision+1,active:true,tenant:value.tenant,user:value.user,linkToken:value.linkToken??null});return this.get(id);}
 close(id){const context=this.contexts.get(id);if(!context)return null;context.active=false;context.revision++;return this.get(id);}
}
export class ChunkAdapter{
 constructor(policies,contexts){this.policies=policies;this.contexts=contexts;this.accepted=new Map();this.completed=[];this.closed=new Set();this.attempts=new Map();this.next=1;this.hook=null;this.lose=false;}
 beforeAccept(fn){this.hook=fn;}loseNextReply(){this.lose=true;}
 beginChunk(request){const hook=this.hook;this.hook=null;hook?.();const key=JSON.stringify([request.jobId,request.attemptId]),fingerprint=JSON.stringify(request),prior=this.attempts.get(key);
  if(prior)return prior.fingerprint===fingerprint?{status:'accepted',receipt:prior.receipt}:{status:'conflict'};
  if(this.closed.has(request.jobId))return{status:'cancelled'};
  const context=this.contexts.get(request.contextId);if(!context?.active||context.revision!==request.expectedContextRevision||context.tenant!==request.tenant)return{status:'context-conflict'};
  if(this.policies.revision(request.tenant)!==request.expectedPolicyRevision)return{status:'revision-conflict'};
  const receipt='receipt-'+this.next++;this.accepted.set(receipt,{...copy(request),receipt,status:'accepted'});this.attempts.set(key,{fingerprint,receipt});
  if(this.lose){this.lose=false;return{status:'unknown'};}return{status:'accepted',receipt};
 }
 finish(receipt){const entry=this.accepted.get(receipt);if(!entry)return{status:'missing'};if(entry.status!=='completed'){entry.status='completed';this.completed.push(copy(entry));}return{status:'completed',receipt};}
 receipt(id){return copy(this.accepted.get(id)??null);}cancel(jobId){this.closed.add(jobId);return{status:'cancelled'};}
}
