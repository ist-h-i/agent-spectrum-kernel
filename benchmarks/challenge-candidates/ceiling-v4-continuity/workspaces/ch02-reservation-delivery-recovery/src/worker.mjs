import {decode,terminal} from './codec.mjs';
export function runOrder({journal,inventory,delivery,faults},row,worker,token){
 if(!row||terminal(row))return row;
 if(row.lease?.worker!==worker||journal.now()>row.lease.until)return null;
 const reservation=inventory.reserve(row.key,row.digest,row.tenant,row.sku,row.quantity);
 faults.hit('after-reserve');
 if(reservation.status==='refused'){
  const current=decode(journal.read(row.key));
  journal.cas(row.key,current.revision,{...current,state:'rejected',lease:null,reason:'OUT_OF_STOCK'});
  return decode(journal.read(row.key));
 }
 const output=delivery.putIfAbsent(row.key,row.digest,row.sku,row.quantity);
 faults.hit('after-delivery');
 inventory.finish(row.key,row.digest,'commit');
 faults.hit('after-inventory');
 const current=decode(journal.read(row.key));
 faults.hit('before-journal');
 journal.cas(row.key,current.revision,{...current,state:'delivered',lease:null,receipt:output.receipt,reason:null});
 return decode(journal.read(row.key));
}
export function workerTick(service,tenant,id,worker,ttl=10){const owned=service.claim(tenant,id,worker,ttl);return owned?service.run(tenant,id,worker,owned.token):null;}
