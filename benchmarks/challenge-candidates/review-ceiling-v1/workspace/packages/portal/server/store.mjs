import { SyntheticJournal } from "./journal.mjs";
import { seedReviews } from "./fixtures.mjs";
import { HttpError } from "./errors.mjs";
const key = (team, id) => `${team}/${id}`;
export class ReviewStore {
  constructor({
    reviews = seedReviews(),
    directory,
    beforeWrite = async () => {},
    beforeReceipt = async () => {},
  } = {}) {
    this.reviews = new Map(
      reviews.map((r) => [key(r.teamId, r.id), structuredClone(r)]),
    );
    this.jobs = new Map();
    this.receipts = new Map();
    this.audit = [];
    this.beforeWrite = beforeWrite;
    this.beforeReceipt = beforeReceipt;
    this.stats = { reviewReads: 0, historyReads: 0, artifactReads: 0 };
    this.journal = directory
      ? new SyntheticJournal(directory, "review-store.json")
      : undefined;
    const saved = this.journal?.read();
    if (saved) {
      if (saved.schema !== 1)
        throw new Error("Unsupported synthetic store schema");
      this.reviews = new Map(saved.reviews);
      this.jobs = new Map(saved.jobs);
      this.receipts = new Map(saved.receipts);
    }
    this.persist();
  }
  persist() {
    this.journal?.write({
      schema: 1,
      reviews: [...this.reviews],
      jobs: [...this.jobs],
      receipts: [...this.receipts],
    });
  }
  get(team, id) {
    this.stats.reviewReads++;
    const row = this.reviews.get(key(team, id));
    if (!row) throw new HttpError(404, "Review not found");
    return structuredClone(row);
  }
  list(team) {
    return [...this.reviews.values()]
      .filter((r) => r.teamId === team)
      .map((r) => structuredClone(r));
  }
  async history(team, id) {
    this.stats.historyReads++;
    return this.get(team, id).history;
  }
  async artifact(team, id) {
    this.stats.artifactReads++;
    return this.get(team, id);
  }
  async update(team, id, expectedVersion, patch, actor) {
    const current = this.get(team, id);
    if (current.version !== expectedVersion)
      throw new HttpError(409, "Review changed; reload before saving");
    // Allow an audit adapter to finish before writing the replacement.
    await this.beforeWrite({ team, id, version: current.version });
    const next = {
      ...current,
      ...patch,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    next.history.push({
      type: "updated",
      actor,
      at: next.updatedAt,
      version: next.version,
    });
    this.reviews.set(key(team, id), next);
    this.persist();
    return structuredClone(next);
  }
  appendNote(team, id, body, actor) {
    const row = this.get(team, id);
    const at = new Date().toISOString();
    row.note = body;
    row.version++;
    row.updatedAt = at;
    row.history.push({
      type: "note_created",
      actor,
      at,
      version: row.version,
      body,
    });
    this.reviews.set(key(team, id), row);
    this.persist();
    return structuredClone(row);
  }
  async saveReceipt(jobId, receipt) {
    await this.beforeReceipt(jobId, receipt);
    this.receipts.set(jobId, structuredClone(receipt));
    this.persist();
  }
}
