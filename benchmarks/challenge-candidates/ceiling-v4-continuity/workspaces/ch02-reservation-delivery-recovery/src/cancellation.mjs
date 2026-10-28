import {decode,terminal} from './codec.mjs';
export function cancelOrder({journal,inventory,faults},row){
 if(!row||terminal(row))return row;
 inventory.finish(row.key,row.digest,'release');
 faults.hit('after-inventory');
 const current=decode(journal.read(row.key));
 faults.hit('before-journal');
 journal.cas(row.key,current.revision,{...current,state:'cancelled',lease:null,receipt:null,reason:null});
 return decode(journal.read(row.key));
}
