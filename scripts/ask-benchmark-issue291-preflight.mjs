#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNoSymlinkPathSegments, canonicalDigest, parseJsonRejectDuplicateKeys,
  readStableBytes, writeCanonicalJsonNoReplace,
} from "./content-addressed-store.mjs";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { assembleCalibrationInputPackage } from "./ask-benchmark-calibration-input-package.mjs";
import { CALIBRATION_SOURCE_BINDINGS, assertSuccessorCalibrationConfig } from "./ask-benchmark-calibration-source.mjs";
import { buildPortfolioPlan } from "./ask-benchmark-plan.mjs";
import { materializePortfolio } from "./ask-benchmark-materialize.mjs";
import { sealIssue291ExcludedAdaptiveSelections } from "./ask-benchmark-issue291-selection.mjs";
import { buildSuccessorSourceScope, successorClosed, successorExact, successorFail } from "./ask-benchmark-prompt-successor.mjs";
import { prepareSuccessorFromRepository, readSuccessorImplementationIdentity,
  validateSuccessorFromRepository } from "./ask-benchmark-prompt-successor-repository.mjs";
import { openSuccessorScoringInputs } from "./ask-benchmark-prompt-successor-scoring-inputs.mjs";
import { prepareSuccessorPortfolioSource } from "./ask-benchmark-execution.mjs";
import { normalizePortfolioExecution } from "./ask-benchmark-normalized-results.mjs";
import { openCalibrationExecutionAdmission, reopenCalibrationExecutionAdmission,
  inspectCalibrationExecutionAdmission, inspectCalibrationUnstartedInventories } from "./ask-benchmark-calibration-execution-admission.mjs";
import { runSuccessorExecDiagnostic } from "./ask-benchmark-prompt-successor-host-diagnostic.mjs";
import { openSuccessorMeasuredAuthority, inspectSuccessorMeasuredAuthority,
  successorMeasuredJournalPath } from "./ask-benchmark-prompt-successor-measured-authority.mjs";
import { assertSuccessorNativeExecutable } from "./ask-benchmark-prompt-successor-native.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ROLES = ["current_prompt", "prompt_v2"];
const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

