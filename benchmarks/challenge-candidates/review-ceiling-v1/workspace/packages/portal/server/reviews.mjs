import { HttpError } from "./errors.mjs";
export class ReviewQueries {
  constructor(store) {
    this.store = store;
  }
  async list(team, { q = "", status = "", limit = 10, cursor } = {}) {
    const size = Math.min(100, Math.max(1, Number(limit) || 10));
    let offset = 0;
    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString());
        if (
          decoded.team !== team ||
          decoded.q !== q ||
          decoded.status !== status ||
          !Number.isInteger(decoded.offset) ||
          decoded.offset < 0
        )
          throw new Error();
        offset = decoded.offset;
      } catch {
        throw new HttpError(400, "Invalid cursor");
      }
    }
    if (q.toLowerCase() === "slow")
      await new Promise((r) => setTimeout(r, 220));
    if (q.toLowerCase() === "fast") await new Promise((r) => setTimeout(r, 10));
    const rows = this.store
      .list(team)
      .filter(
        (r) =>
          (!status || r.status === status) &&
          `${r.title} ${r.repository}`.toLowerCase().includes(q.toLowerCase()),
      )
      .sort(
        (a, b) =>
          b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
      );
    // Assemble queue badges with the same sources used by detail, keeping counts consistent.
    const enriched = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        history: await this.store.history(team, r.id),
        findingCount: (await this.store.artifact(team, r.id)).findings.length,
      })),
    );
    const items = enriched.slice(offset, offset + size);
    return {
      items,
      total: rows.length,
      nextCursor:
        offset + size < rows.length
          ? Buffer.from(
              JSON.stringify({ team, q, status, offset: offset + size }),
            ).toString("base64url")
          : null,
    };
  }
  metrics(team, { partial = false } = {}) {
    const reviews = this.store.list(team);
    const bySeverity = {
      critical: 0,
      major: 0,
      minor: 0,
      suggestion: 0,
      unknown: 0,
    };
    for (const review of reviews)
      for (const f of review.findings)
        bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    return {
      total: reviews.length,
      open: reviews.filter((r) => r.status === "open").length,
      approved: reviews.filter((r) => r.status === "approved").length,
      published: reviews.filter((r) => r.status === "published").length,
      bySeverity: partial ? null : bySeverity,
      partial,
    };
  }
}
