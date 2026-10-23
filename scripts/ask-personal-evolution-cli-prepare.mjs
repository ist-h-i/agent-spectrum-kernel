// Thin public-fixture preparation for the existing personal Prompt pair.
// No execution, grading, authority inference or fixture discovery occurs here.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { canonicalDigest, parseJsonRejectDuplicateKeys, readContentAddressedJson, readStableBytes } from "./content-addressed-store.mjs";
import { buildPrimaryFixtureRecipe, validatePrimaryFixtureRecipe } from "./ask-primary-fixture-recipe.mjs";
import { comparisonHash, prepareGitBaseline, prepareUserComparison } from "./ask-user-comparison-prepare.mjs";
import { resolvePortfolioSelection } from "./portfolio-manager.mjs";
import { PRIMARY_GRADING_RESERVATION_MS } from "./ask-primary-evaluation-batch.mjs";
import { readPrimaryScoringVersion } from "./ask-primary-scoring-version.mjs";
import { buildEvolutionExperiment, publishEvolutionExperiment, computePromptV2ExactProjectionDigests } from "./evolution-loop.mjs";
import { planPersonalEvolutionBaselineAlignment, applyPersonalEvolutionBaselineAlignment } from "./ask-personal-evolution-alignment.mjs";
import { sealPersonalEvolutionPromptPair, validatePersonalEvolutionEvaluationSelection } from "./ask-personal-evolution-primary-pair.mjs";

const ROOT = resolve(import.meta.dirname, ".."), roles = ["baseline", "challenger"];
const read = (storeRoot, digest) => readContentAddressedJson({ storeRoot, digest }).value;
const bytes = path => readStableBytes(path, "fixed personal evaluation input");
const json = path => parseJsonRejectDuplicateKeys(bytes(path).toString("utf8"));

