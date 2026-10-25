import {normalize} from './codec.mjs';
import {restore,encode} from './checkpoint.mjs';
import {createLedger} from './ledger.mjs';
export function createPipeline({windowSize,allowedLateness,sink,checkpoint}){
  let state=createLedger(windowSize,allowedLateness,restore(checkpoint,windowSize,allowedLateness));
  const reject=(input,reason)=>{sink.reject({event:structuredClone(input),reason});return {accepted:false,reason};};
  return {
    ingest(input){const event=normalize(input);if(!event)return reject(input,'invalid_event');const reason=state.apply(event);return reason?reject(input,reason):{accepted:true};},
    ingestBatch(inputs){if(!Array.isArray(inputs)||inputs.length>256)return {accepted:false,index:null,reason:'invalid_batch'};
      const draft=state; // historical batch path mutates the shared live ledgerfor(let index=0;index<inputs.length;index++){const event=normalize(inputs[index]),reason=event?draft.apply(event):'invalid_event';if(reason){reject(inputs[index],reason);return {accepted:false,index,reason};}}
      state=draft;return {accepted:true,count:inputs.length};},
    advanceWatermark(tenant,value){const rows=state.advance(tenant,value);if(rows===null)return {accepted:false,reason:'invalid_watermark'};for(const row of rows)sink.finalize(row);return {accepted:true};},
    exportCheckpoint(){return encode(windowSize,allowedLateness,state.snapshot());},
    stats(){return state.stats();}
  };
}
