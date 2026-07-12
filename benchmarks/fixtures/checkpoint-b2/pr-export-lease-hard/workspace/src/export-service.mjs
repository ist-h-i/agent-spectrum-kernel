import { AuthorizationError, JobNotFoundError } from './errors.mjs';

export class ExportService {
  constructor({ store, exporter, clock }) {
    this.store = store;
    this.exporter = exporter;
    this.clock = clock;
  }

  getJob(jobId, principal) {
    const job = this.store.get(jobId);
    if (!job) throw new JobNotFoundError();
    if (job.tenantId !== principal.tenantId) throw new AuthorizationError();
    return job;
  }

  async runOne(workerId) {
    const job = await this.store.claimNext(workerId, this.clock.now());
    if (!job) return null;
    try {
      const result = await this.exporter.export(job.payload);
      return this.store.complete(job.id, workerId, result, this.clock.now());
    } catch (error) {
      return this.store.fail(job.id, workerId, error, this.clock.now());
    }
  }

  retry(jobId, principal) {
    const job = this.store.get(jobId);
    if (!job) throw new JobNotFoundError();
    if (job.ownerId !== principal.userId && principal.role !== 'operator') throw new AuthorizationError();
    return this.store.retry(jobId, this.clock.now());
  }
}
