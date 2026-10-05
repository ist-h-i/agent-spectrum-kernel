import { resolve } from "node:path";
import { validateMpCiEvidenceGapInputClosure } from "./ask-benchmark-mp-ci-evidence-gap.mjs";
import { verifyPublicEvaluatorReference } from "./ask-benchmark-evaluator-boundary.mjs";

/** Existing public contracts only. No private bundle, old result, generation or execution. */
export function qualifyThreeArmPublicTask(root) {
  const result = { task: "mp-ci-evidence-gap", status: "blocked", live_ready: false,
    public_inputs: { status: "unknown" }, public_evaluator_reference: { status: "unknown" },
    private_evaluator: "unknown", human_admission_review: "unknown", kernel_zero_skill_workflow: "unknown",
    actual_cli_capability_use: "unknown", actual_process_denies: "unknown" };
  try {
    const input = validateMpCiEvidenceGapInputClosure({ root });
    result.public_inputs = { status: "verified", input_digest: input.inputDigest, verification_digest: input.verificationDigest };
  } catch { result.public_inputs = { status: "blocked", reason: "public_input_contract_refused" }; }
  try {
    const ref = verifyPublicEvaluatorReference({ root,
      referencePath: resolve(root, "benchmarks/fixtures/checkpoint-b2/mp-ci-evidence-gap/evaluator-reference.json") });
    result.public_evaluator_reference = { status: "verified", fixture: ref.fixture_id,
      bundle_digest: ref.evaluator_bundle_digest, source_revision: ref.evaluator_revision };
  } catch {
    result.public_evaluator_reference = { status: "blocked", reason: "existing_public_evaluator_source_or_binding_refused" };
  }
  return result;
}
