#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { assertNoAutomationSecrets } from "./ask-autonomous-secret-scan.mjs";

export const MAX_CHANGED_FILES = 60;
export const MAX_CHANGED_LINES = 8_000;
export const GUARD_SCHEMA_VERSION = "2.0.0";

const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const DISALLOWED_EXACT_PATHS = new Set([
  ".github/CODEOWNERS",
  ".github/workflows/ask-autonomous-development.yml",
  "scripts/adapter-runtime-bundle.mjs",
  "scripts/test-ask-autonomous-development.mjs",
  "scripts/test-ask-benchmark-design-admission.mjs",
  "scripts/test-ask-benchmark-design-review.mjs",
  "scripts/test-ask-benchmark-evaluator-boundary.mjs",
  "scripts/test-ask-benchmark-execution.mjs",
  "scripts/test-ask-benchmark-normalized-results.mjs",
  "scripts/test-ask-benchmark-portfolio-catalog.mjs",
  "scripts/test-ask-benchmark-portfolio-policy.mjs",
  "scripts/test-ask-benchmark.mjs",
  "scripts/test-validate-repo.mjs",
  "scripts/validate-repo.mjs",
]);
const DISALLOWED_PREFIXES = [
  ".github/ask-automation/",
  ".github/workflows/",
  "benchmarks/results/",
  "benchmarks/private/",
  "benchmarks/evaluators/",
  "scripts/ask-autonomous-",
  "secrets/",
];
const SENSITIVE_PATH_PATTERN = /(?:^|\/)(?:\.env(?:\.|$)|[^/]+\.(?:pem|key|p12|pfx|jks|keystore|crt|cer))$/iu;
const PRIVATE_EVALUATOR_PATTERN = /(?:^|\/)(?:private[-_]?evaluator|evaluator[-_]?private)(?:\/|$)/iu;
const UNEXECUTED_TEST_PATTERN = /^\s*(?:not run|not executed|planned|pending|skipped)\b/iu;

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort(compareAscii).map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function sha256Bytes(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function digestObject(value, omittedField = null) {
  const copy = omittedField === null ? value : Object.fromEntries(Object.entries(value).filter(([key]) => key !== omittedField));
  return sha256Bytes(Buffer.from(JSON.stringify(canonicalize(copy))));
}

function requireSha(value, field) {
  if (!SHA_PATTERN.test(value ?? "")) throw new Error(`${field} must be an exact 40-character commit SHA`);
}

function requireDigest(value, field) {
  if (!DIGEST_PATTERN.test(value ?? "")) throw new Error(`${field} must be a SHA-256 digest`);
}

function runGit(repository, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", ["-C", repository, ...args], { encoding: null });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${Buffer.concat([result.stderr ?? Buffer.alloc(0), result.stdout ?? Buffer.alloc(0)]).toString("utf8").trim()}`);
  }
  return result;
}

function textOutput(result, stream = "stdout") {
  return (result[stream] ?? Buffer.alloc(0)).toString("utf8");
}

function splitLines(value) {
  return value.split(/\r?\n/u).filter(Boolean);
}

export function isDisallowedPath(path) {
  if (DISALLOWED_EXACT_PATHS.has(path)) return true;
  if (DISALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  if (SENSITIVE_PATH_PATTERN.test(path)) return true;
  if (PRIVATE_EVALUATOR_PATTERN.test(path)) return true;
  return false;
}

export function validateChangedPaths(paths, { maximumFiles = MAX_CHANGED_FILES } = {}) {
  const errors = [];
  const uniquePaths = [...new Set(paths)].sort(compareAscii);
  if (uniquePaths.length > maximumFiles) errors.push(`changed file count ${uniquePaths.length} exceeds limit ${maximumFiles}`);
  for (const path of uniquePaths) {
    if (path.startsWith("/") || path.split("/").includes("..") || path.includes("\\")) errors.push(`changed path is not a normalized repository-relative path: ${path}`);
    if (isDisallowedPath(path)) errors.push(`automation may not modify protected path: ${path}`);
  }
  return errors;
}

function requireString(value, field, errors, { nullable = false, minimum = 1 } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || value.trim().length < minimum) errors.push(`${field} must be ${nullable ? "null or " : ""}a non-empty string`);
}

