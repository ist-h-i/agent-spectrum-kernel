import { JobNotFoundError, JobConflictError } from './errors.mjs';
import { computeBackoff } from './retry-policy.mjs';

export class JobStore {
  #jobs = new Map();

  constructor(jobs = [], { leaseMs = 30_000, baseDelayMs = 1_000, beforeClaim = async () => {} } = {}) {
    for (const job of jobs) this.#jobs.set(job.id, structuredClone(job));
    this.leaseMs = leaseMs;
    this.baseDelayMs = baseDelayMs;
    this.beforeClaim = beforeClaim;
  }

  get(id) {
    const job = this.#jobs.get(id);
    return job ? structuredClone(job) : null;
  }

  create(job) {
    if (this.#jobs.has(job.id)) throw new JobConflictError('Duplicate job');
    this.#jobs.set(job.id, structuredClone(job));
    return this.get(job.id);
  }

  async claimNext(workerId, now) {
    const candidate = [...this.#jobs.values()].find(
      (job) => job.status === 'queued' && job.availableAt <= now
    );
    if (!candidate) return null;
    await this.beforeClaim(structuredClone(candidate));
    candidate.status = 'running';
    candidate.leaseOwner = workerId;
    candidate.leaseExpiresAt = now + this.leaseMs;
    candidate.attempts += 1;
    return structuredClone(candidate);
  }

  complete(id, workerId, result, now) {
    const job = this.#jobs.get(id);
    if (!job) throw new JobNotFoundError();
    if (job.status !== 'running') throw new JobConflictError();
    job.status = 'succeeded';
    job.result = structuredClone(result);
    job.leaseOwner = null;
    job.leaseExpiresAt = null;
    return this.get(id);
  }

  fail(id, workerId, error, now) {
    const job = this.#jobs.get(id);
    if (!job) throw new JobNotFoundError();
    if (job.status !== 'running' || job.leaseOwner !== workerId) throw new JobConflictError();
    job.lastError = { code: error.code ?? 'EXPORT_FAILED', message: error.message, retryable: Boolean(error.retryable) };
    job.leaseOwner = null;
    job.leaseExpiresAt = null;
    if (error.retryable) {
      job.status = 'queued';
      job.availableAt = now + computeBackoff(job.attempts, this.baseDelayMs);
    } else {
      job.status = 'failed';
      job.availableAt = null;
    }
    return this.get(id);
  }

  retry(id, now) {
    const job = this.#jobs.get(id);
    if (!job) throw new JobNotFoundError();
    job.lastError = null;
    job.availableAt = now + computeBackoff(job.attempts, this.baseDelayMs);
    if (job.status !== 'failed') throw new JobConflictError();
    if (job.attempts >= job.maxAttempts) throw new JobConflictError('Attempts exhausted');
    job.status = 'queued';
    return this.get(id);
  }
}
