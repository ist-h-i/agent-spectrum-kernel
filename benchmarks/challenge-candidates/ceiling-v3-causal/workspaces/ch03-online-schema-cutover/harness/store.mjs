const clone=structuredClone;
const copy=value=>clone(value),key=(tenant,id)=>JSON.stringify([tenant,id]);
export class PriceStore {
 #rows=new Map();#tenants=new Map();#hooks=new Map();#counts={read:0,scanRows:0,allRows:0,changesRows:0,cas:0,metadata:0};
 constructor(records=[]){for(const r of records)this.#rows.set(key(r.tenant,r.id),{deleted:false,incarnation:1,...copy(r)});Object.freeze(this);}
 #meta(tenant){if(!this.#tenants.has(tenant))this.#tenants.set(tenant,{metadataRevision:1,dataRevision:0,businessClock:0,phase:'mixed',epoch:1,writers:Object.create(null),queue:[],checkpoint:{after:null,clock:0,complete:false},changes:[],registration:0});return this.#tenants.get(tenant);}
 state(tenant){this.#counts.metadata++;const {changes,registration,...s}=this.#meta(tenant);return copy(s);}
 read(tenant,id){this.#counts.read++;return copy(this.#rows.get(key(tenant,id))??null);}
 #ordered(tenant){return [...this.#rows.values()].filter(r=>r.tenant===tenant).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);}
 all(tenant){const rows=this.#ordered(tenant);this.#counts.allRows+=rows.length;return copy(rows);}
 scan(tenant,after=null,limit=8){const rows=this.#ordered(tenant).filter(r=>after===null||r.id>after).slice(0,limit);this.#counts.scanRows+=rows.length;const result=copy(rows);this.#emit('scan:returned');return result;}
 changes(tenant,clock){const a=this.#meta(tenant).changes.filter(x=>x.clock>clock);this.#counts.changesRows+=a.length;return copy(a);}
 #business(tenant,id){const s=this.#meta(tenant);s.dataRevision++;s.businessClock++;s.changes.push({clock:s.businessClock,id});}
 writePrice(tenant,id,revision,next){this.#counts.cas++;const old=this.#rows.get(key(tenant,id));if((old?.revision??0)!==revision)return false;const incarnation=old?.deleted?(old.incarnation+1):(old?.incarnation??1);this.#rows.set(key(tenant,id),{tenant,id,revision:revision+1,incarnation,deleted:false,...copy(next)});this.#business(tenant,id);return true;}
 erase(tenant,id,revision,incarnation){this.#counts.cas++;const old=this.#rows.get(key(tenant,id));if(!old||old.revision!==revision||old.incarnation!==incarnation)return false;if(old.deleted)return true;this.#rows.set(key(tenant,id),{...old,revision:revision+1,deleted:true,v1:null,v2:null});this.#business(tenant,id);return true;}
 backfill(tenant,id,revision,incarnation,v2){this.#counts.cas++;const old=this.#rows.get(key(tenant,id));if(!old||old.deleted||old.revision!==revision||old.incarnation!==incarnation)return false;this.#rows.set(key(tenant,id),{...old,revision:revision+1,v2:copy(v2)});this.#meta(tenant).dataRevision++;return true;}
 setCheckpoint(tenant,revision,next){this.#counts.cas++;this.#emit('checkpoint:beforeCommit');const s=this.#meta(tenant);if(s.metadataRevision!==revision)return false;s.checkpoint=copy(next);s.metadataRevision++;return true;}
 transition(tenant,metadataRevision,dataRevision,next){this.#counts.cas++;this.#emit('transition:beforeCommit');const s=this.#meta(tenant);if(s.metadataRevision!==metadataRevision||s.dataRevision!==dataRevision)return false;Object.assign(s,copy(next));s.metadataRevision++;return true;}
 registerWriter(tenant,writerId,version){const s=this.#meta(tenant);if(!['v1','v2'].includes(version))throw Error('INVALID_INPUT');if(s.phase==='v2'&&version==='v1')throw Error('LEGACY_DISABLED');const generation=++s.registration;s.writers[writerId]={version,active:true,generation};s.metadataRevision++;return{tenant,writerId,version,epoch:s.epoch,generation};}
 retireWriter(tenant,writerId){const s=this.#meta(tenant);if(s.writers[writerId])s.writers[writerId].active=false;s.metadataRevision++;}
 enqueue(tenant,id,command){const s=this.#meta(tenant);if(s.queue.some(q=>q.id===id))throw Error('DUPLICATE_QUEUE');s.queue.push({id,command:copy(command),status:'pending',error:null});s.metadataRevision++;}
 settle(tenant,id,result){const s=this.#meta(tenant),item=s.queue.find(q=>q.id===id);if(!item)throw Error('MISSING_QUEUE');if(item.status!=='pending')return false;item.status=result.ok?'applied':'rejected';item.error=copy(result.error??null);s.metadataRevision++;return true;}
 once(point,fn){if(!['scan:returned','checkpoint:beforeCommit','transition:beforeCommit'].includes(point))throw Error('INVALID_HOOK');this.#hooks.set(point,fn);}#emit(point){const f=this.#hooks.get(point);this.#hooks.delete(point);f?.();}checkpoint(){}
 stats(){return copy(this.#counts);}
}
Object.freeze(PriceStore.prototype);
