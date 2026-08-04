import { verifyEvaluatorAuthority } from "./ask-benchmark-evaluator-boundary.mjs";

/**
 * @deprecated Use verifyEvaluatorAuthority() directly. This compatibility alias
 * does not add evaluator, private-authority, profile, or readiness validation.
 */
export function verifyLifecycleNeutralEvaluatorResult(options) {
  return verifyEvaluatorAuthority(options);
}
