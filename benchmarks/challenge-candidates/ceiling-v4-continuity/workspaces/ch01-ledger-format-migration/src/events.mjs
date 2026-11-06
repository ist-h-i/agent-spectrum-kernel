import {fromWire} from './codec.mjs';
export function reportRows(events){const rows=new Map();for(const event of events)for(const change of event.changes){if(change.value===null)rows.delete(change.id);else rows.set(change.id,{id:change.id,revision:event.seq,deleted:false,value:fromWire(change.value)});}return [...rows.values()];}