export function preparePersonalEvolutionCliPair({ profile, cycleRoot, preparationObjectDigest, cycleId }) {
  assert.equal(profile.evaluation?.fixtureSet, "catalog24", "saved profile requires migration before creating a new pair; preserve existing cycles and configure a fresh catalog profile");
  assert.deepEqual(profile.evaluation.fixtureIds, profile.blueprint.evaluation_scope.fixture_ids, "saved profile requires migration to an explicit catalog selection before creating a new pair");
  const { storeRoot, trust, evaluation } = profile;
  const fixtureSet = validatePersonalEvolutionEvaluationSelection(evaluation, profile.blueprint.evaluation_scope.fixture_ids);
  const alignmentInput = { storeRoot, ...trust, preparationObjectDigest,
    baselineRevision: `${cycleId}-baseline`, challengerRevision: `${cycleId}-challenger`,
    portfolioAuthority: profile.portfolioAuthority };
  const planned = planPersonalEvolutionBaselineAlignment(alignmentInput);
  // Explicit management authority is fixed in the profile before any results.
  const alignedTrust = [...trust.trustedPortfolioAuthorityContexts, ...Object.values(planned.plan.authority_contexts)];
  const aligned = applyPersonalEvolutionBaselineAlignment({ ...alignmentInput,
    alignmentObjectDigest: planned.object_digest, trustedAlignmentObjectDigests: [planned.object_digest],
    trustedPortfolioAuthorityContexts: alignedTrust, selectorContext: { ...profile.selectorContext,
      task_class: buildPrimaryFixtureRecipe(profile.blueprint.evaluation_scope.fixture_ids[0]).task_class } });
  if (aligned.status === "NOT_RUN") return { blocked: aligned };
  const candidate = aligned.prepared.candidate, draft = structuredClone(read(storeRoot, profile.experimentTemplateObjectDigest));
  draft.candidate_digest = candidate.candidate_digest;
  draft.candidate_object_digest = aligned.prepared.preparation.candidate_object_digest;
  draft.roles = aligned.roles;
  Object.assign(draft.protocol, { source_revision: profile.sourceRevision, model: evaluation.model,
    fixture_ids: candidate.evaluation_scope.fixture_ids, task_classes: candidate.evaluation_scope.task_classes,
    exclusions: candidate.evaluation_scope.exclusions, candidate_evaluation_scope_digest: canonicalDigest(candidate.evaluation_scope), repetitions: 1 });
  draft.protocol.cli.version = evaluation.cliVersion;
  Object.assign(draft.projection, computePromptV2ExactProjectionDigests(aligned.roles));
  const experiment = publishEvolutionExperiment({ storeRoot, experiment: buildEvolutionExperiment(draft) });
  const input = { storeRoot, ...trust, preparationObjectDigest: aligned.prepared.preparation_object_digest,
    experimentObjectDigest: experiment.object_digest, trustedExperimentObjectDigests: [experiment.object_digest],
    trustedExperimentAuthorities: [draft.authority], trustedPortfolioAuthorityContexts: alignedTrust,
    evaluationAuthority: profile.evaluationAuthority };
  const output = join(cycleRoot, "evaluation"); mkdirSync(output, { mode: 0o700 });
  const resources = {};
  for (const role of roles) {
    const reference = evaluation.gradingResources[role], raw = bytes(reference.path);
    assert.equal(comparisonHash(raw), reference.digest, "configured grading resource template drift");
    const config = parseJsonRejectDuplicateKeys(raw.toString("utf8"));
    assert.equal(config.kind, "ask_primary_grading_resources_v1");
    config.output_root = join(cycleRoot, `grading-${role}`);
    const path = join(cycleRoot, `grading-${role}-resources.json`), serialized = Buffer.from(`${JSON.stringify(config, null, 2)}\n`);
    writeFileSync(path, serialized, { flag: "wx", mode: 0o600 });
    resources[role] = { path, digest: comparisonHash(serialized) };
  }
  const blocks = { baseline: [], challenger: [] };
  for (const fixtureId of [...candidate.evaluation_scope.fixture_ids].sort()) {
    const publicRoot = join(evaluation.publicInputRoot, fixtureId), base = join(ROOT, "benchmarks/fixtures/checkpoint-b2", fixtureId);
    const recipe = buildPrimaryFixtureRecipe(fixtureId), seed = join(output, `seed-${fixtureId}`);
    const manifest = json(join(base, "input-manifest.json"));
    const tree = new Map(manifest.fixtures[fixtureId].files.map(file => [file.path,
      { bytes: bytes(join(publicRoot, file.path)), mode: "100644" }]));
    validatePrimaryFixtureRecipe(recipe, tree, { taskBytes: tree.get("task.md").bytes,
      mutablePaths: recipe.mutable_paths, taskClass: recipe.runner_task_class });
    mkdirSync(seed, { mode: 0o700 });
    for (const [path, entry] of tree) {
      mkdirSync(dirname(join(seed, path)), { recursive: true, mode: 0o700 });
      writeFileSync(join(seed, path), entry.bytes, { flag: "wx", mode: 0o644 });
    }
    const commit = prepareGitBaseline(seed), verificationFile = join(output, `${fixtureId}-verification.json`);
    writeFileSync(verificationFile, `${JSON.stringify(recipe, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    for (const role of roles) {
      const lockDigest = aligned.roles[role].portfolio.lock_digest;
      const selection = resolvePortfolioSelection({ ...input, lockDigest,
        selectorContext: { ...profile.selectorContext, source_revision: profile.sourceRevision,
          task_class: recipe.task_class, portfolio_lock_digest: lockDigest } });
      assert.equal(selection.selection.decision, "selected", `selection blocked for ${role}/${fixtureId}`);
      const asset = aligned.roles[role].selected_asset, record = read(storeRoot, asset.record_digest);
      const basename = recipe.task_class === "verification_only" ? "skill-verify.md"
        : { review: "skill-review.md", handoff: "skill-handoff.md", investigation: "skill-investigate.md" }[recipe.runner_task_class] ?? "skill-implement.md";
      const entrypoint = record.type_extension.entrypoints.find(path => path.endsWith(`/${basename}`));
      assert.ok(entrypoint, `configured Prompt has no ${basename}`);
      const prepared = prepareUserComparison({ repo: seed, commit, taskFile: join(seed, "task.md"), verificationFile,
        output: join(output, `${role}-${fixtureId}`), mutablePaths: recipe.mutable_paths,
        taskClass: recipe.runner_task_class, evidenceKind: evaluation.evidenceKind,
        kernelCondition: "kernel_principles_v2", executionContract: "single_shot_v1",
        cliBin: evaluation.cliBin, cliVersion: evaluation.cliVersion, model: evaluation.model, reasoning: evaluation.reasoning,
        timeoutMs: 3600000, verificationTimeoutMs: 300000, overallTimeoutMs: 14400000, tokenBudget: 5000000,
        personalPrompt: { storeRoot, registrySnapshotDigest: candidate.registry.snapshot_digest, asset, entrypoint,
          runtimeVersion: "selected_active_reference_v2", trustedAssetAuthorityContexts: trust.trustedAssetAuthorityContexts } });
      const scoring = readPrimaryScoringVersion(evaluation.scoringVersion, fixtureId);
      const gradingBase = join(scoring.root, "benchmarks/fixtures/checkpoint-b2", fixtureId);
      const reference = json(join(gradingBase, "evaluator-reference.json"));
      blocks[role].push({ root: prepared.root, fixture_id: fixtureId, run_id: prepared.plan.run_id,
        plan_digest: prepared.plan_digest, source_digest: prepared.plan.source.digest, task_digest: prepared.plan.task.digest,
        verification_digest: prepared.plan.verification.digest, public_input_root: seed,
        input_manifest: { path: join(base, "input-manifest.json"), digest: recipe.input_manifest_digest },
        personal_selection_object_digest: selection.selection_object_digest,
        grading: { timeout_ms: PRIMARY_GRADING_RESERVATION_MS, resources: resources[role], scoring_version: scoring.selector,
          binding: { fixture_id: fixtureId, input_manifest_digest: recipe.input_manifest_digest,
            evaluator_bundle_digest: reference.evaluator_bundle_digest,
            scoring_input_freeze_digest: comparisonHash(bytes(join(gradingBase, "scoring-input-freeze-manifest.json"))),
            profile_id: "primary_principles_v2_single_shot_v1" } } });
    }
  }
  const sealed = sealPersonalEvolutionPromptPair({ ...input, fixtureSet, ...(evaluation.fixtureIds ? { fixtureIds: evaluation.fixtureIds } : {}), blocks, outputRoot: join(cycleRoot, "pair-output") });
  return { input: { ...input, pairRegistrationObjectDigest: sealed.object_digest,
    trustedPairRegistrationObjectDigests: [sealed.object_digest] }, outputRoot: sealed.registration.output_root };
}
