const key=e=>JSON.stringify([e.tenantId,e.eventId]);
export function createLedger(width,lateness,initial={watermarks:[],events:[]}) {
  const marks=new Map(initial.watermarks),events=new Map(),windows=new Map();
  const windowKey=(tenant,start)=>JSON.stringify([tenant,start]);
  const startOf=e=>Math.floor(e.eventTime/width)*width;
  function apply(e){
    const k=key(e),prior=events.get(k),start=startOf(e);
    if(prior&&prior.eventTime!==e.eventTime)return 'event_time_conflict';
    if(start+width+lateness<=(marks.get(e.tenantId)??-Infinity))return 'closed_window';
    if(prior&&prior.revision>e.revision)return null;
    const wk=windowKey(e.tenantId,start);let win=windows.get(wk);
    if(!win){win={tenantId:e.tenantId,start,total:0n,ids:new Set()};windows.set(wk,win);}
    if(prior&&!prior.deleted)win.total-=BigInt(prior.amountMinor);
    if(!e.deleted)win.total+=BigInt(e.amountMinor);
    win.ids.add(k);events.set(k,structuredClone(e));return null;
  }
  for(const e of initial.events){if(startOf(e)+width+lateness>(marks.get(e.tenantId)??-Infinity)){const reason=apply(e);if(reason){const error=new Error(reason);error.code='invalid_checkpoint';throw error;}}}
  return {
    apply,
    advance(tenant,value){if(typeof tenant!=='string'||!tenant||!Number.isSafeInteger(value)||value<0||value<(marks.get(tenant)??-Infinity))return null;
      marks.set(tenant,value);const closed=[...windows.entries()].filter(([,w])=>w.tenantId===tenant&&w.start+width+lateness<=value).sort((a,b)=>a[1].start-b[1].start),rows=[];
      for(const [wk,win]of closed){rows.push({tenantId:tenant,start:win.start,end:win.start+width,amountMinor:String(win.total)});for(const id of win.ids)events.delete(id);windows.delete(wk);}return rows;},
    snapshot(){return {watermarks:[...marks],events:[...events.values()].map(x=>structuredClone(x))};},
    fork(){return createLedger(width,lateness,this.snapshot());},
    stats(){return {activeIds:events.size,activeWindows:windows.size,tenants:marks.size};}
  };
}
