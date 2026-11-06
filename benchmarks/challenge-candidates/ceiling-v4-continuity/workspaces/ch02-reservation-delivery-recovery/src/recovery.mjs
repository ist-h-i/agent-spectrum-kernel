import {decode,terminal} from './codec.mjs';
export function recoverOrder({journal},row){
 if(!row||terminal(row)||row.lease&&journal.now()<row.lease.until)return row;
 journal.cas(row.key,row.revision,{...row,format:2,state:'queued',lease:null});
 return decode(journal.read(row.key));
}
export function recoverOrders(ports,after,limit){
 const rows=ports.journal.dump().rows.map(([,row])=>row).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0).filter(row=>after===null||row.key>after).slice(0,limit);
 for(const row of rows)recoverOrder(ports,decode(row));
 return {after:rows.length?rows.at(-1).key:after,done:rows.length<limit,processed:rows.length};
}
