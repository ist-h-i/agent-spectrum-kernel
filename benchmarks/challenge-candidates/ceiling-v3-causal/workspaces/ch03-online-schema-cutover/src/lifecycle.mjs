import{fromV1,same}from'./money.mjs';import{ok,fail}from'./result.mjs';
export function activate(store,tenant){const state=store.state(tenant);if(state.phase==='v2')return ok();
 if(Object.values(state.writers).some(w=>w.active&&w.version==='v1')||state.queue.some(q=>q.status==='pending'))return fail('BARRIER_BLOCKED');
 if(!state.checkpoint.complete)return fail('NOT_BACKFILLED');
 const invalid=store.all(tenant).filter(row=>{try{return !same(fromV1(row.v1),row.v2);}catch{return true;}}).map(row=>row.id);if(invalid.length)return fail('NOT_BACKFILLED',invalid);
 return store.transition(tenant,state.metadataRevision,state.dataRevision,{phase:'v2',epoch:state.epoch+1})?ok():fail('REVISION_CONFLICT');}
export function rollback(store,tenant){const state=store.state(tenant);if(state.phase==='mixed')return ok();const ids=store.all(tenant).filter(row=>row.v2?.taxMode==='excluded').map(row=>row.id);return store.transition(tenant,state.metadataRevision,state.dataRevision,{phase:'mixed',epoch:state.epoch+1})?ok():fail('REVISION_CONFLICT');}
