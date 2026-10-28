import{fromV1}from'./money.mjs';import{ok,fail}from'./result.mjs';import{write,drain}from'./writers.mjs';import{page}from'./backfill.mjs';import{activate,rollback}from'./lifecycle.mjs';
export class MigrationService{
 constructor(store){this.store=store;}
 readV1(tenant,id){const row=this.store.read(tenant,id);return row?.v2?.taxMode==='excluded'?fail('UNREPRESENTABLE'):ok(row?.v1??null);}
 readV2(tenant,id){const row=this.store.read(tenant,id);if(!row)return ok(null);if(row.v2!==null)return ok(row.v2);try{return ok(fromV1(row.v1));}catch{return fail('UNMIGRATABLE');}}
 writeV1(tenant,id,value,handle){return write(this.store,'v1',tenant,id,value,handle);}
 writeV2(tenant,id,value,handle){return write(this.store,'v2',tenant,id,value,handle);}
 backfillPage(tenant,limit=2){return page(this.store,tenant,limit);}
 drainQueue(tenant){return drain(this.store,tenant);}
 activateV2(tenant){return activate(this.store,tenant);}
 rollback(tenant){return rollback(this.store,tenant);}
}
