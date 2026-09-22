import { realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalDigest, readJsonFileStrict, readStableBytes,
  assertNoSymlinkPathSegments,
} from "./content-addressed-store.mjs";
import {
  buildPromptSuccessorPreparation, validatePromptSuccessorPreparation,
  successorExact, successorFail,
} from "./ask-benchmark-prompt-successor.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const HISTORICAL_PREREGISTRATION_DIGEST = "sha256:f5cc838703008896e7864e17501c99c3ae74196b851d186ae1e0aa0a45939b3d";
export const HISTORICAL_BINDING_PATH = "docs/fixtures/prompt-v2-preregistration/binding.json";

export async function readSuccessorParent({ root = ROOT } = {}) {
  // Import the real historical validator, not a caller-supplied validation hook.
  const legacy = await import("./ask-benchmark-prompt-v2.mjs");
  const preregistration = legacy.loadPromptV2Preregistration({ root });
  successorExact(preregistration.preregistration_digest, HISTORICAL_PREREGISTRATION_DIGEST, "historical preregistration");
  const binding = readJsonFileStrict(resolve(root, HISTORICAL_BINDING_PATH), "historical binding");
  legacy.validatePromptV2AuthorityBinding(binding, { preregistration });
  const plan = legacy.buildPromptV2ExecutionPlan({ preregistration, authorityBinding: binding });
  legacy.validatePromptV2ExecutionPlan(plan, { preregistration, authorityBinding: binding, root });
  const codex = plan.cases.filter(({ adapter_track }) => adapter_track === "codex");
  successorExact(codex.length, 28, "historical Codex inventory");
  const parent = {
    preregistration_id: preregistration.preregistration_id,
    preregistration_digest: preregistration.preregistration_digest,
    authority_binding_digest: binding.binding_digest,
    source_revision: binding.source.repository_revision,
    source_tree: binding.source.repository_tree,
    thresholds_digest: canonicalDigest(preregistration.thresholds),
    raw_scorer_authority_digest: preregistration.raw_scoring.authority_digest,
    fixtures: preregistration.fixtures.map((fixture) => ({
      fixture_id: fixture.catalog_fixture_id,
      source_fixture_id: fixture.source_fixture_id,
      task_class: fixture.task_class,
      repetitions: fixture.repetitions,
      common_input_digest: codex.find(({ fixture_id }) => fixture_id === fixture.catalog_fixture_id).common_input_identity_digest,
    })),
    role_inputs: ["current_prompt", "prompt_v2"].map((prompt_role) => {
      const entry = codex.find((value) => value.prompt_role === prompt_role);
      return {
        prompt_role,
        asset_record_digest: entry.prompt_authority.asset.record_digest,
        asset_content_digest: entry.prompt_authority.asset.content_digest,
        rendered_bundle_digest: entry.prompt_projection_digest,
        source_authority_digest: canonicalDigest(entry.prompt_authority),
      };
    }),
  };
  return { parent, thresholds: structuredClone(preregistration.thresholds), legacyPlan: plan };
}

export function readSuccessorImplementationIdentity(root = ROOT) {
  assertNoSymlinkPathSegments(root, "repository");
  successorExact(realpathSync(root), realpathSync(ROOT), "loaded repository root");
  const git = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10000, maxBuffer: 1024 * 1024 }).trim();
  const revision = git(["rev-parse", "--verify", "HEAD"]);
  const tree = git(["rev-parse", "--verify", "HEAD^{tree}"]);
  if (git(["status", "--porcelain", "--untracked-files=normal"]) !== "") successorFail("SUCCESSOR_DIRTY_SOURCE", "repository");
  // Bind the implementation actually imported by this process, not just a clean,
  // unrelated checkout supplied as --root. The package has no dynamic plugin path.
  for (const path of ["scripts/ask-benchmark-calibration-source.mjs", "scripts/ask-benchmark-prompt-successor-scoring-inputs.mjs", "scripts/ask-benchmark-materialize.mjs", "scripts/ask-benchmark-evaluator-boundary.mjs", "benchmarks/schemas/portfolio-config.schema.json", "scripts/ask-benchmark-prompt-successor.mjs", "scripts/ask-benchmark-prompt-successor-repository.mjs", "scripts/ask-benchmark-prompt-successor-bridge.mjs", "scripts/ask-benchmark-prompt-successor-check.mjs", "scripts/ask-benchmark-prompt-successor-delivery.mjs", "scripts/ask-benchmark-prompt-successor-provenance.mjs", "scripts/ask-benchmark-prompt-successor-report.mjs", "scripts/ask-benchmark-execution.mjs", "scripts/ask-benchmark-prompt-successor-native.mjs"]) {
    const live = readStableBytes(resolve(ROOT, path), "loaded implementation", 4 * 1024 * 1024);
    const pinned = execFileSync("git", ["-C", root, "show", `${revision}:${path}`], { encoding: null, timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
    if (!live.equals(pinned)) successorFail("SUCCESSOR_IMPLEMENTATION_TRANSPLANT", path);
  }
  return { revision, tree };
}

export async function prepareSuccessorFromRepository({ root = ROOT, runtime, seed, changeReason, scoringInputManifestDigest = null }) {
  const implementation = readSuccessorImplementationIdentity(root);
  const { parent } = await readSuccessorParent({ root });
  return buildPromptSuccessorPreparation({ parent, runtime, implementation, seed, changeReason, scoringInputManifestDigest });
}

export async function validateSuccessorFromRepository(preparation, { root = ROOT } = {}) {
  const { parent } = await readSuccessorParent({ root });
  validatePromptSuccessorPreparation(preparation, { expectedParent: parent });
  successorExact(preparation.implementation, readSuccessorImplementationIdentity(root), "implementation pin");
  return preparation;
}
