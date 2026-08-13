#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADMISSION_DECISION_OVERLAY_ROOT,
  resolveRepositoryAdmissionDecision,
} from "./ask-benchmark-admission-decision.mjs";
import { validateVerificationCommandContract } from "./ask-benchmark-command-evidence.mjs";
import {
  evaluatorAuthorityPathsForFixture,
  validateEvaluatorAuthorityManifest,
} from "./ask-benchmark-evaluator-boundary.mjs";
import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";
import {
  buildPortfolioPlan,
  readExecutionAdmissionEvidenceManifest,
  resolvePortfolioExecutionAdmission,
} from "./ask-benchmark-plan.mjs";
import { validatePortfolioCatalog } from "./ask-benchmark-portfolio-catalog.mjs";
import { validatePortfolioPolicyArtifacts } from "./ask-benchmark-portfolio-policy.mjs";
import {
  computeFinalAdmissionRecordDigest,
  computeFrozenAdmissionRequirementAuthorityDigest,
  computeOutputContractDigest,
  computeRequirementRecordDigest,
  computeRequirementSetDigest,
  computeResultProfileDigest,
  computeScoringInputFreezeManifestDigest,
  validateFrozenFinalAdmissionRecordContract,
  validateRequirementRecordContract,
} from "./ask-benchmark-scoring-contract.mjs";

const DEFAULT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const FIXTURE_ROOT = "benchmarks/fixtures/checkpoint-b2";
const CONFIG_PATH = "benchmarks/adaptive-portfolio.config.json";
const CATALOG_PATH = "benchmarks/portfolio-catalog.json";
const POLICY_MANIFEST_PATH = "benchmarks/portfolio-policy-manifest.json";
const ADMISSION_POLICY_PATH = "benchmarks/portfolio-admission-policy.json";
const SCORING_POLICY_PATH = "benchmarks/portfolio-scoring-policy.json";
const LINEAGE_POLICY_PATH = "benchmarks/portfolio-lineage-policy.json";
const SOURCE_FREEZE_PUBLIC_BINDINGS = Object.freeze([
  "admission_review",
  "evaluator_authority_manifest",
  "evaluator_public_reference",
  "evidence_map",
  "final_admission_record",
  "input_manifest",
  "metadata",
  "output_contract",
  "requirement_record",
  "scoring_input_freeze_manifest",
  "verification_command_contract",
]);

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function withoutField(value, field) {
  const { [field]: _ignored, ...rest } = value;
  return rest;
}

function assertEqual(actual, expected, label) {
  if (stableCanonicalJson(actual) !== stableCanonicalJson(expected)) throw new Error(`${label} drift`);
}

