const key=(t,id)=>JSON.stringify([t,id]);
export function legacySubmit(service,tenant,id,wire){return service.submit(tenant,id,{sku:wire.item,quantity:wire.count});}
export function legacyPoll(journal,tenant,id){const r=journal.read(key(tenant,id));if(!r)return null;if(r.format===1)return {id:r.id,status:r.status,receipt:r.receipt??null,error:r.error??null};return {id:r.id,status:{queued:'pending',running:'working',delivered:'done',cancelled:'aborted',rejected:'error'}[r.state],receipt:r.receipt,error:r.reason};}
export function legacyCancel(service,tenant,id){service.cancel(tenant,id);}
export function audit(journal,tenant,id){const r=journal.read(key(tenant,id));if(!r)return null;return r.format===1?{tenant:r.tenant,id:r.id,sku:r.item,quantity:r.count,token:r.generation,state:r.status,receipt:r.receipt??null}:{tenant:r.tenant,id:r.id,sku:r.sku,quantity:r.quantity,token:r.token,state:r.state,receipt:r.receipt};}
