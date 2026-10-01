import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertExactPlanIdentity, validateMaterializedPortfolio } from "./ask-benchmark-materialize.mjs";
import { validatePromptSuccessorPreparation, successorExact, successorFail } from "./ask-benchmark-prompt-successor.mjs";
import { sealAdaptiveSelection, verifyAdaptiveSelection } from "./ask-benchmark-selection.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ROLES = ["current_prompt", "prompt_v2"];

function key(value) { return `${value.fixture_id}\u0000${value.repetition}`; }

/**
 * The native #197 plan retains all four conditions, but Issue #291 runs only
 * Codex full_ask. Record the excluded adaptive condition as an explicit bypass,
 * without pretending that task-specific mechanisms were selected or executed.
 */
export function issue291ExcludedAdaptiveSelection(planCase, materializedCase) {
  if (planCase.condition !== "adaptive_ask" || materializedCase.condition !== "adaptive_ask"
      || planCase.case_id !== materializedCase.case_id) {
    successorFail("SUCCESSOR_SELECTION_SCOPE", "only the matching excluded adaptive case may be bypassed");
  }
  const projection = materializedCase.projection_evidence;
  return {
    task_class: planCase.task_class,
    observed_signals: ["Issue #291 measures Codex full_ask only; this adaptive_ask case is outside the frozen 28-trial inventory"],
    selected_mechanisms: [],
    skipped_mechanisms: ["adaptive_ask mechanism selection and execution"],
    required_gates: ["excluded case remains pending with zero attempts"],
    agents: { requested: [], omitted: ["agent execution for excluded adaptive_ask case"] },
    expected_evidence: ["no claim, attempt, or result for this excluded case"],
    capability_downgrades: [],
    lightweight_bypass: {
      used: true,
      reason: "Issue #291 freezes only the 28 Codex full_ask trials; adaptive_ask is not measured",
    },
    projection: {
      adapter_track: materializedCase.adapter,
      profile: projection.selected_profile,
      renderer_id: projection.renderer_id,
      renderer_version: projection.renderer_version,
      projection_fingerprint: projection.projection_fingerprint,
    },
  };
}

/** Seal or verify the exact pre-result bypasses before creating a native run. */
export function sealIssue291ExcludedAdaptiveSelections({
  root = ROOT, config, planPath, materializedPath, stateDir, repositoryRevision, preparation,
}) {
  successorExact(resolve(root), ROOT, "Issue #291 selection repository");
  validatePromptSuccessorPreparation(preparation);
  successorExact(preparation.implementation.revision, repositoryRevision, "Issue #291 selection source");
  successorExact(preparation.expected_case_count, 28, "Issue #291 measured trial count");
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  assertExactPlanIdentity({ root, config, plan, repositoryRevision });
  const materialized = validateMaterializedPortfolio({ root, config, plan, materializedRoot: materializedPath, repositoryRevision });
  const measured = plan.cases.filter(item => item.adapter_track === "codex" && item.condition === "full_ask");
  const expected = new Set(measured.map(key));
  if (measured.length !== 14 || expected.size !== 14 || preparation.cases.length !== 28
      || preparation.cases.some(item => item.adapter_track !== "codex" || item.raw_scoring_condition !== "full_ask"
        || !ROLES.includes(item.prompt_role) || !expected.has(key(item)))) {
    successorFail("SUCCESSOR_SELECTION_SCOPE", "native full_ask source differs from the 14 paired blocks");
  }
  for (const role of ROLES) {
    const cases = preparation.cases.filter(item => item.prompt_role === role);
    if (cases.length !== 14 || new Set(cases.map(key)).size !== 14) {
      successorFail("SUCCESSOR_SELECTION_SCOPE", `${role} lacks the exact 14-block inventory`);
    }
  }
  const excluded = plan.cases.filter(item => item.condition === "adaptive_ask");
  if (excluded.length !== 28) successorFail("SUCCESSOR_SELECTION_SCOPE", "native adaptive exclusion inventory");
  for (const item of excluded) {
    const materializedCase = materialized.casesById.get(item.case_id);
    if (!materializedCase) successorFail("SUCCESSOR_SELECTION_SCOPE", "missing materialized adaptive case");
    const input = issue291ExcludedAdaptiveSelection(item, materializedCase);
    const sealedPath = resolve(stateDir, "selections", `${item.case_id}.json`);
    if (!existsSync(sealedPath)) {
      sealAdaptiveSelection({ root, config, planPath, materializedPath, stateDir,
        caseId: item.case_id, input, repositoryRevision });
    }
    const record = verifyAdaptiveSelection({ root, config, planPath, materializedPath, stateDir,
      caseId: item.case_id, repositoryRevision });
    for (const [field, value] of Object.entries(input)) successorExact(record[field], value, `excluded adaptive selection.${field}`);
  }
  const names = readdirSync(resolve(stateDir, "selections")).sort();
  successorExact(names, excluded.map(item => `${item.case_id}.json`).sort(), "excluded adaptive selection files");
  const indexBytes = readFileSync(resolve(stateDir, "selection-state.json"));
  const index = JSON.parse(indexBytes);
  successorExact(index.sealed_cases.map(item => item.case_id).sort(), excluded.map(item => item.case_id).sort(), "excluded adaptive selection index");
  return { kind: "issue291_excluded_adaptive_selection", excluded_case_count: excluded.length,
    measured_source_case_count: measured.length, measured_trial_count: preparation.cases.length,
    selection_state_digest: `sha256:${createHash("sha256").update(indexBytes).digest("hex")}` };
}
