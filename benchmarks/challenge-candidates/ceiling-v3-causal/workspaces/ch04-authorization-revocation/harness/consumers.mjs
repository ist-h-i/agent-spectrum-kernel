import{createLegacyLookup}from'../src/legacy.mjs';
function mount(service,contextId,descriptor){const frames=[];const unsubscribe=service.subscribe(contextId,descriptor,value=>frames.push(structuredClone(value)));return{frames,getLast:()=>structuredClone(frames.at(-1)??null),close:()=>unsubscribe()};}
export const mountList=(service,contextId)=>mount(service,contextId,{kind:'list'});
export const mountDetail=(service,contextId,resource)=>mount(service,contextId,{kind:'detail',resource});
export const legacyLookup=(service,contextId)=>createLegacyLookup(service,contextId);
export function legacyExport(service,contextId){return{start:resource=>service.requestExport(contextId,resource),tick:id=>service.runChunk(id),ack:(id,receipt)=>service.completeChunk(id,receipt),cancel:id=>service.cancelExport(id),status:id=>service.exportStatus(id)};}
