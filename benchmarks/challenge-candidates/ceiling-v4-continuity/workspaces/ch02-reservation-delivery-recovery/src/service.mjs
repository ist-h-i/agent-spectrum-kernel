import {identity,order,decode,terminal,text,error} from './codec.mjs';
import {runOrder,workerTick} from './worker.mjs';
import {cancelOrder} from './cancellation.mjs';
import {recoverOrder,recoverOrders} from './recovery.mjs';
export function createService(ports){
 const {journal}=ports;
 const read=(tenant,id)=>decode(journal.read(identity(tenant,id)));
 const api={
  snapshot:read,
  submit(tenant,id,payload){const base=order(tenant,id,payload);const old=read(tenant,id);if(old)return old;journal.insert(base.key,{...base,format:2,state:'queued',token:0,lease:null,receipt:null,reason:null});return read(tenant,id);},
  claim(tenant,id,worker,ttl=10){identity(tenant,id);if(!text(worker)||!Number.isInteger(ttl)||ttl<1||ttl>100)error('INVALID_INPUT');const row=read(tenant,id);if(!row||terminal(row)||row.lease&&journal.now()<row.lease.until)return null;const token=row.token+1;journal.cas(row.key,row.revision,{...row,format:2,state:'running',token,lease:{worker,token,until:journal.now()+ttl}});return read(tenant,id);},
  run(tenant,id,worker,token){identity(tenant,id);if(!text(worker)||!Number.isSafeInteger(token)||token<0)error('INVALID_INPUT');return runOrder(ports,read(tenant,id),worker,token);},
  cancel(tenant,id){return cancelOrder(ports,read(tenant,id));},
  recover(tenant,id){return recoverOrder(ports,read(tenant,id));},
  recoverPage(after=null,limit=4){if(after!==null&&typeof after!=='string'||!Number.isInteger(limit)||limit<1||limit>16)error('INVALID_INPUT');return recoverOrders(ports,after,limit);}
 };return api;
}
