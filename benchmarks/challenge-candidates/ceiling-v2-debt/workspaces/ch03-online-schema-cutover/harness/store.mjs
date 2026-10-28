const copy=value=>structuredClone(value);
const key=(tenant,id)=>JSON.stringify([tenant,id]);
export class PriceStore {
  constructor(records=[]){this.rows=new Map(records.map(row=>[key(row.tenant,row.id),copy(row)]));this.tenants=new Map();this.hooks=new Map();}
  meta(tenant){if(!this.tenants.has(tenant))this.tenants.set(tenant,{metadataRevision:1,dataRevision:0,businessClock:0,phase:'mixed',epoch:1,writers:Object.create(null),queue:[],checkpoint:{after:null,clock:0,complete:false},changes:[]});return this.tenants.get(tenant);}
  state(tenant){const {changes,...state}=this.meta(tenant);return copy(state);}
  read(tenant,id){return copy(this.rows.get(key(tenant,id))??null);}
  all(tenant){return [...this.rows.values()].filter(row=>row.tenant===tenant).map(copy).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);}
  scan(tenant,after=null,limit=8){return this.all(tenant).filter(row=>after===null||row.id>after).slice(0,limit);}
  changes(tenant,clock){return this.meta(tenant).changes.filter(item=>item.clock>clock).map(item=>item.id);}
  writePrice(tenant,id,revision,next){const old=this.read(tenant,id);if((old?.revision??0)!==revision)return false;const state=this.meta(tenant);this.rows.set(key(tenant,id),{tenant,id,revision:revision+1,...copy(next)});state.dataRevision++;state.businessClock++;state.changes.push({clock:state.businessClock,id});return true;}
  backfill(tenant,id,revision,v2){const old=this.read(tenant,id);if(!old||old.revision!==revision)return false;this.rows.set(key(tenant,id),{...old,revision:revision+1,v2:copy(v2)});this.meta(tenant).dataRevision++;return true;}
  setCheckpoint(tenant,revision,next){const state=this.meta(tenant);if(state.metadataRevision!==revision)return false;state.checkpoint=copy(next);state.metadataRevision++;return true;}
  transition(tenant,metadataRevision,dataRevision,next){const state=this.meta(tenant);if(state.metadataRevision!==metadataRevision||state.dataRevision!==dataRevision)return false;Object.assign(state,copy(next));state.metadataRevision++;return true;}
  registerWriter(tenant,writerId,version){const state=this.meta(tenant);if(!['v1','v2'].includes(version))throw Error('INVALID_INPUT');if(state.phase==='v2'&&version==='v1')throw Error('LEGACY_DISABLED');state.writers[writerId]={version,active:true};state.metadataRevision++;return {tenant,writerId,version,epoch:state.epoch};}
  retireWriter(tenant,writerId){const state=this.meta(tenant);if(state.writers[writerId])state.writers[writerId].active=false;state.metadataRevision++;}
  enqueue(tenant,id,command){const state=this.meta(tenant);if(state.queue.some(item=>item.id===id))throw Error('DUPLICATE_QUEUE');state.queue.push({id,command:copy(command),status:'pending',error:null});state.metadataRevision++;}
  settle(tenant,id,result){const state=this.meta(tenant),item=state.queue.find(item=>item.id===id);if(!item)throw Error('MISSING_QUEUE');item.status=result.ok?'applied':'rejected';item.error=copy(result.error??null);state.metadataRevision++;}
  once(point,fn){this.hooks.set(point,fn);}
  checkpoint(point){const fn=this.hooks.get(point);this.hooks.delete(point);fn?.();}
}
