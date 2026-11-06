import {normalizeRecord,migrateRecords} from './records.mjs';
import { enqueueJob } from './jobs.mjs';
import { render } from '../harness/renderer.mjs';
export function createQueue({ store, sink, renderer = render, faults = { hit() {} }, leaseMs = 10 }) {
  function update(job, patch) { store.cas(job.key, job.version, { ...job, ...patch }); return store.read(job.key); }
  const api = {
    enqueue: (tenantId, requestId, payload) => enqueueJob(store, tenantId, requestId, payload),
    snapshot: key => {const j=store.read(key);return j?normalizeRecord(j):null;},
    claim(worker) {
      const job = store.scan().find(j => j.state === 'queued');
      if (!job) return null;
      return update(job, { state: 'running', lease: { worker, token: job.version + 1, until: store.now() + leaseMs } });
    },
    run(key, worker) {
      let job = store.read(key);
      if (!job || job.state !== 'running' || job.lease.worker !== worker) return null;
      try {
        faults.hit('before-render'); const bytes = renderer(job.payload); faults.hit('after-render');
        faults.hit('before-put'); const result = sink.putIfAbsent(key, job.digest, bytes); faults.hit('after-put');
        if (result.status !== 'stored') throw new Error(result.status);
        faults.hit('before-complete');
        job = update(job, { state: 'succeeded', receipt: result.receipt, lease: null });
        faults.hit('after-complete'); return job;
      } catch (error) {
        if (error.code === 'PROCESS_CRASH') throw error;
        return update(job, { state: error.code === 'PERMANENT' ? 'failed' : 'queued', reason: error.message, lease: null });
      }
    },
    cancel(key) {
      const job = store.read(key); if (!job) return null;
      return update(job, { state: 'cancelled', lease: null });
    },
    recoverPage(cursor=null,limit=16){
      migrateRecords(store);const page=store.page(cursor,limit),jobs=[];
      for(const selected of page.items){let job=store.read(selected.key);if(job.state==='running'&&job.lease.until<=store.now())job=update(job,{state:'queued',lease:null});jobs.push(job);}
      return{cursor:page.cursor,done:page.done,visited:page.items.length,jobs};
    },
    recover() {
      migrateRecords(store);
      for (const job of store.scan()) if (job.state === 'running' && job.lease.until <= store.now()) update(job, { state: 'queued', lease: null });
      return store.scan();
    },
  };
  return api;
}
