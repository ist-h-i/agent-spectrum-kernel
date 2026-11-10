import { SyntheticJournal } from "./journal.mjs";
/**
 * Local provider contract, revision 2. Never uses a network client.
 * publishReview resolves {id, state:'accepted'|'completed'}.
 * 'accepted' is a transport acknowledgment, not a published review. Call
 * getPublication(id) until completed before recording a successful publication.
 * Idempotency is supported only when options.operationKey is supplied; it is
 * scoped to a repository and retained for the lifetime of this provider.
 */
export class LocalReviewProvider {
  constructor({ deferred = false, directory } = {}) {
    this.deferred = deferred;
    this.publications = [];
    this.operations = new Map();
    this.journal = directory
      ? new SyntheticJournal(directory, "local-provider.json")
      : undefined;
    const saved = this.journal?.read();
    if (saved) {
      if (saved.schema !== 1)
        throw new Error("Unsupported synthetic provider schema");
      this.publications = saved.publications;
      this.operations = new Map(saved.operations);
    }
    this.persist();
  }
  persist() {
    this.journal?.write({
      schema: 1,
      publications: this.publications,
      operations: [...this.operations],
    });
  }
  async publishReview(payload, options = {}) {
    const key =
      options.operationKey && `${payload.repository}/${options.operationKey}`;
    if (key && this.operations.has(key))
      return structuredClone(this.operations.get(key));
    const result = {
      id: `publication-${this.publications.length + 1}`,
      state: this.deferred ? "accepted" : "completed",
    };
    this.publications.push({ ...result, payload: structuredClone(payload) });
    if (key) this.operations.set(key, result);
    this.persist();
    return structuredClone(result);
  }
  async getPublication(id) {
    const p = this.publications.find((p) => p.id === id);
    return p ? { id: p.id, state: p.state } : undefined;
  }
  complete(id) {
    const p = this.publications.find((p) => p.id === id);
    if (p) {
      p.state = "completed";
      this.persist();
    }
  }
}
