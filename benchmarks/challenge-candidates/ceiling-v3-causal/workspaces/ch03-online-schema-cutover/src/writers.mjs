import{fromV1,toV1,validV2}from'./money.mjs';import{ok,fail,id}from'./result.mjs';
export function write(store,version,tenant,rowId,value,handle,queued=false){
 if(!id(tenant)||!id(rowId))return fail('INVALID_INPUT');const state=store.state(tenant),writer=state.writers[handle?.writerId];
 if(!handle||handle.tenant!==tenant||handle.version!==version||!writer||writer.version!==version||(!writer.active&&!queued))return fail('UNKNOWN_WRITER');
 if(state.phase==='v2'&&version==='v1')return fail('LEGACY_DISABLED');
 let v1,v2;try{if(version==='v1'){v1=structuredClone(value);v2=fromV1(value);}else{if(!validV2(value))return fail('INVALID_MONEY');if(state.phase==='mixed'&&value?.taxMode==='excluded')return fail('MIXED_TAX');v2=structuredClone(value);v1=store.read(tenant,rowId)?.v1??null;}}catch{return fail('INVALID_MONEY');}
 const row=store.read(tenant,rowId);return store.writePrice(tenant,rowId,row?.revision??0,{v1,v2})?ok():fail('REVISION_CONFLICT');
}
export function drain(store,tenant){for(const item of store.state(tenant).queue.filter(item=>item.status==='pending')){const c=item.command;const result=['v1','v2'].includes(c.version)?write(store,c.version,tenant,c.id,c.value,c.handle,true):fail('INVALID_INPUT');store.settle(tenant,item.id,result);}return ok(store.state(tenant).queue);}
