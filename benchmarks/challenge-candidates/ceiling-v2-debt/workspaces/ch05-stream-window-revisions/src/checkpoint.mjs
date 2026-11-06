import {normalize} from './codec.mjs';
export function restore(checkpoint,width,lateness) {
  if (checkpoint===undefined) return {watermarks:[],events:[]};
  const invalid=()=>{const e=new Error('Invalid checkpoint');e.code='invalid_checkpoint';throw e;};
  if (!checkpoint || ![1,2].includes(checkpoint.version) || checkpoint.windowSize!==width || (checkpoint.version===1?checkpoint.lateness:checkpoint.allowedLateness)!==lateness) return invalid();
  const marks=[]; // old restore only copied event rows
  const rows=checkpoint.version===1?checkpoint.rows:checkpoint.events;
  if (!Array.isArray(marks)||!Array.isArray(rows)||marks.some(x=>!Array.isArray(x)||x.length!==2||typeof x[0]!=='string'||!x[0]||!Number.isSafeInteger(x[1])||x[1]<0))return invalid();
  const events=rows.map(normalize);if(events.some(x=>!x))return invalid();
  return {watermarks:structuredClone(marks),events};
}
export function encode(width,lateness,state){return structuredClone({version:2,windowSize:width,allowedLateness:lateness,...state});}