export function validateCodexResult(result, context, changedPaths) {
  const errors = [];
  const allowedActions = new Set(["create_pr", "update_pr", "review_only", "no_change", "blocked"]);
  const allowedVerdicts = new Set(["not_applicable", "approve", "request_changes", "comment"]);
  if (!result || typeof result !== "object" || Array.isArray(result)) return ["Codex result must be an object"];
  if (!allowedActions.has(result.action)) errors.push(`unsupported Codex action: ${result.action}`);
  if (!allowedVerdicts.has(result.review_verdict)) errors.push(`unsupported review verdict: ${result.review_verdict}`);
  requireString(result.summary, "summary", errors);
  requireString(result.rationale, "rationale", errors);
  if (!Array.isArray(result.tests_run) || result.tests_run.some((value) => typeof value !== "string")) errors.push("tests_run must be a string array");
  if (!Array.isArray(result.risks) || result.risks.some((value) => typeof value !== "string")) errors.push("risks must be a string array");
  if (!Array.isArray(result.changed_files_expected) || result.changed_files_expected.some((value) => typeof value !== "string")) errors.push("changed_files_expected must be a string array");
  if ((result.target_issue_number ?? null) !== (context.target_issue_number ?? null)) errors.push("target_issue_number does not match selected context");
  if ((result.target_pr_number ?? null) !== (context.target_pr_number ?? null)) errors.push("target_pr_number does not match selected context");

  const hasChanges = changedPaths.length > 0;
  if (hasChanges && context.mode === "advance_issue" && result.action !== "create_pr") errors.push("issue advancement with repository changes must create a draft PR");
  if (hasChanges && context.mode === "maintain_pr" && result.action !== "update_pr") errors.push("PR maintenance with repository changes must update the selected PR");
  if (!hasChanges && ["create_pr", "update_pr"].includes(result.action)) errors.push("create_pr/update_pr requires repository changes");
  if (hasChanges && ["review_only", "no_change", "blocked"].includes(result.action)) errors.push(`${result.action} may not accompany repository changes`);
  if (hasChanges && Array.isArray(result.tests_run)) {
    if (result.tests_run.length === 0) errors.push("repository changes require at least one validation command actually run by Codex");
    for (const test of result.tests_run) if (UNEXECUTED_TEST_PATTERN.test(test)) errors.push(`tests_run may not represent an unexecuted or deferred check: ${test}`);
  }
  if (result.action === "create_pr") {
    requireString(result.pr_title, "pr_title", errors);
    requireString(result.pr_body, "pr_body", errors);
  }
  if (result.action === "review_only") requireString(result.review_comment, "review_comment", errors);
  if (result.review_verdict !== "not_applicable") requireString(result.review_comment, "review_comment", errors);
  if (result.issue_comment !== null) requireString(result.issue_comment, "issue_comment", errors, { nullable: true });

  const expectedInput = Array.isArray(result.changed_files_expected) ? result.changed_files_expected : [];
  const expected = [...new Set(expectedInput)].sort(compareAscii);
  const actual = [...new Set(changedPaths)].sort(compareAscii);
  if (JSON.stringify(expectedInput) !== JSON.stringify(expected)) errors.push("changed_files_expected must be unique and ordered by ASCII code point");
  if (hasChanges && JSON.stringify(expected) !== JSON.stringify(actual)) errors.push("changed_files_expected must exactly match the actual changed path set");
  return errors;
}

function matchesType(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  return typeof value === type;
}

