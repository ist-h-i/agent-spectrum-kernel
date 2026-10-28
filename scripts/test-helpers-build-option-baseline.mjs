import assert from "node:assert/strict";

// Test-only positive oracle; every invocation performs both live checks.
export function verifyBuildOptionBaseline(verifyBoundary, verifyAuthority, state) {
  const result = verifyBoundary();
  const authority = verifyAuthority();
  assert.equal(authority.evaluationReady, result.scoringReady, `binary evaluation completeness must match the admitted compatibility boundary for ${state}`);
  assert.equal(Object.hasOwn(authority, "scoringReady"), false, `binary evaluator authority must not expose scoring readiness for ${state}`);
  return result;
}
