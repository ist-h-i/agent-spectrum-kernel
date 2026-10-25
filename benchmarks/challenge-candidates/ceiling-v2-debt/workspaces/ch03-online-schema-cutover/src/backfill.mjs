import{fromV1}from'./money.mjs';import{ok,fail,id}from'./result.mjs';
export function page(store,tenant,limit){
 if(!id(tenant)||!Number.isInteger(limit)||limit<1||limit>8)return fail('INVALID_INPUT');
 const initial=store.state(tenant),cursor=initial.checkpoint.after;
 const rows=store.scan(tenant,cursor,limit),report={migrated:[],skipped:[],conflicts:[],complete:false};
 for(const row of rows){if(row.v2!==null)continue;let converted;try{converted=fromV1(row.v1);}catch{report.skipped.push({id:row.id,code:'UNMIGRATABLE'});continue;}store.checkpoint('backfill:read');if(store.backfill(tenant,row.id,store.read(tenant,row.id).revision,converted))report.migrated.push(row.id);else report.conflicts.push(row.id);}
 const current=store.state(tenant),changed=report.conflicts.length>0;
 const after=changed?null:rows.at(-1)?.id??cursor;
 const complete=!changed&&store.scan(tenant,after,1).length===0;
 const next={after,clock:current.businessClock,complete};
 if(!store.setCheckpoint(tenant,initial.metadataRevision,next))return fail('REVISION_CONFLICT');report.complete=complete;return ok(report);
}
