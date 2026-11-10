import { seedReviews } from "../../server/fixtures.mjs";

// Fixture builders produce a stable persisted row for queue rendering tests.
export function reviewFixture(overrides = {}) {
  const review = { ...seedReviews(1)[0], ...structuredClone(overrides) };
  review.version = Math.max(1, Math.trunc(Number(review.version) || 1));
  review.history = [...review.history].sort((a, b) => a.at.localeCompare(b.at));
  return review;
}