function validateSchemaNode(value, schema, path, errors) {
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (types.length > 0 && !types.some((type) => matchesType(value, type))) {
    errors.push(`${path} does not match Schema type`);
    return;
  }
  if (schema.enum && !schema.enum.some((item) => Object.is(item, value))) errors.push(`${path} is not in the Schema enum`);
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path} is shorter than Schema minLength`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path} exceeds Schema maxLength`);
    if (schema.pattern && !(new RegExp(schema.pattern, "u")).test(value)) errors.push(`${path} does not match Schema pattern`);
  }
  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) errors.push(`${path} is below Schema minimum`);
  if (Array.isArray(value)) {
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path} exceeds Schema maxItems`);
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) errors.push(`${path} violates Schema uniqueItems`);
    if (schema.items) value.forEach((item, index) => validateSchemaNode(item, schema.items, `${path}[${index}]`, errors));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const required of schema.required ?? []) if (!(required in value)) errors.push(`${path}.${required} is required by Schema`);
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!(key in (schema.properties ?? {}))) errors.push(`${path}.${key} is not allowed by Schema`);
    }
    for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
      if (key in value) validateSchemaNode(value[key], childSchema, `${path}.${key}`, errors);
    }
  }
}

export function validateResultSchema(result, schema) {
  const errors = [];
  validateSchemaNode(result, schema, "result", errors);
  return errors;
}

export function computeContextDigest(context) {
  return digestObject(context, "context_digest");
}

export function assertContextIdentity(context, expected = {}) {
  for (const field of ["control_sha", "workflow_sha", "target_commit_sha", "base_main_sha"]) requireSha(context[field], `context.${field}`);
  if (context.control_sha !== context.workflow_sha) throw new Error("context control SHA and workflow SHA must be identical");
  if (typeof context.target_branch !== "string" || context.target_branch.length === 0) throw new Error("context.target_branch is required");
  if (context.mode === "advance_issue" && (context.target_branch !== "main" || context.target_commit_sha !== context.base_main_sha)) {
    throw new Error("Issue target must bind target branch main and the same exact target/base main SHA");
  }
  if (context.mode === "maintain_pr" && context.target_commit_sha !== context.pull_request?.head?.sha) throw new Error("PR target SHA does not match selected PR HEAD");
  if (context.context_digest !== computeContextDigest(context)) throw new Error("context digest drift detected");
  for (const [field, value] of Object.entries(expected)) {
    if (value !== undefined && value !== null && String(context[field]) !== String(value)) throw new Error(`context ${field} does not match expected immutable identity`);
  }
}

export function createRepositoryPatch(repository) {
  runGit(repository, ["add", "-N", "--", "."]);
  return runGit(repository, ["diff", "--binary", "--full-index", "--", "."]).stdout;
}

function collectChange(repository) {
  runGit(repository, ["add", "-N", "--", "."]);
  const nameStatus = textOutput(runGit(repository, ["diff", "--name-status", "--", "."]));
  const paths = splitLines(nameStatus).flatMap((line) => {
    const fields = line.split("\t");
    const status = fields.shift() ?? "";
    if (status.startsWith("R") || status.startsWith("C")) return fields.slice(-2);
    return fields.slice(-1);
  });
  const numstat = textOutput(runGit(repository, ["diff", "--numstat", "--", "."]));
  let additions = 0;
  let deletions = 0;
  const binaryPaths = [];
  for (const line of splitLines(numstat)) {
    const [added, deleted, path] = line.split("\t");
    if (added === "-" || deleted === "-") binaryPaths.push(path);
    else {
      additions += Number(added);
      deletions += Number(deleted);
    }
  }
  const summary = textOutput(runGit(repository, ["diff", "--summary", "--", "."]));
  const symlinkPaths = splitLines(summary).filter((line) => /mode 120000/u.test(line)).map((line) => line.trim());
  return { paths: [...new Set(paths)].sort(compareAscii), additions, deletions, changedLines: additions + deletions, binaryPaths, symlinkPaths };
}

export function validateAutomationRun({ repository, context, result, expectedPatch = null }) {
  const change = collectChange(repository);
  const errors = [...validateChangedPaths(change.paths), ...validateCodexResult(result, context, change.paths)];
  if (change.changedLines > MAX_CHANGED_LINES) errors.push(`changed line count ${change.changedLines} exceeds limit ${MAX_CHANGED_LINES}`);
  if (change.binaryPaths.length > 0) errors.push(`binary changes are prohibited: ${change.binaryPaths.join(", ")}`);
  if (change.symlinkPaths.length > 0) errors.push(`symlink changes are prohibited: ${change.symlinkPaths.join(", ")}`);
  const whitespace = runGit(repository, ["diff", "--check"], { allowFailure: true });
  if (whitespace.status !== 0) errors.push(`git diff --check failed: ${textOutput(whitespace, "stderr").trim() || textOutput(whitespace).trim()}`);
  const patch = createRepositoryPatch(repository);
  if (expectedPatch !== null && !patch.equals(expectedPatch)) errors.push("working tree patch does not match the original raw patch");
  assertNoAutomationSecrets({ patch, result });
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return {
    action: result.action,
    changed_files: change.paths,
    additions: change.additions,
    deletions: change.deletions,
    changed_lines: change.changedLines,
  };
}

function rawPaths(directory) {
  return {
    context: resolve(directory, "context.json"),
    result: resolve(directory, "result.json"),
    patch: resolve(directory, "change.patch"),
    manifest: resolve(directory, "raw-manifest.json"),
  };
}

export function createRawArtifact({ repository, contextPath, resultPath, schemaPath, outputDirectory, runId, runAttempt }) {
  const contextBytes = readFileSync(contextPath);
  const resultBytes = readFileSync(resultPath);
  const context = JSON.parse(contextBytes.toString("utf8"));
  const result = JSON.parse(resultBytes.toString("utf8"));
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  assertContextIdentity(context, { generated_for_run: runId });
  const schemaErrors = validateResultSchema(result, schema);
  if (schemaErrors.length > 0) throw new Error(schemaErrors.join("\n"));
  const patch = createRepositoryPatch(repository);
  const change = validateAutomationRun({ repository, context, result, expectedPatch: patch });
  mkdirSync(outputDirectory, { recursive: true });
  const paths = rawPaths(outputDirectory);
  writeFileSync(paths.context, contextBytes);
  writeFileSync(paths.result, resultBytes);
  writeFileSync(paths.patch, patch);
  const manifest = {
    schema_version: GUARD_SCHEMA_VERSION,
    artifact_kind: "ask_autonomous_raw",
    run_id: String(runId),
    run_attempt: String(runAttempt),
    control_sha: context.control_sha,
    workflow_sha: context.workflow_sha,
    target_mode: context.mode,
    target_branch: context.target_branch,
    target_commit_sha: context.target_commit_sha,
    base_main_sha: context.base_main_sha,
    context_digest: context.context_digest,
    context_sha256: sha256Bytes(contextBytes),
    result_sha256: sha256Bytes(resultBytes),
    patch_sha256: sha256Bytes(patch),
    changed_files: change.changed_files,
    additions: change.additions,
    deletions: change.deletions,
    changed_lines: change.changed_lines,
  };
  manifest.artifact_digest = digestObject(manifest);
  writeFileSync(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, change, paths };
}

export function verifyRawArtifact({ directory, schemaPath, expected = {} }) {
  const paths = rawPaths(directory);
  const contextBytes = readFileSync(paths.context);
  const resultBytes = readFileSync(paths.result);
  const patch = readFileSync(paths.patch);
  const manifest = JSON.parse(readFileSync(paths.manifest, "utf8"));
  const context = JSON.parse(contextBytes.toString("utf8"));
  const result = JSON.parse(resultBytes.toString("utf8"));
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  requireDigest(manifest.artifact_digest, "manifest.artifact_digest");
  if (manifest.artifact_digest !== digestObject(manifest, "artifact_digest")) throw new Error("raw artifact manifest digest drift detected");
  for (const [field, bytes] of [["context_sha256", contextBytes], ["result_sha256", resultBytes], ["patch_sha256", patch]]) {
    if (manifest[field] !== sha256Bytes(bytes)) throw new Error(`${field.replace("_sha256", "")} digest drift detected`);
  }
  assertContextIdentity(context, {
    control_sha: expected.controlSha,
    workflow_sha: expected.workflowSha,
    target_commit_sha: expected.targetCommitSha,
    generated_for_run: expected.runId,
  });
  const expectedFields = {
    run_id: expected.runId,
    run_attempt: expected.runAttempt,
    control_sha: context.control_sha,
    workflow_sha: context.workflow_sha,
    target_mode: context.mode,
    target_branch: context.target_branch,
    target_commit_sha: context.target_commit_sha,
    base_main_sha: context.base_main_sha,
    context_digest: context.context_digest,
  };
  for (const [field, value] of Object.entries(expectedFields)) {
    if (value !== undefined && value !== null && String(manifest[field]) !== String(value)) throw new Error(`raw artifact ${field} binding mismatch`);
  }
  const schemaErrors = validateResultSchema(result, schema);
  if (schemaErrors.length > 0) throw new Error(schemaErrors.join("\n"));
  assertNoAutomationSecrets({ patch, result });
  return { context, result, patch, manifest, paths };
}

export function buildFinalGuard({ raw, attestation, change, publicationRevalidation = null }) {
  if (!attestation || attestation.artifact_kind !== "ask_autonomous_validation_attestation") throw new Error("publisher requires a trusted validation attestation");
  if (attestation.attestation_digest !== digestObject(attestation, "attestation_digest")) throw new Error("validation attestation digest drift detected");
  for (const field of ["changed_files", "additions", "deletions", "changed_lines"]) {
    if (JSON.stringify(raw.manifest[field]) !== JSON.stringify(change[field])) throw new Error(`final guard ${field} does not match the original raw patch`);
  }
  const guard = {
    schema_version: GUARD_SCHEMA_VERSION,
    control_sha: raw.context.control_sha,
    workflow_sha: raw.context.workflow_sha,
    target_branch: raw.context.target_branch,
    target_commit_sha: raw.context.target_commit_sha,
    base_main_sha: raw.context.base_main_sha,
    context_sha256: raw.manifest.context_sha256,
    result_sha256: raw.manifest.result_sha256,
    patch_sha256: raw.manifest.patch_sha256,
    changed_files: change.changed_files,
    additions: change.additions,
    deletions: change.deletions,
    changed_lines: change.changed_lines,
    validation_run_id: attestation.run_id,
    validation_run_attempt: attestation.run_attempt,
    validation_status: attestation.validation_job_result,
    validation_attestation_digest: attestation.attestation_digest,
    validation_execution_digest: attestation.execution_digest,
    validation_container_image_digest: attestation.container_image_digest,
    validation_command_plan_sha256: attestation.command_plan_sha256,
    publication_revalidation_digest: publicationRevalidation?.revalidation_digest ?? null,
  };
  guard.guard_digest = digestObject(guard);
  return guard;
}

function parseArgs(argv) {
  const args = { command: argv.shift(), repository: null, context: null, result: null, schema: null, outputDirectory: null, rawDirectory: null, runId: null, runAttempt: null };
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag === "--repository") args.repository = resolve(argv.shift());
    else if (flag === "--context") args.context = resolve(argv.shift());
    else if (flag === "--result") args.result = resolve(argv.shift());
    else if (flag === "--schema") args.schema = resolve(argv.shift());
    else if (flag === "--output-directory") args.outputDirectory = resolve(argv.shift());
    else if (flag === "--raw-directory") args.rawDirectory = resolve(argv.shift());
    else if (flag === "--run-id") args.runId = argv.shift();
    else if (flag === "--run-attempt") args.runAttempt = argv.shift();
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return args;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (!args.schema || !args.runId || !args.runAttempt) throw new Error("--schema, --run-id, and --run-attempt are required");
    if (args.command === "raw") {
      if (!args.repository || !args.context || !args.result || !args.outputDirectory) throw new Error("raw requires --repository, --context, --result, and --output-directory");
      const created = createRawArtifact({ repository: args.repository, contextPath: args.context, resultPath: args.result, schemaPath: args.schema, outputDirectory: args.outputDirectory, runId: args.runId, runAttempt: args.runAttempt });
      console.log(`ASK raw artifact created: files=${created.change.changed_files.length}, lines=${created.change.changed_lines}`);
    } else if (args.command === "preflight") {
      if (!args.repository || !args.rawDirectory) throw new Error("preflight requires --repository and --raw-directory");
      const raw = verifyRawArtifact({ directory: args.rawDirectory, schemaPath: args.schema, expected: { runId: args.runId, runAttempt: args.runAttempt } });
      const change = validateAutomationRun({ repository: args.repository, context: raw.context, result: raw.result, expectedPatch: raw.patch });
      console.log(`ASK automation preflight passed: files=${change.changed_files.length}, lines=${change.changed_lines}`);
    } else {
      throw new Error("command must be raw or preflight");
    }
  } catch (error) {
    console.error(`ASK automation guard failed: ${error.message}`);
    process.exitCode = 1;
  }
}
