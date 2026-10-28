import{PermissionCache}from'./cache.mjs';import{ViewOwner}from'./contexts.mjs';import{ExportCoordinator}from'./exports.mjs';
export class DocumentService{
 constructor(policies,contexts,capabilities,chunks,{chunkSize=4,logger=()=>{}}={}){this.policies=policies;this.contexts=contexts;this.capabilities=capabilities;this.chunks=chunks;this.logger=logger;this.cache=new PermissionCache();this.views=new ViewOwner();this.exports=new ExportCoordinator(this,chunks,chunkSize);this.unsubscribe=policies.subscribe(event=>{this.cache.clear();for(const id of this.contextIds){const context=this.contexts.get(id);if(context?.active&&context.tenant===event.tenant)this.refresh(id);}});this.contextIds=new Set();}
 openContext(value){const id=this.contexts.open(value);this.contextIds.add(id);return id;}
 switchContext(id,value){const result=this.contexts.replace(id,value);this.cache.clear();this.refresh(id);return result;}
 closeContext(id){const result=this.contexts.close(id);this.views.drop(id);this.cache.clear();return result;}
 authorize(id,resource,action){const context=this.contexts.get(id),policy=context?.active?this.policies.snapshot(context.tenant):null;return{context,policy,allowed:this.cache.decide(policy,context,resource,action)};}
 decide(id,resource,action){return this.authorize(id,resource,action).allowed;}
 detail(id,resource){const a=this.authorize(id,resource,'read');if(!a.context?.active)return{status:'closed'};const meta={contextRevision:a.context.revision,policyRevision:a.policy?.revision??null};return a.allowed?{status:'allowed',body:a.policy.resources[resource].body,...meta}:{status:'denied',...meta};}
 list(id){const context=this.contexts.get(id);if(!context?.active)return{status:'closed'};const policy=this.policies.snapshot(context.tenant);const items=Object.keys(policy?.resources??{}).filter(resource=>this.cache.decide(policy,context,resource,'read'));return{status:'allowed',items,contextRevision:context.revision,policyRevision:policy?.revision??null};}
 project(id,descriptor){return descriptor.kind==='list'?this.list(id):this.detail(id,descriptor.resource);}
 subscribe(id,descriptor,callback){if(!this.contexts.get(id)?.active){callback({status:'closed'});return()=>{};}const release=this.views.add(id,descriptor,callback);callback(this.project(id,descriptor));return release;}
 refresh(id){if(this.contexts.get(id)?.active)this.views.emit(id,descriptor=>this.project(id,descriptor));}
 requestExport(id,resource){return this.exports.request(id,resource);}runChunk(id){return this.exports.run(id);}completeChunk(id,receipt){return this.exports.complete(id,receipt);}cancelExport(id){return this.exports.cancel(id);}exportStatus(id){return this.exports.status(id);}
 close(){this.unsubscribe();for(const id of this.contextIds)this.views.drop(id);}
}