function assertDigest(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} drift: expected ${expected}, observed ${actual}`);
}

function git(root, args, options = {}) {
  return execFileSync("git", ["-C", root, ...args], { encoding: options.encoding ?? "utf8", maxBuffer: 32 * 1024 * 1024 });
}

function trackedPaths(root, repositoryRevision, prefix) {
  const output = git(root, ["ls-tree", "-r", "--name-only", repositoryRevision, "--", prefix]);
  return output.split("\n").filter(Boolean).sort(compareAscii);
}

function readTrackedBytes(root, repositoryRevision, path) {
  const bytes = git(root, ["show", `${repositoryRevision}:${path}`], { encoding: "buffer" });
  const worktreePath = resolve(root, path);
  if (!existsSync(worktreePath) || !lstatSync(worktreePath).isFile()) throw new Error(`tracked authority is missing from the worktree: ${path}`);
  const worktreeBytes = readFileSync(worktreePath);
  if (!bytes.equals(worktreeBytes)) throw new Error(`worktree authority bytes differ from ${repositoryRevision}: ${path}`);
  return bytes;
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readTrackedJson(root, repositoryRevision, path) {
  const bytes = readTrackedBytes(root, repositoryRevision, path);
  return { path, bytes, value: parseJson(bytes, path), raw: sha256(bytes) };
}

function visibleInputInventory(root, fixtureRoot) {
  const paths = ["task.md"];
  const visit = (absolute, prefix) => {
    for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((left, right) => compareAscii(left.name, right.name))) {
      const path = `${prefix}/${entry.name}`;
      const target = resolve(absolute, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`fixture input contains a symbolic link: ${path}`);
      if (entry.isDirectory()) visit(target, path);
      else if (entry.isFile()) paths.push(path);
      else throw new Error(`fixture input contains a non-regular entry: ${path}`);
    }
  };
  visit(resolve(root, fixtureRoot, "workspace"), "workspace");
  return paths.sort(compareAscii).map((path) => {
    const bytes = readFileSync(resolve(root, fixtureRoot, path));
    return { path, sha256: sha256(bytes).slice("sha256:".length), bytes: bytes.length };
  });
}

function semanticDigestForArtifact(name, value, fixtureId) {
  const field = {
    requirement_record: "requirement_record_digest",
    output_contract: "output_contract_digest",
    verification_command_contract: "contract_digest",
    metadata: "metadata_digest",
    evaluator_public_reference: "public_metadata_digest",
    evaluator_authority_manifest: "manifest_digest",
    final_admission_record: "admission_digest",
    scoring_input_freeze_manifest: "manifest_digest",
    admission_review: "review_package_digest",
  }[name];
  if (field) return value[field];
  if (name === "input_manifest") return canonicalDigest(value.fixtures?.[fixtureId]);
  return canonicalDigest(value);
}

function validateHistoricalSourceIdentity({ root, fixtureId, identity, evaluatorRevision }) {
  if (identity?.base_git_revision !== evaluatorRevision || !Array.isArray(identity.source_files) || !identity.dependency_graph) throw new Error(`${fixtureId} evaluator source identity is incomplete`);
  const sorted = [...identity.source_files].sort((left, right) => compareAscii(left.path, right.path));
  assertEqual(identity.source_files, sorted, `${fixtureId} evaluator source inventory ordering`);
  assertDigest(identity.source_tree_digest, canonicalDigest(identity.source_files), `${fixtureId} evaluator source tree`);
  for (const entry of identity.source_files) {
    const bytes = git(root, ["show", `${identity.base_git_revision}:${entry.path}`], { encoding: "buffer" });
    if (bytes.length !== entry.bytes) throw new Error(`${fixtureId} historical evaluator source byte count drift at ${entry.path}`);
    assertDigest(entry.sha256, sha256(bytes), `${fixtureId} historical evaluator source identity at ${entry.path}`);
  }
  assertDigest(identity.dependency_graph.graph_digest, canonicalDigest(withoutField(identity.dependency_graph, "graph_digest")), `${fixtureId} evaluator dependency graph`);
}

function validateSourceFreezeCandidate({ root, repositoryRevision, fixtureId, reference, admission }) {
  const path = `${FIXTURE_ROOT}/${fixtureId}/source-freeze-candidate.json`;
  if (!trackedPaths(root, repositoryRevision, path).includes(path)) return null;
  const candidate = readTrackedJson(root, repositoryRevision, path).value;
  assertDigest(candidate.candidate_digest, canonicalDigest(withoutField(candidate, "candidate_digest")), `${fixtureId} source-freeze candidate digest`);
  if (candidate.fixture_id !== fixtureId) throw new Error(`${fixtureId} source-freeze candidate contains a cross-fixture transplant`);
  assertEqual(Object.keys(candidate.public_bindings ?? {}).sort(compareAscii), SOURCE_FREEZE_PUBLIC_BINDINGS, `${fixtureId} source-freeze public binding inventory`);
  for (const [name, binding] of Object.entries(candidate.public_bindings ?? {})) {
    const source = readTrackedJson(root, repositoryRevision, binding.path);
    assertDigest(binding.raw_sha256, source.raw, `${fixtureId} source-freeze ${name} raw identity`);
    assertDigest(binding.semantic_digest, semanticDigestForArtifact(name, source.value, fixtureId), `${fixtureId} source-freeze ${name} semantic identity`);
  }
  assertEqual(candidate.evaluator_private_binding, {
    evaluator_revision: reference.evaluator_revision,
    evaluator_bundle_id: reference.evaluator_bundle_id,
    evaluator_bundle_digest: reference.evaluator_bundle_digest,
    evaluator_byte_count: admission.evaluator_byte_count,
    source_tree_digest: reference.evaluator_source_identity.source_tree_digest,
    dependency_graph_digest: reference.evaluator_source_identity.dependency_graph.graph_digest,
  }, `${fixtureId} source-freeze evaluator binding`);
  return candidate.candidate_digest;
}

function validateDecisionProjection({ fixtureId, resolved, admissionSource, requirementSource, freezeSource, reference }) {
  const decision = resolved.decision;
  if (decision.fixture_id !== fixtureId) throw new Error(`${fixtureId} admission decision contains a cross-fixture transplant`);
  assertEqual(decision.evaluator, {
    evaluator_revision: reference.evaluator_revision,
    evaluator_bundle_id: reference.evaluator_bundle_id,
    evaluator_bundle_digest: reference.evaluator_bundle_digest,
    evaluator_bundle_bytes: admissionSource.value.evaluator_byte_count,
  }, `${fixtureId} admission evaluator identity`);
  assertDigest(decision.evaluator_public_reference_digest, reference.public_metadata_digest, `${fixtureId} admission evaluator reference`);
  assertEqual(decision.frozen_admission_authority, {
    path: admissionSource.path,
    raw_byte_digest: admissionSource.raw,
    semantic_digest: admissionSource.value.admission_digest,
    requirement_authority_digest: computeFrozenAdmissionRequirementAuthorityDigest(admissionSource.value),
  }, `${fixtureId} frozen admission authority`);
  assertEqual(decision.frozen_requirement_record, {
    path: requirementSource.path,
    raw_byte_digest: requirementSource.raw,
    record_digest: requirementSource.value.requirement_record_digest,
    set_digest: requirementSource.value.requirement_set_digest,
  }, `${fixtureId} frozen requirement authority`);
  assertEqual(decision.frozen_scoring_input_manifest, freezeSource ? {
    path: freezeSource.path,
    raw_byte_digest: freezeSource.raw,
    semantic_digest: freezeSource.value.manifest_digest,
  } : null, `${fixtureId} frozen scoring-input authority`);
}

export function discoverAdmittedFixtureIds({ root = DEFAULT_ROOT, repositoryRevision = "HEAD" } = {}) {
  const admitted = new Set();
  for (const path of trackedPaths(root, repositoryRevision, ADMISSION_DECISION_OVERLAY_ROOT)) {
    if (!path.endsWith(".json")) continue;
    const value = readTrackedJson(root, repositoryRevision, path).value;
    if (value.schema_path === "benchmarks/schemas/portfolio-admission-decision.schema.json" && value.decision_status === "admitted") admitted.add(value.fixture_id);
  }
  for (const path of trackedPaths(root, repositoryRevision, FIXTURE_ROOT)) {
    if (!path.endsWith("/final-admission-record.json")) continue;
    const value = readTrackedJson(root, repositoryRevision, path).value;
    if (value.admission_status === "admitted") admitted.add(value.fixture_id);
  }
  return [...admitted].sort(compareAscii);
}

function validateFixture({ root, repositoryRevision, fixtureId, config, catalogSource, policyManifestSource, scoringPolicySource, admissionPolicy }) {
  const catalog = catalogSource.value;
  const scoringPolicy = scoringPolicySource.value;
  const fixtureRoot = `${FIXTURE_ROOT}/${fixtureId}`;
  const paths = {
    input: `${fixtureRoot}/input-manifest.json`,
    admission: `${fixtureRoot}/final-admission-record.json`,
    requirement: `${fixtureRoot}/requirement-record.json`,
    output: `${fixtureRoot}/output-contract.json`,
    reference: `${fixtureRoot}/evaluator-reference.json`,
    manifest: `${fixtureRoot}/evaluator-authority-manifest.json`,
    freeze: `${fixtureRoot}/scoring-input-freeze-manifest.json`,
    command: `${fixtureRoot}/verification-command-contract.json`,
    metadata: `${fixtureRoot}/metadata.json`,
  };
  const sources = Object.fromEntries(Object.entries(paths).map(([name, path]) => [name, readTrackedJson(root, repositoryRevision, path)]));
  const { input, admission, requirement, output, reference, manifest, freeze, command, metadata } = Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, source.value]));
  for (const value of [input, admission, requirement, output, reference, manifest, freeze, command, metadata]) {
    if (value.fixture_id && value.fixture_id !== fixtureId) throw new Error(`${fixtureId} public authority contains a cross-fixture transplant`);
  }

  const catalogFixture = catalog.fixtures.find(({ fixture_id: id }) => id === fixtureId);
  const runtimeFixture = config.fixtures.find(({ id }) => id === fixtureId);
  if (!catalogFixture || !runtimeFixture) throw new Error(`${fixtureId} admitted fixture is missing canonical catalog or runtime registration`);
  for (const field of ["suite", "task_class", "difficulty", "repetitions"]) {
    if (runtimeFixture[field] !== catalogFixture[field] || metadata[field] !== catalogFixture[field]) throw new Error(`${fixtureId} ${field} catalog/runtime identity drift`);
  }
  if (metadata.fixture_id !== fixtureId || metadata.metadata_digest !== canonicalDigest(withoutField(metadata, "metadata_digest"))) throw new Error(`${fixtureId} metadata identity drift`);
  for (const record of [admission, requirement, output]) assertDigest(record.catalog_digest, catalog.catalog_digest, `${fixtureId} catalog identity`);
  for (const record of [requirement, output]) assertDigest(record.policy_manifest_digest, policyManifestSource.value.manifest_digest, `${fixtureId} policy manifest identity`);
  assertDigest(requirement.scoring_policy_digest, scoringPolicy.policy_digest, `${fixtureId} scoring policy identity`);

  const manifestFixture = input.fixtures?.[fixtureId];
  if (!manifestFixture || Object.keys(input.fixtures).length !== 1) throw new Error(`${fixtureId} input manifest fixture identity drift`);
  assertEqual(manifestFixture.files, visibleInputInventory(root, fixtureRoot), `${fixtureId} task/workspace input inventory`);
  assertDigest(runtimeFixture.input_manifest_sha256, sources.input.raw.slice("sha256:".length), `${fixtureId} runtime input identity`);
  assertDigest(admission.input_manifest_digest, sources.input.raw, `${fixtureId} admission input identity`);
  assertDigest(reference.fixture_input_digest, sources.input.raw, `${fixtureId} evaluator input identity`);
  assertDigest(freeze.fixture_input_digest, sources.input.raw, `${fixtureId} scoring freeze input identity`);

  validateFrozenFinalAdmissionRecordContract({ admissionPolicy, admissionRecord: admission });
  assertDigest(admission.admission_digest, computeFinalAdmissionRecordDigest(admission), `${fixtureId} final admission record`);
  validateRequirementRecordContract({ scoringPolicy, requirementRecord: requirement });
  assertDigest(requirement.requirement_record_digest, computeRequirementRecordDigest(requirement), `${fixtureId} requirement record`);
  assertDigest(requirement.requirement_set_digest, computeRequirementSetDigest(requirement), `${fixtureId} requirement set`);
  assertDigest(output.output_contract_digest, computeOutputContractDigest(output), `${fixtureId} output contract`);
  assertDigest(reference.public_metadata_digest, canonicalDigest(withoutField(reference, "public_metadata_digest")), `${fixtureId} evaluator reference`);
  assertDigest(freeze.manifest_digest, computeScoringInputFreezeManifestDigest(freeze), `${fixtureId} scoring freeze`);
  assertEqual(freeze.result_profile, output.result_profile, `${fixtureId} result profile identity`);
  assertDigest(freeze.result_profile.digest, computeResultProfileDigest({ name: freeze.result_profile.name }), `${fixtureId} result profile digest`);
  validateVerificationCommandContract(command, { root });

  const layout = evaluatorAuthorityPathsForFixture(fixtureId);
  const buffers = new Map(layout.bindingPaths.map((path) => [path, readTrackedBytes(root, repositoryRevision, path)]));
  validateEvaluatorAuthorityManifest({ manifest, buffers, evaluatorRevision: reference.evaluator_revision, root, label: `${fixtureId} evaluator authority manifest` });
  validateHistoricalSourceIdentity({ root, fixtureId, identity: reference.evaluator_source_identity, evaluatorRevision: reference.evaluator_revision });
  assertDigest(admission.evaluator_authority_manifest_raw_sha256, sources.manifest.raw, `${fixtureId} admission evaluator manifest raw identity`);
  assertDigest(admission.evaluator_authority_manifest_digest, manifest.manifest_digest, `${fixtureId} admission evaluator manifest identity`);
  assertDigest(reference.evaluator_authority_manifest_raw_sha256, sources.manifest.raw, `${fixtureId} reference evaluator manifest raw identity`);
  assertDigest(reference.evaluator_authority_manifest_digest, manifest.manifest_digest, `${fixtureId} reference evaluator manifest identity`);
  assertEqual(admission.evaluator_source_identity, reference.evaluator_source_identity, `${fixtureId} evaluator source binding`);

  for (const [field, sourceName, semantic] of [
    ["admission_record", "admission", admission.admission_digest],
    ["requirement_record", "requirement", requirement.requirement_record_digest],
    ["output_contract", "output", output.output_contract_digest],
    ["evaluator_public_reference", "reference", reference.public_metadata_digest],
    ["evaluator_authority_manifest", "manifest", manifest.manifest_digest],
    ["verification_command_contract", "command", command.contract_digest],
  ]) {
    const binding = freeze[field];
    const source = sources[sourceName];
    if (binding.path !== source.path || binding.raw_byte_digest !== source.raw) throw new Error(`${fixtureId} scoring freeze ${field} raw identity drift`);
    const semanticField = field === "requirement_record" ? "record_digest" : "semantic_digest";
    assertDigest(binding[semanticField], semantic, `${fixtureId} scoring freeze ${field} semantic identity`);
  }
  const evidenceSource = readTrackedJson(root, repositoryRevision, freeze.evidence_map.path);
  for (const [field, source, semantic] of [
    ["catalog", catalogSource, catalog.catalog_digest],
    ["policy_manifest", policyManifestSource, policyManifestSource.value.manifest_digest],
    ["scoring_policy", scoringPolicySource, scoringPolicy.policy_digest],
    ["evidence_map", evidenceSource, canonicalDigest(evidenceSource.value)],
  ]) {
    const binding = freeze[field];
    if (binding.path !== source.path || binding.raw_byte_digest !== source.raw) throw new Error(`${fixtureId} scoring freeze ${field} raw identity drift`);
    assertDigest(binding.semantic_digest, semantic, `${fixtureId} scoring freeze ${field} semantic identity`);
  }

  const resolved = resolveRepositoryAdmissionDecision({ root, repositoryRevision, fixtureId });
  if (resolved) validateDecisionProjection({ fixtureId, resolved, admissionSource: sources.admission, requirementSource: sources.requirement, freezeSource: sources.freeze, reference });
  const admissionState = resolvePortfolioExecutionAdmission({ root, repositoryRevision, fixture: runtimeFixture });
  if (resolved?.decision.decision_status === "admitted") {
    if (admissionState.effective_admission_status !== "review_evidence_missing" || admissionState.execution_eligible !== false) throw new Error(`${fixtureId} missing external review evidence did not remain fail-closed`);
  } else if (!admissionState.execution_eligible) throw new Error(`${fixtureId} legacy admitted authority is not execution eligible`);

  const candidateDigest = validateSourceFreezeCandidate({ root, repositoryRevision, fixtureId, reference, admission });
  return Object.freeze({
    fixture_id: fixtureId,
    admission_decision_id: resolved?.decision.decision_id ?? null,
    admission_revision: resolved?.decision.decision_revision ?? admission.admission_revision,
    predecessor_count: resolved ? resolved.decision.decision_revision - 1 : 0,
    source_freeze_candidate_digest: candidateDigest,
    public_execution_status: admissionState.effective_admission_status,
  });
}

export function validatePublicAdmittedFixtureInvariance({ root = DEFAULT_ROOT, repositoryRevision = "HEAD" } = {}) {
  repositoryRevision = git(root, ["rev-parse", repositoryRevision]).trim();
  const configSource = readTrackedJson(root, repositoryRevision, CONFIG_PATH);
  const catalogSource = readTrackedJson(root, repositoryRevision, CATALOG_PATH);
  const policyManifestSource = readTrackedJson(root, repositoryRevision, POLICY_MANIFEST_PATH);
  const admissionPolicySource = readTrackedJson(root, repositoryRevision, ADMISSION_POLICY_PATH);
  const scoringPolicySource = readTrackedJson(root, repositoryRevision, SCORING_POLICY_PATH);
  readTrackedJson(root, repositoryRevision, LINEAGE_POLICY_PATH);
  validatePortfolioCatalog(catalogSource.value, { root });
  validatePortfolioPolicyArtifacts({ root });
  const fixtureIds = discoverAdmittedFixtureIds({ root, repositoryRevision });
  if (fixtureIds.length === 0) throw new Error("canonical repository authority contains no admitted fixtures");
  const fixtures = fixtureIds.map((fixtureId) => validateFixture({ root, repositoryRevision, fixtureId, config: configSource.value, catalogSource, policyManifestSource, scoringPolicySource, admissionPolicy: admissionPolicySource.value }));

  const config = { ...configSource.value, _configPath: resolve(root, CONFIG_PATH), _protocolPath: resolve(root, configSource.value.protocol_path) };
  const firstPlan = buildPortfolioPlan({ root, config, repositoryRevision, seed: "issue-249-public-invariance" });
  const secondPlan = buildPortfolioPlan({ root, config, repositoryRevision, seed: "issue-249-public-invariance" });
  assertEqual(firstPlan, secondPlan, "public fail-closed portfolio plan determinism");
  const overlayIds = new Set(fixtures.filter(({ public_execution_status }) => public_execution_status === "review_evidence_missing").map(({ fixture_id }) => fixture_id));
  if (firstPlan.cases.some(({ fixture_id: fixtureId }) => overlayIds.has(fixtureId))) throw new Error("public portfolio plan admitted a fixture without exact external review evidence");
  return Object.freeze({ fixture_ids: fixtureIds, fixtures, public_invariance: "pass", private_semantics: "not_supplied", public_case_count: firstPlan.cases.length });
}

function parseMapping(value, label) {
  const separator = value.indexOf("=");
  if (separator < 1 || separator === value.length - 1) throw new Error(`${label} must use fixture-id=/absolute/path`);
  const fixtureId = value.slice(0, separator);
  const path = value.slice(separator + 1);
  if (!posix.isAbsolute(path)) throw new Error(`${label} path must be absolute`);
  return [fixtureId, path];
}

function parseArgs(argv) {
  const args = { root: DEFAULT_ROOT, repositoryRevision: "HEAD", evidenceManifest: null, privateRoots: {}, privateCaseRoots: {} };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (["--root", "--repository-revision", "--execution-admission-evidence", "--private-root", "--private-case-root"].includes(flag) && !value) throw new Error(`${flag} requires a value`);
    if (flag === "--root") args.root = resolve(value);
    else if (flag === "--repository-revision") args.repositoryRevision = value;
    else if (flag === "--execution-admission-evidence") args.evidenceManifest = resolve(value);
    else if (flag === "--private-root") Object.assign(args.privateRoots, Object.fromEntries([parseMapping(value, flag)]));
    else if (flag === "--private-case-root") Object.assign(args.privateCaseRoots, Object.fromEntries([parseMapping(value, flag)]));
    else throw new Error(`unknown argument: ${flag}`);
    index += 1;
  }
  return args;
}

export function validateActualPrivateAdmittedFixtureSemantics({ root = DEFAULT_ROOT, repositoryRevision = "HEAD", evidenceManifestPath, privateRoots, privateCaseRoots = {} }) {
  if (!evidenceManifestPath || !privateRoots || Object.keys(privateRoots).length === 0) throw new Error("actual-private invariance requires exact external review evidence and at least one private root");
  repositoryRevision = git(root, ["rev-parse", repositoryRevision]).trim();
  const publicResult = validatePublicAdmittedFixtureInvariance({ root, repositoryRevision });
  const discovered = new Set(publicResult.fixture_ids);
  const evidence = readExecutionAdmissionEvidenceManifest(evidenceManifestPath);
  const supplied = new Set([...Object.keys(evidence), ...Object.keys(privateRoots), ...Object.keys(privateCaseRoots)]);
  for (const fixtureId of supplied) if (!discovered.has(fixtureId)) throw new Error(`actual-private invariance contains a non-admitted fixture: ${fixtureId}`);
  for (const fixtureId of discovered) if (!evidence[fixtureId] || !privateRoots[fixtureId]) throw new Error(`${fixtureId} actual-private invariance evidence is partial`);
  for (const fixtureId of supplied) {
    if (!evidence[fixtureId] || !privateRoots[fixtureId]) throw new Error(`${fixtureId} actual-private invariance evidence is partial`);
    const fixture = JSON.parse(readFileSync(resolve(root, CONFIG_PATH), "utf8")).fixtures.find(({ id }) => id === fixtureId);
    const admission = resolvePortfolioExecutionAdmission({ root, repositoryRevision, fixture, externalAdmissionEvidence: evidence[fixtureId] });
    if (!admission.execution_eligible || admission.effective_admission_status !== "admitted") throw new Error(`${fixtureId} exact external review evidence did not resolve admitted authority`);
    const testPath = resolve(root, `scripts/test-ask-benchmark-${fixtureId}.mjs`);
    if (!existsSync(testPath)) throw new Error(`${fixtureId} has no established semantic regression executor`);
    const testArgs = [testPath, "--private-root", privateRoots[fixtureId]];
    if (privateCaseRoots[fixtureId]) testArgs.push("--private-case-root", privateCaseRoots[fixtureId]);
    const result = spawnSync(process.execPath, testArgs, { cwd: root, encoding: "utf8", stdio: "ignore" });
    if (result.status !== 0) throw new Error(`${fixtureId} private semantic regression rejected the authorized evidence (exit ${result.status ?? "signal"})`);
  }
  const configValue = JSON.parse(readFileSync(resolve(root, CONFIG_PATH), "utf8"));
  const config = { ...configValue, _configPath: resolve(root, CONFIG_PATH), _protocolPath: resolve(root, configValue.protocol_path) };
  const firstPlan = buildPortfolioPlan({ root, config, repositoryRevision, seed: "issue-249-private-invariance", executionAdmissionEvidenceByFixture: evidence });
  const secondPlan = buildPortfolioPlan({ root, config, repositoryRevision, seed: "issue-249-private-invariance", executionAdmissionEvidenceByFixture: evidence });
  assertEqual(firstPlan, secondPlan, "actual-private portfolio case identity determinism");
  for (const fixtureId of discovered) if (!firstPlan.cases.some(({ fixture_id: id }) => id === fixtureId)) throw new Error(`${fixtureId} exact admitted authority is missing from the private portfolio plan`);
  return Object.freeze({ fixture_ids: [...supplied].sort(compareAscii), public_invariance: "pass", private_semantics: "pass" });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = args.evidenceManifest || Object.keys(args.privateRoots).length > 0 || Object.keys(args.privateCaseRoots).length > 0
    ? validateActualPrivateAdmittedFixtureSemantics({ root: args.root, repositoryRevision: args.repositoryRevision, evidenceManifestPath: args.evidenceManifest, privateRoots: args.privateRoots, privateCaseRoots: args.privateCaseRoots })
    : validatePublicAdmittedFixtureInvariance({ root: args.root, repositoryRevision: args.repositoryRevision });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