function fail(detail) { successorFail("ISSUE291_PREFLIGHT_INVALID", detail); }
function inside(parent, path) {
  const offset = relative(parent, path);
  return offset === "" || (offset !== ".." && !offset.startsWith(`..${sep}`) && !offset.startsWith("/"));
}
function external(path, label, { exists = true } = {}) {
  if (typeof path !== "string" || resolve(path) !== path) fail(`${label} must be absolute`);
  assertNoSymlinkPathSegments(path, label, { allowMissingLeaf: !exists });
  const repository = realpathSync(ROOT);
  const checked = exists ? realpathSync(path) : resolve(realpathSync(dirname(path)), path.split(sep).at(-1));
  if (inside(repository, checked) || inside(checked, repository)) fail(`${label} overlaps repository`);
  return checked;
}
function readSpec(specPath) {
  external(specPath, "preflight spec");
  const bytes = readStableBytes(specPath, "preflight spec", 1024 * 1024);
  const spec = parseJsonRejectDuplicateKeys(bytes, "preflight spec");
  successorClosed(spec, ["schema_version", "run_root", "runtime_config_path", "agent_bin",
    "private_admission_sources", "seed", "plan_seed"], "preflight spec");
  successorExact(spec.schema_version, "1.0.0", "preflight spec version");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/u.test(spec.seed ?? "")
      || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/u.test(spec.plan_seed ?? "")) fail("pre-result seeds");
  if (!spec.private_admission_sources || typeof spec.private_admission_sources !== "object"
      || Array.isArray(spec.private_admission_sources)) fail("private admission sources");
  successorExact(Object.keys(spec.private_admission_sources).sort(),
    CALIBRATION_SOURCE_BINDINGS.map(([fixture]) => fixture).sort(), "private admission fixture inventory");
  for (const [fixture] of CALIBRATION_SOURCE_BINDINGS) {
    const entry = spec.private_admission_sources[fixture];
    successorClosed(entry, ["privateRoot", "manifestPath", "reviewAuthorityPath",
      "reviewAuthoritySourceDigest", "reviewArchivePath"], `${fixture} private source`);
    for (const key of ["privateRoot", "manifestPath", "reviewAuthorityPath", "reviewArchivePath"])
      external(entry[key], `${fixture} ${key}`);
    if (!/^sha256:[a-f0-9]{64}$/u.test(entry.reviewAuthoritySourceDigest)) fail(`${fixture} review source digest`);
  }
  external(spec.runtime_config_path, "native config");
  external(spec.agent_bin, "native executable");
  external(spec.run_root, "run root", { exists: false });
  return { spec, digest: hash(bytes) };
}
function config() {
  const path = resolve(ROOT, "benchmarks/prompt-successor-execution.config.json");
  const value = parseJsonRejectDuplicateKeys(readStableBytes(path, "public execution config"), "public execution config");
  return { ...value, _kind: "portfolio", _configPath: path, _protocolPath: resolve(ROOT, value.protocol_path) };
}
function nativeRuntime(spec) {
  const bytes = readStableBytes(spec.runtime_config_path, "native runtime config");
  const native = parseJsonRejectDuplicateKeys(bytes, "native runtime config");
  assertBenchmarkSchemaInstance(native, { schemaPath: resolve(ROOT, "benchmarks/schemas/portfolio-runtime-config.schema.json"), label: "Issue 291 native runtime config" });
  const expected = { adapter: "codex", availability: "available", model: "gpt-6-sol",
    reasoning_effort: "medium", case_timeout_ms: 900000, sandbox_policy: "workspace-write",
    permission_policy: "never" };
  for (const [key, value] of Object.entries(expected)) successorExact(native[key], value, `native config.${key}`);
  const binary = external(spec.agent_bin, "native Codex executable");
  const binaryDigest = hash(readStableBytes(binary, "native Codex executable", 512 * 1024 * 1024));
  assertSuccessorNativeExecutable({ path: binary, expectedDigest: binaryDigest, os: process.platform, arch: process.arch });
  const version = execFileSync(binary, ["--version"], { encoding: "utf8", timeout: 15000 }).trim();
  if (!/^codex-cli \d+\.\d+\.\d+$/u.test(version)) fail("native CLI version output");
  successorExact(native.expected_executable_version, version, "native expected version");
  const login = execFileSync(binary, ["login", "status"], { encoding: "utf8", timeout: 15000 }).trim();
  if (!/^Logged in using ChatGPT(?:\b|$)/u.test(login)) fail("ChatGPT subscription login status");
  const privateRoot = external(native.successor_private_evaluator_root, "private deny root");
  if (inside(privateRoot, spec.run_root) || inside(spec.run_root, privateRoot)) {
    fail("measured run and private authority roots overlap");
  }
  for (const [fixture] of CALIBRATION_SOURCE_BINDINGS) {
    const entry = spec.private_admission_sources[fixture];
    if (!inside(privateRoot, realpathSync(entry.privateRoot))
        || !inside(realpathSync(entry.privateRoot), realpathSync(entry.manifestPath))
        || !inside(privateRoot, realpathSync(entry.reviewAuthorityPath))
        || !inside(privateRoot, realpathSync(entry.reviewArchivePath))) fail(`${fixture} private authority is outside deny root`);
  }
  if (!native.environment_allowlist.includes("HOME") || !native.environment_allowlist.includes("PATH")) fail("native environment allowlist");
  return { adapter: "codex", cli_version: version.slice("codex-cli ".length), executable_digest: binaryDigest,
    node_version: process.version, os: process.platform, arch: process.arch, model: native.model,
    provider_model_revision: { status: "unknown", value: null }, reasoning_effort: "medium",
    authentication_mode: "chatgpt_subscription", configuration_digest: hash(bytes),
    sandbox: "workspace-write", approval_policy: "never", agent_network: "disabled",
    provider_network: "provider_only", timeout_ms: 900000 };
}
function contextPath(spec) { return resolve(spec.run_root, "preflight-context.json"); }
function loadContext(spec, specDigest) {
  const value = parseJsonRejectDuplicateKeys(readStableBytes(contextPath(spec), "preflight context"), "preflight context");
  successorClosed(value, ["schema_version", "kind", "spec_digest", "source", "preparation",
    "sources", "normalized_roots", "scoring_manifest_path", "diagnostic_root", "context_digest"], "preflight context");
  const { context_digest: digest, ...body } = value;
  successorExact(canonicalDigest(body), digest, "preflight context digest");
  successorExact(value.spec_digest, specDigest, "preflight spec digest");
  successorExact(value.source, readSuccessorImplementationIdentity(ROOT), "preflight source identity");
  return value;
}

