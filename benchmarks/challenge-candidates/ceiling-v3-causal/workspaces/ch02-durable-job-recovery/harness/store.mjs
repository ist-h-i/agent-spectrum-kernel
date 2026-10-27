const clone = value => structuredClone(value);
export const jobKey = (tenantId, requestId) => JSON.stringify([tenantId, requestId]);
export class DurableStore {
  #jobs = new Map();
  #now = 0;
  #order=new Map(); #index=[]; #ordinal=0; #counts={reads:0,casCalls:0,scanVisits:0,pageCalls:0,pageVisits:0};
  now() { return this.#now; }
  advance(ms) { if (!Number.isSafeInteger(ms) || ms < 0) throw new Error('invalid clock'); this.#now += ms; }
  read(key) { this.#counts.reads++; return clone(this.#jobs.get(key) ?? null); }
  scan() { this.#counts.scanVisits+=this.#jobs.size; return [...this.#jobs.values()].map(clone); }
  putIfAbsent(key, value) {
    if (this.#jobs.has(key)) return { inserted: false, job: this.read(key) };
    this.#order.set(key,++this.#ordinal); this.#index.push(key); this.#jobs.set(key, { ...clone(value), key, version: 1 });
    return { inserted: true, job: this.read(key) };
  }
  cas(key, version, value) {
    this.#counts.casCalls++;
    if (this.#jobs.get(key)?.version !== version) return false;
    this.#jobs.set(key, { ...clone(value), key, version: version + 1 }); return true;
  }
  page(cursor=null,limit=16){
    this.#counts.pageCalls++;
    const invalid=()=>{const e=new Error('invalid page');e.code='INVALID_CURSOR';throw e;};
    if(!Number.isSafeInteger(limit)||limit<1||limit>32)invalid();
    const point=cursor===null?{after:0,ceiling:this.#ordinal}:cursor;
    if(!point||!Number.isSafeInteger(point.after)||!Number.isSafeInteger(point.ceiling)||point.after<0||point.after>point.ceiling||point.ceiling>this.#ordinal)invalid();
    const keys=this.#index.slice(point.after,Math.min(point.after+limit,point.ceiling));
    this.#counts.pageVisits+=keys.length;
    const after=point.after+keys.length;
    const done=after>=point.ceiling;
    return{items:keys.map(key=>clone(this.#jobs.get(key))),cursor:done?null:{after,ceiling:point.ceiling},done};
  }
  observation(){return clone({...this.#counts,records:this.#jobs.size});}
  transaction(fn) {
    const backup = clone(this.#jobs), orderBackup=clone(this.#order), ordinalBackup=this.#ordinal,indexBackup=this.#index.slice();
    try {
      const result = fn(this);
      if (result?.then) throw new Error('transaction must be synchronous');
      return result;
    } catch (error) { this.#jobs = backup; this.#order=orderBackup;this.#ordinal=ordinalBackup;this.#index=indexBackup;throw error; }
  }
}
