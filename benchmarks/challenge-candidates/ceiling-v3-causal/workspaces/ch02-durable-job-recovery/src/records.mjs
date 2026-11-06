export function normalizeRecord(record){
  if(record.format!==1)return structuredClone(record);
  return{key:record.key,version:record.version,format:2,tenantId:record.tenantId,requestId:record.requestId,payload:record.body,digest:record.fingerprint,state:{pending:'queued',working:'running',done:'succeeded',aborted:'cancelled',error:'failed'}[record.status],lease:record.status==='working'?{worker:record.owner,token:record.generation,until:record.deadline}:null,receipt:record.receipt??null,reason:null};
}
export function migrateRecords(store){for(const job of store.scan())if(job.format===1)store.cas(job.key,job.version,normalizeRecord(job));return store.scan();}
