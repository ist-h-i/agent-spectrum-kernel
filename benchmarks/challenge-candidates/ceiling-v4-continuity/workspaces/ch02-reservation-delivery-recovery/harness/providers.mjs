const copy = v => v == null ? v : structuredClone(v);
const fail = code => {throw Object.assign(new Error(code), {code});};
class Controls {
  #hooks = new Map(); #lost = new Set();
  once(method, fn) { this.#hooks.set(method, fn); }
  loseNextReply(method) { this.#lost.add(method); }
  before(method) { const f=this.#hooks.get(method); this.#hooks.delete(method); if(f)f(); }
  after(method, value) { if(this.#lost.delete(method))fail('REPLY_LOST'); return copy(value); }
}
export class Journal extends Controls {
  #rows; #clock; #counts={read:0,pageRows:0,allRows:0,operations:0};
  constructor(image=null) { super(); this.#rows=new Map(image?.rows??[]);this.#clock=image?.clock??0; }
  now(){return this.#clock;} advance(n){if(!Number.isSafeInteger(n)||n<0)fail('INVALID_INPUT');this.#clock+=n;return this.#clock;}
  read(key){this.#counts.read++;this.#counts.operations++;return copy(this.#rows.get(key)??null);}
  insert(key,row){this.before('insert');this.#counts.operations++;if(this.#rows.has(key))return copy(this.#rows.get(key));const next={...copy(row),revision:1};this.#rows.set(key,next);return this.after('insert',next);}
  cas(key,revision,row){this.before('cas');this.#counts.operations++;const old=this.#rows.get(key);if(!old||old.revision!==revision)return false;this.#rows.set(key,{...copy(row),revision:revision+1});return this.after('cas',true);}
  page(after=null,limit=4){this.#counts.operations++;const rows=[...this.#rows].sort(([a],[b])=>a<b?-1:a>b?1:0).filter(([k])=>after===null||k>after).slice(0,limit).map(([,v])=>copy(v));this.#counts.pageRows+=rows.length;return rows;}
  dump(){this.#counts.operations++;this.#counts.allRows+=this.#rows.size;return copy({clock:this.#clock,rows:[...this.#rows]});} stats(){return copy(this.#counts);}
}
export class Inventory extends Controls {
  #rows; #capacity; #ops=0;
  constructor(image=null,capacities=[]){super();this.#rows=new Map(image?.rows??[]);this.#capacity=new Map(image?.capacities??capacities.map(x=>[JSON.stringify([x.tenant,x.sku]),x.quantity]));}
  #existing(key,digest){const row=this.#rows.get(key);if(row&&row.digest!==digest)fail('CONFLICT');return row;}
  reserve(key,digest,tenant,sku,quantity){this.before('reserve');this.#ops++;const old=this.#existing(key,digest);if(old)return copy(old);const capacity=this.#capacity.get(JSON.stringify([tenant,sku]))??0;let used=0;for(const r of this.#rows.values())if(r.tenant===tenant&&r.sku===sku&&['reserved','committed'].includes(r.status))used+=r.quantity;const next={key,digest,tenant,sku,quantity,status:used+quantity<=capacity?'reserved':'refused'};this.#rows.set(key,next);return this.after('reserve',next);}
  finish(key,digest,mode){if(!['commit','release'].includes(mode))fail('INVALID_INPUT');this.before('finish');this.#ops++;const old=this.#existing(key,digest);let next=old??{key,digest,tenant:null,sku:null,quantity:null,status:'released'};if(old?.status==='reserved')next={...old,status:mode==='commit'?'committed':'released'};this.#rows.set(key,next);return this.after('finish',next);}
  lookup(key){this.#ops++;return copy(this.#rows.get(key)??null);} dump(){this.#ops+=1+this.#rows.size+this.#capacity.size;return copy({rows:[...this.#rows],capacities:[...this.#capacity]});} stats(){return {operations:this.#ops};}
}
export class Delivery extends Controls {
  #rows;#ops=0;constructor(image=null){super();this.#rows=new Map(image?.rows??[]);}
  #change(method,key,digest,extra){this.before(method);this.#ops++;let row=this.#rows.get(key);if(row&&row.digest!==digest)fail('CONFLICT');if(!row){row={key,digest,...extra};this.#rows.set(key,row);}return this.after(method,row);}
  putIfAbsent(key,digest,sku,quantity){return this.#change('putIfAbsent',key,digest,{sku,quantity,status:'stored',receipt:'delivery:'+key});}
  closeIfAbsent(key,digest){return this.#change('closeIfAbsent',key,digest,{status:'closed'});}
  lookup(key){this.#ops++;return copy(this.#rows.get(key)??null);}dump(){this.#ops+=1+this.#rows.size;return copy({rows:[...this.#rows]});}stats(){return {operations:this.#ops};}
}
export class Faults {
 #stops=new Set();#hooks=new Map();
 stop(point){this.#stops.add(point);}hook(point,fn){this.#hooks.set(point,fn);}
 hit(point){const fn=this.#hooks.get(point);this.#hooks.delete(point);if(fn)fn();if(this.#stops.delete(point))fail('PROCESS_CRASH');}
}
