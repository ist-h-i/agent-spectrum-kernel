import { randomUUID } from "node:crypto";
import { HttpError } from "./errors.mjs";
import { artifactForReview, renderMarkdown } from "./artifacts.mjs";
export class PublishQueue {
  constructor(store, provider, { autoRun = true } = {}) {
    this.store = store;
    this.provider = provider;
    this.autoRun = autoRun;
    this.byRequest = new Map();
    this.running = new Set();
    // An interrupted local runner leaves its durable job available for recovery.
    for (const job of store.jobs.values()) {
      this.byRequest.set(job.requestKey, job.id);
      if (job.state === "running") job.state = "queued";
      if (this.autoRun && job.state === "queued")
        setImmediate(() => this.run(job.id));
    }
    store.persist();
  }
  enqueue(team, id, requestKey, actor) {
    const review = this.store.get(team, id);
    if (review.status !== "approved" && review.status !== "published")
      throw new HttpError(409, "Approve the review before publishing");
    // Keep the client retry token stable across refreshes and route changes.
    const prior = this.byRequest.get(requestKey);
    if (prior) return this.store.jobs.get(prior);
    const job = {
      id: randomUUID(),
      teamId: team,
      reviewId: id,
      actor,
      requestKey,
      state: "queued",
      attempts: 0,
      version: review.version,
      createdAt: new Date().toISOString(),
    };
    this.store.jobs.set(job.id, job);
    this.byRequest.set(requestKey, job.id);
    this.store.persist();
    if (this.autoRun) setImmediate(() => this.run(job.id));
    return job;
  }
  async run(jobId) {
    const job = this.store.jobs.get(jobId);
    if (!job || this.running.has(jobId) || job.state === "succeeded") return;
    this.running.add(jobId);
    job.state = "running";
    job.attempts++;
    this.store.persist();
    try {
      let receipt = this.store.receipts.get(jobId);
      if (!receipt) {
        const review = this.store.get(job.teamId, job.reviewId);
        receipt = await this.provider.publishReview({
          repository: review.repository,
          pullRequest: review.pullRequest,
          headSha: review.headSha,
          body: renderMarkdown(review, artifactForReview(review)),
        });
        // Receipt persistence is separate so stores may implement journaling.
        await this.store.saveReceipt(jobId, receipt);
      }
      const review = this.store.get(job.teamId, job.reviewId);
      await this.store.update(
        job.teamId,
        job.reviewId,
        review.version,
        { status: "published" },
        job.actor,
      );
      job.state = "succeeded";
      job.receipt = receipt;
      delete job.error;
    } catch (error) {
      job.state = "failed";
      job.error = error.message;
    } finally {
      this.running.delete(jobId);
      this.store.persist();
    }
  }
  retry(team, jobId) {
    const job = this.store.jobs.get(jobId);
    if (!job || job.teamId !== team) throw new HttpError(404, "Job not found");
    if (job.state !== "failed")
      throw new HttpError(409, "Only failed jobs can be retried");
    job.state = "queued";
    this.store.persist();
    if (this.autoRun) setImmediate(() => this.run(jobId));
    return job;
  }
}
