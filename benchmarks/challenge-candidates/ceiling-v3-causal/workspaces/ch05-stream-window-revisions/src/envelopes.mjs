import {normalize} from './codec.mjs';
const copy=value=>structuredClone(value);
const validId=value=>typeof value==='string'&&value.length>0;
export function decodeEnvelope(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||!validId(input.tenantId)||!validId(input.producerId)||!Number.isSafeInteger(input.sequence)||input.sequence<1||!Array.isArray(input.events)||input.events.length>256)return {error:{accepted:false,index:null,reason:'invalid_envelope'}};
 const events=[];for(let index=0;index<input.events.length;index++){const event=normalize(input.events[index]);if(!event||event.tenantId!==input.tenantId)return {error:{accepted:false,index,reason:'invalid_event'}};events.push(event);}
 return {tenantId:input.tenantId,producerId:input.producerId,sequence:input.sequence,events};
}
export function decodeProducers(rows){
 if(rows===undefined)return [];
 const error=()=>{const e=new Error('Invalid checkpoint');e.code='invalid_checkpoint';throw e;};
 if(!Array.isArray(rows))return error();const seen=new Set(),result=[];
 for(const row of rows){const parsed=decodeEnvelope(row);if(parsed.error||!Number.isSafeInteger(row.count)||row.count!==parsed.events.length)return error();const key=JSON.stringify([parsed.tenantId,parsed.producerId]);if(seen.has(key))return error();seen.add(key);result.push({...parsed,count:row.count});}return copy(result);
}
export function createCursors(rows=[]){
 const records=new Map(rows.map(row=>[row.producerId,row]));
 return {prepare(input){const value=decodeEnvelope(input);if(value.error)return value;const previous=records.get(value.producerId);
  if(previous&&value.sequence<previous.sequence)return {error:{accepted:false,index:null,reason:'stale_sequence'}};
  if(previous&&value.sequence===previous.sequence&&JSON.stringify(previous.events)!==JSON.stringify(input.events))return {error:{accepted:false,index:null,reason:'sequence_conflict'}};
  const ticket={value,key:value.producerId};records.set(ticket.key,{...copy(value),count:value.events.length});return ticket;},
  commit(ticket){records.set(ticket.key,{...copy(ticket.value),count:ticket.value.events.length});},snapshot(){return [];},size(){return records.size;}};
}
