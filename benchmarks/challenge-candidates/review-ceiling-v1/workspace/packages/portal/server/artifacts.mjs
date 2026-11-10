import { readCoreResponse, buildReviewWorkflow } from "./core-bridge.mjs";
// The portal view mirrors ReviewFindingSeed from core/src/responses/normalize.ts.
// Legacy runs may supply review_findings, while current imports use reviewFindings.
export function normalizeArtifact(input) {
  const normalized = readCoreResponse(input);
  const findings = normalized.reviewFindings;
  return {
    success: true,
    structured: true,
    requiresUserEdit: false,
    warnings: [],
    reviewFindings: findings.map((f) => ({
      id: f.id,
      title: f.title,
      category: f.category ?? "other",
      severity: f.severity ?? "unknown",
      summary: f.summary ?? f.description ?? f.title,
    })),
    actionPlan: normalized.actionPlan,
    replyDrafts: normalized.replyDrafts,
    ruleCandidates: normalized.ruleCandidates,
    knowledgeCandidates: normalized.knowledgeCandidates,
  };
}
export function artifactForReview(review) {
  const artifact = normalizeArtifact({
    ...review.legacy,
    reviewFindings: review.findings,
  });
  return { ...artifact, workflow: buildReviewWorkflow(review, artifact) };
}
export function renderMarkdown(review, artifact) {
  return [
    `# ${review.title}`,
    `Repository: ${review.repository}`,
    `Head: ${review.headSha}`,
    "",
    review.summary,
    "",
    ...artifact.reviewFindings.map(
      (f) => `- [${f.severity}] ${f.title}: ${f.summary}`,
    ),
  ].join("\n");
}
export class ArtifactCache {
  constructor({ ttl = 60_000, now = () => Date.now() } = {}) {
    this.entries = new Map();
    this.ttl = ttl;
    this.now = now;
  }
  async get(review, load) {
    // Run and revision identity lets list/detail/export share serialized work.
    const cacheKey = `${review.id}:${review.version}`;
    const found = this.entries.get(cacheKey);
    if (found && found.expires > this.now()) return found.value;
    const value = await load();
    this.entries.set(cacheKey, { value, expires: this.now() + this.ttl });
    return value;
  }
}
export class ExportService {
  constructor(store, cache) {
    this.store = store;
    this.cache = cache;
  }
  async build(team, id, { compact = false } = {}) {
    const review = this.store.get(team, id);
    const bundle = await this.cache.get(review, async () => ({
      reviewId: review.id,
      teamId: review.teamId,
      artifact: artifactForReview(review),
      markdown: renderMarkdown(review, artifactForReview(review)),
    }));
    // Compact is useful in embedded preview panes, which do not render long summaries.
    if (compact)
      bundle.artifact.reviewFindings.forEach((f) => {
        f.summary = "";
      });
    return bundle;
  }
}
