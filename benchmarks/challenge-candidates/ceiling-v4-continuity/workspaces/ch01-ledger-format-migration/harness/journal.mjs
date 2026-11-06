const copy=value=>structuredClone(value);
const blank=()=>({events:[],version:0,cursor:0,rows:[],activated:false});
export class LedgerJournal {
 #tenants=new Map();#hooks=new Map();#counts={eventsRead:0,rowReads:0,snapshotRows:0,appends:0,commits:0};
 constructor(image=null){if(image)for(const [tenant,value]of image.tenants)this.#tenants.set(tenant,copy(value));}
 #state(tenant){if(!this.#tenants.has(tenant))this.#tenants.set(tenant,blank());return this.#tenants.get(tenant);}
 inspect(tenant){const s=this.#state(tenant);return {head:s.events.length,version:s.version,cursor:s.cursor,activated:s.activated};}
 request(tenant,requestId){const event=this.#state(tenant).events.find(item=>item.requestId===requestId)??null;if(event!==null)this.#counts.eventsRead++;return copy(event);}
 append(tenant,expectedHead,event){const s=this.#state(tenant);if(s.events.length!==expectedHead)return null;
  const next={seq:s.events.length+1,requestId:event.requestId,changes:copy(event.changes)};s.events.push(next);this.#counts.appends++;return copy(next);}
 scan(tenant,after,limit,through=Number.MAX_SAFE_INTEGER){const page=copy(this.#state(tenant).events.slice(after,Math.min(after+limit,through)));this.#counts.eventsRead+=page.length;this.boundary('scan:returned');return page;}
 row(tenant,id){const s=this.#state(tenant);this.#counts.rowReads++;return {cursor:s.cursor,row:copy(s.rows.find(row=>row.id===id)??null)};}
 snapshot(tenant){const s=this.#state(tenant);this.#counts.snapshotRows+=s.rows.length;return {version:s.version,cursor:s.cursor,rows:copy(s.rows),activated:s.activated};}
 commit(tenant,version,next){const s=this.#state(tenant);if(s.version!==version)return false;
  if(!Number.isSafeInteger(next.cursor)||next.cursor<s.cursor||next.cursor>s.events.length)throw Error('INVALID_SNAPSHOT');
  s.cursor=next.cursor;s.rows=copy(next.rows);s.activated=next.activated;s.version++;this.#counts.commits++;return true;}
 activate(tenant,version,head){const s=this.#state(tenant);if(s.version!==version||s.events.length!==head||s.cursor!==head)return false;s.activated=true;s.version++;return true;}
 export(){for(const state of this.#tenants.values()){this.#counts.eventsRead+=state.events.length;this.#counts.snapshotRows+=state.rows.length;}return {tenants:copy([...this.#tenants])};}
 stats(){return copy(this.#counts);}
 once(point,callback){if(!['scan:returned','write:beforeAppend','write:afterAppend','migration:beforeCommit','activation:beforeCommit'].includes(point))throw Error('INVALID_POINT');this.#hooks.set(point,callback);}
 boundary(point){const callback=this.#hooks.get(point);if(callback){this.#hooks.delete(point);callback();}}
}