/** No model call, claim, attempt, or measured-result read. An occupied root is never recreated. */
export async function createIssue291Preflight(specPath) {
  const { spec, digest } = readSpec(specPath);
  if (existsSync(spec.run_root)) fail("run namespace already exists; inspect and reconcile it before any new creation");
  const source = readSuccessorImplementationIdentity(ROOT);
  const runtime = nativeRuntime(spec);
  mkdirSync(spec.run_root, { mode: 0o700 });
  const scoringManifestPath = resolve(spec.run_root, "scoring-input-manifest.json");
  await assembleCalibrationInputPackage({ outputPath: scoringManifestPath });
  const scoringManifest = parseJsonRejectDuplicateKeys(readStableBytes(scoringManifestPath, "assembled scoring manifest"), "assembled scoring manifest");
  const preparation = await prepareSuccessorFromRepository({ root: ROOT, runtime, seed: spec.seed,
    changeReason: "Issue #291 result-blind pre-measurement 14 paired blocks; zero automatic retry.",
    scoringInputManifestDigest: scoringManifest.manifest_digest });
  await openSuccessorScoringInputs({ preparation, manifestPath: scoringManifestPath, root: ROOT });
  const portfolioConfig = config();
  assertSuccessorCalibrationConfig(portfolioConfig, { inputManifestDigest: portfolioConfig.fixtures[0].input_manifest_sha256 });
  const plan = buildPortfolioPlan({ root: ROOT, config: portfolioConfig, repositoryRevision: source.revision, seed: spec.plan_seed });
  if (plan.cases.length !== 112) fail("native four-condition plan inventory");
  const planPath = resolve(spec.run_root, "plan.json");
  writeCanonicalJsonNoReplace({ outputPath: planPath, artifact: plan, label: "Issue 291 plan" });
  const materializedPath = resolve(spec.run_root, "materialized");
  materializePortfolio({ root: ROOT, config: portfolioConfig, planPath, outputPath: materializedPath,
    repositoryRevision: source.revision });
  const selectionState = resolve(spec.run_root, "selection-state");
  sealIssue291ExcludedAdaptiveSelections({ root: ROOT, config: portfolioConfig, planPath,
    materializedPath, stateDir: selectionState, repositoryRevision: source.revision, preparation });
  const nativeRuns = resolve(spec.run_root, "native-runs");
  mkdirSync(nativeRuns, { mode: 0o700 });
  const experiment = randomUUID();
  const sources = {};
  const normalizedRoots = {};
  for (const role of ROLES) {
    const execution = { config: portfolioConfig, planPath, materializedPath, selectionState,
      runDir: resolve(nativeRuns, `run-${role}`) };
    const native = prepareSuccessorPortfolioSource({ root: ROOT, ...execution,
      runtimeConfigPath: spec.runtime_config_path, agentBin: spec.agent_bin, preparation });
    if (native.cases.length !== 14 || native.model_calls !== 0 || native.case_attempts_created !== 0) fail(`${role} native preparation`);
    const sourceScope = {
      plan_id: native.plan_id, plan_digest: native.plan_digest, run_instance_id: native.run_instance_id,
      repository_revision: native.repository_revision, runtime_identity_digest: native.runtime_identity_digest,
      materialization_manifest_digest: native.materialization_manifest_digest,
      bindings: preparation.cases.filter(item => item.prompt_role === role).map(target => {
        const item = native.cases.find(entry => entry.fixture_id === target.fixture_id && entry.repetition === target.repetition);
        if (!item) fail(`${role} source binding`);
        return { successor_case_id: target.case_id, source_case_id: item.case_id,
          fixture_input_digest: item.fixture_input_digest, effective_command_digest: native.effective_command_digest,
          environment_snapshot_digest: native.environment_snapshot_digest };
      }),
    };
    const scope = buildSuccessorSourceScope({ preparation, promptRole: role, runInstanceId: experiment, source: sourceScope });
    sources[role] = { scope, expectedScopeDigest: scope.scope_digest, execution,
      runtimeConfigPath: spec.runtime_config_path, agentBin: spec.agent_bin };
    const outputPath = resolve(spec.run_root, `normalized-${role}`);
    normalizePortfolioExecution({ root: ROOT, ...execution, outputPath });
    normalizedRoots[role] = outputPath;
  }
  const body = { schema_version: "1.0.0", kind: "issue291_preflight_context", spec_digest: digest,
    source, preparation, sources, normalized_roots: normalizedRoots,
    scoring_manifest_path: scoringManifestPath, diagnostic_root: resolve(spec.run_root, "host-diagnostic") };
  const context = { ...body, context_digest: canonicalDigest(body) };
  writeCanonicalJsonNoReplace({ outputPath: contextPath(spec), artifact: context, label: "Issue 291 preflight context" });
  return { source, preparation_digest: preparation.preparation_digest,
    scoring_manifest_digest: scoringManifest.manifest_digest, run_instance_id: experiment,
    context_digest: context.context_digest, measured_trials: 0, measured_claims: 0, model_calls: 0 };
}

