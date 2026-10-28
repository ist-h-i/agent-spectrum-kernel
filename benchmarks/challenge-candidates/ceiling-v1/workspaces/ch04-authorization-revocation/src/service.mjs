import { evaluate } from './policy.mjs';

export class DocumentService {
  constructor(store, chunks, { chunkSize = 4, logger = () => {} } = {}) {
    this.store = store; this.chunks = chunks; this.chunkSize = chunkSize; this.logger = logger;
    this.cache = new Map(); this.jobs = new Map(); this.next = 1;
    this.unsubscribe = store.subscribe(() => this.cache.clear());
  }
  decide(request) {
    const key = JSON.stringify([request.user, request.resource, request.action, request.linkToken]);
    if (!this.cache.has(key)) this.cache.set(key, evaluate(this.store.snapshot(request.tenant), request));
    return this.cache.get(key);
  }
  list({ tenant, user }) {
    const policy = this.store.snapshot(tenant);
    return Object.keys(policy?.resources ?? {}).filter(resource => this.decide({ tenant, user, resource, action: 'read' }));
  }
  detail(request) {
    return this.decide({ ...request, action: 'read' })
      ? { status: 'allowed', body: this.store.snapshot(request.tenant).resources[request.resource].body }
      : { status: 'denied' };
  }
  requestExport(request) {
    if (!this.decide({ ...request, action: 'export' })) return { status: 'denied' };
    const id = `export-${this.next++}`;
    this.jobs.set(id, { id, request: structuredClone(request), offset: 0, status: 'queued' });
    return { status: 'queued', jobId: id };
  }
  runChunk(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return { status: 'missing' };
    if (['completed', 'cancelled', 'denied', 'unknown'].includes(job.status)) return { status: job.status };
    if (!this.decide({ ...job.request, action: 'export' })) return Object.assign(job, { status: 'denied' });
    const policy = this.store.snapshot(job.request.tenant);
    const body = policy.resources[job.request.resource].body;
    const bytes = body.slice(job.offset, job.offset + this.chunkSize);
    const result = this.chunks.beginChunk({ tenant: job.request.tenant, expectedRevision: policy.revision, resource: job.request.resource, bytes });
    if (result.status !== 'accepted') return { status: result.status };
    this.chunks.finish(result.receipt);
    job.offset += bytes.length;
    job.status = job.offset >= body.length ? 'completed' : 'running';
    return { status: job.status, receipt: result.receipt };
  }
  cancelExport(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return { status: 'missing' };
    job.status = 'cancelled';
    return { status: job.status };
  }
  exportStatus(jobId) {
    const job = this.jobs.get(jobId);
    return job ? { status: job.status, offset: job.offset } : { status: 'missing' };
  }
  close() { this.unsubscribe(); }
}