/** The sole model-capable operation here is the separate one-shot host diagnostic. */
export async function sealIssue291Preflight(specPath) {
  const { spec, digest } = readSpec(specPath);
  const context = loadContext(spec, digest);
  await validateSuccessorFromRepository(context.preparation, { root: ROOT });
  const scoringInputs = await openSuccessorScoringInputs({ preparation: context.preparation,
    manifestPath: context.scoring_manifest_path, root: ROOT });
  const normalizedRoots = context.normalized_roots;
  const privateSources = spec.private_admission_sources;
  const admission = openCalibrationExecutionAdmission({ root: ROOT, preparation: context.preparation,
    sources: context.sources, scoringInputs, admissionSourcesByFixture: privateSources, normalizedRoots });
  const admissionEvidence = inspectCalibrationExecutionAdmission(admission);
  const hostIsolationProbePath = privateSources[CALIBRATION_SOURCE_BINDINGS[0][0]].manifestPath;
  if (!existsSync(context.diagnostic_root)) mkdirSync(context.diagnostic_root, { mode: 0o700 });
  const diagnostic = await runSuccessorExecDiagnostic({ root: ROOT, preparation: context.preparation,
    sources: context.sources, scoringInputs, calibrationAdmission: admission, normalizedRoots,
    hostIsolationProbePath, diagnosticRoot: context.diagnostic_root });
  const authority = await openSuccessorMeasuredAuthority({ root: ROOT, preparation: context.preparation,
    sources: context.sources, scoringInputs, calibrationAdmission: admission, normalizedRoots,
    hostIsolationProbePath, hostExecutionDiagnosticRoot: context.diagnostic_root });
  const freeze = inspectSuccessorMeasuredAuthority(authority);
  inspectCalibrationUnstartedInventories({ sources: context.sources, normalizedRoots });
  if (existsSync(successorMeasuredJournalPath(authority, {
    preparation: context.preparation, sources: context.sources,
  }))) fail("measured journal appeared before trial 1");
  return { source: context.source, run_instance_id: context.sources.current_prompt.scope.run_instance_id,
    preparation_digest: context.preparation.preparation_digest,
    scoring_manifest_digest: context.preparation.scoring_input_manifest_digest,
    calibration_admission_digest: admissionEvidence.admission_digest,
    diagnostic_result_digest: diagnostic.result_digest,
    diagnostic_exec_invocations: diagnostic.diagnostic_exec_invocations,
    diagnostic_model_calls: diagnostic.diagnostic_model_calls,
    authority_freeze_digest: freeze.authority_record_digest,
    journal_path_digest: freeze.journal_path_digest,
    measured_trials: 0, measured_claims: 0, measured_model_calls: 0,
    measured_result_reads: 0, measured_retries: 0 };
}

/** Reopen only a previously sealed freeze. This returns the existing opaque handle for a later, separately authorized trial. */
export async function reopenIssue291ReadyContext(specPath) {
  const { spec, digest } = readSpec(specPath);
  const context = loadContext(spec, digest);
  const freezePath = resolve(spec.run_root, "native-runs",
    `.ask-successor-issue291-${context.sources.current_prompt.scope.run_instance_id}.authority.json`);
  const freeze = parseJsonRejectDuplicateKeys(readStableBytes(freezePath, "measured authority freeze"), "measured authority freeze");
  const admissionDigest = freeze?.evidence?.calibration_execution_admission?.admission_digest;
  if (!/^sha256:[a-f0-9]{64}$/u.test(admissionDigest ?? "")) fail("sealed calibration admission digest");
  const scoringInputs = await openSuccessorScoringInputs({ preparation: context.preparation,
    manifestPath: context.scoring_manifest_path, root: ROOT });
  const admission = reopenCalibrationExecutionAdmission({ root: ROOT, preparation: context.preparation,
    sources: context.sources, scoringInputs, admissionSourcesByFixture: spec.private_admission_sources,
    normalizedRoots: context.normalized_roots }, admissionDigest);
  const authority = await openSuccessorMeasuredAuthority({ root: ROOT, preparation: context.preparation,
    sources: context.sources, scoringInputs, calibrationAdmission: admission,
    normalizedRoots: context.normalized_roots,
    hostIsolationProbePath: spec.private_admission_sources[CALIBRATION_SOURCE_BINDINGS[0][0]].manifestPath,
    hostExecutionDiagnosticRoot: context.diagnostic_root });
  return { authority, preparation: context.preparation, sources: context.sources, root: ROOT };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, flag, specPath] = process.argv.slice(2);
  if (!["create", "seal"].includes(mode) || flag !== "--spec" || !specPath || process.argv.length !== 5) {
    process.stderr.write("usage: node scripts/ask-benchmark-issue291-preflight.mjs <create|seal> --spec <absolute-external-spec.json>\n");
    process.exitCode = 2;
  } else {
    (mode === "create" ? createIssue291Preflight(specPath) : sealIssue291Preflight(specPath))
      .then(value => process.stdout.write(`${JSON.stringify(value)}\n`))
      .catch(error => { process.stderr.write(`${error.code ?? error.name}: ${error.message}\n`); process.exitCode = 1; });
  }
}
