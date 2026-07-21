#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { digestObject, sha256Bytes, verifyRawArtifact } from "./ask-autonomous-guard.mjs";
import { commandDefinitionDigest, loadValidationPlan } from "./ask-autonomous-validate-execute.mjs";

const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/u;

function requireEqual(actual, expected, field) {
  if (String(actual) !== String(expected)) throw new Error(`${field} binding mismatch`);
}

export function verifyExecutionRecord({ record, raw, plan, planDigest, executionDirectory, runId, runAttempt, validationJobResult }) {
  if (validationJobResult !== "success") throw new Error("validate_execute GitHub job conclusion is not success");
  if (record.execution_digest !== digestObject(record, "execution_digest")) throw new Error("validation execution record digest drift detected");
  const executionStarted = Date.parse(record.started_at);
  const executionFinished = Date.parse(record.finished_at);
  if (!Number.isFinite(executionStarted) || !Number.isFinite(executionFinished) || executionStarted > executionFinished) throw new Error("validation execution timestamps are invalid");
  const expected = {
    artifact_kind: "ask_autonomous_validation_execution",
    validation_job: "validate_execute",
    run_id: String(runId),
    run_attempt: String(runAttempt),
    control_sha: raw.context.control_sha,
    workflow_sha: raw.context.workflow_sha,
    target_commit_sha: raw.context.target_commit_sha,
    base_main_sha: raw.context.base_main_sha,
    raw_artifact_digest: raw.manifest.artifact_digest,
    container_image: plan.container.image,
    container_image_digest: plan.container.image_digest,
    command_plan_sha256: planDigest,
    status: "success",
  };
  for (const [field, value] of Object.entries(expected)) requireEqual(record[field], value, `execution.${field}`);
  if (!Array.isArray(record.commands) || record.commands.length !== plan.commands.length) throw new Error("validation execution command count mismatch");
  for (let index = 0; index < plan.commands.length; index += 1) {
    const planned = plan.commands[index];
    const observed = record.commands[index];
    requireEqual(observed.id, planned.id, `execution.commands[${index}].id`);
    requireEqual(observed.definition_sha256, commandDefinitionDigest(planned), `execution.commands[${index}].definition_sha256`);
    requireEqual(observed.container_image_digest, plan.container.image_digest, `execution.commands[${index}].container_image_digest`);
    requireEqual(observed.exit_status, 0, `execution.commands[${index}].exit_status`);
    const commandStarted = Date.parse(observed.started_at);
    const commandFinished = Date.parse(observed.finished_at);
    if (!Number.isFinite(commandStarted) || !Number.isFinite(commandFinished) || commandStarted > commandFinished) throw new Error(`execution.commands[${index}] timestamps are invalid`);
    for (const field of ["definition_sha256", "stdout_sha256", "stderr_sha256", "safe_log_sha256", "container_image_digest"]) {
      if (!SHA256_DIGEST.test(observed[field] ?? "")) throw new Error(`execution.commands[${index}].${field} is not a SHA-256 digest`);
    }
    requireEqual(observed.safe_log_path, `safe-logs/${planned.id}.log`, `execution.commands[${index}].safe_log_path`);
    const logPath = resolve(executionDirectory, observed.safe_log_path ?? "");
    if (!logPath.startsWith(`${resolve(executionDirectory)}/safe-logs/`)) throw new Error("safe log path escaped the execution artifact");
    requireEqual(sha256Bytes(readFileSync(logPath)), observed.safe_log_sha256, `execution.commands[${index}].safe_log_sha256`);
  }
}

export function buildValidationAttestation({ raw, record, plan, planDigest, runId, runAttempt, validationJobResult }) {
  const attestation = {
    schema_version: "1.0.0",
    artifact_kind: "ask_autonomous_validation_attestation",
    attestation_job: "attest_validation",
    validation_job: "validate_execute",
    validation_job_result: validationJobResult,
    run_id: String(runId),
    run_attempt: String(runAttempt),
    control_sha: raw.context.control_sha,
    workflow_sha: raw.context.workflow_sha,
    target_commit_sha: raw.context.target_commit_sha,
    base_main_sha: raw.context.base_main_sha,
    raw_artifact_digest: raw.manifest.artifact_digest,
    context_sha256: raw.manifest.context_sha256,
    result_sha256: raw.manifest.result_sha256,
    patch_sha256: raw.manifest.patch_sha256,
    container_image: plan.container.image,
    container_image_digest: plan.container.image_digest,
    command_plan_sha256: planDigest,
    execution_digest: record.execution_digest,
    command_evidence: record.commands.map((command) => ({
      id: command.id,
      definition_sha256: command.definition_sha256,
      exit_status: command.exit_status,
      stdout_sha256: command.stdout_sha256,
      stderr_sha256: command.stderr_sha256,
      safe_log_sha256: command.safe_log_sha256,
      container_image_digest: command.container_image_digest,
    })),
  };
  attestation.attestation_digest = digestObject(attestation);
  return attestation;
}

export function verifyValidationAttestation({ attestation, raw, plan, planDigest, runId, runAttempt, validationJobResult }) {
  if (attestation.attestation_digest !== digestObject(attestation, "attestation_digest")) throw new Error("validation attestation digest drift detected");
  if (!SHA256_DIGEST.test(attestation.execution_digest ?? "")) throw new Error("attestation execution digest is invalid");
  const expected = {
    artifact_kind: "ask_autonomous_validation_attestation",
    attestation_job: "attest_validation",
    validation_job: "validate_execute",
    validation_job_result: "success",
    run_id: String(runId),
    run_attempt: String(runAttempt),
    control_sha: raw.context.control_sha,
    workflow_sha: raw.context.workflow_sha,
    target_commit_sha: raw.context.target_commit_sha,
    base_main_sha: raw.context.base_main_sha,
    raw_artifact_digest: raw.manifest.artifact_digest,
    context_sha256: raw.manifest.context_sha256,
    result_sha256: raw.manifest.result_sha256,
    patch_sha256: raw.manifest.patch_sha256,
    container_image: plan.container.image,
    container_image_digest: plan.container.image_digest,
    command_plan_sha256: planDigest,
  };
  if (validationJobResult !== "success") throw new Error("publisher did not observe validate_execute success");
  for (const [field, value] of Object.entries(expected)) requireEqual(attestation[field], value, `attestation.${field}`);
  if (!Array.isArray(attestation.command_evidence) || attestation.command_evidence.length !== plan.commands.length) throw new Error("attestation command evidence count mismatch");
  for (let index = 0; index < plan.commands.length; index += 1) {
    requireEqual(attestation.command_evidence[index].id, plan.commands[index].id, `attestation.command_evidence[${index}].id`);
    requireEqual(attestation.command_evidence[index].definition_sha256, commandDefinitionDigest(plan.commands[index]), `attestation.command_evidence[${index}].definition_sha256`);
    requireEqual(attestation.command_evidence[index].exit_status, 0, `attestation.command_evidence[${index}].exit_status`);
    requireEqual(attestation.command_evidence[index].container_image_digest, plan.container.image_digest, `attestation.command_evidence[${index}].container_image_digest`);
    for (const field of ["definition_sha256", "stdout_sha256", "stderr_sha256", "safe_log_sha256", "container_image_digest"]) {
      if (!SHA256_DIGEST.test(attestation.command_evidence[index][field] ?? "")) throw new Error(`attestation.command_evidence[${index}].${field} is not a SHA-256 digest`);
    }
  }
}

function parseArgs(argv) {
  const args = {};
  while (argv.length > 0) {
    const flag = argv.shift();
    if (!flag?.startsWith("--") || argv.length === 0) throw new Error(`invalid argument: ${flag}`);
    const key = flag.slice(2).replaceAll("-", "_");
    const value = argv.shift();
    args[key] = ["run_id", "run_attempt", "validation_job_result"].includes(key) ? value : resolve(value);
  }
  return args;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    for (const required of ["raw_directory", "schema", "execution_directory", "plan", "output", "run_id", "run_attempt", "validation_job_result"]) if (!args[required]) throw new Error(`--${required.replaceAll("_", "-")} is required`);
    const raw = verifyRawArtifact({ directory: args.raw_directory, schemaPath: args.schema, expected: { runId: args.run_id, runAttempt: args.run_attempt } });
    const loaded = loadValidationPlan(args.plan);
    const record = JSON.parse(readFileSync(resolve(args.execution_directory, "execution.json"), "utf8"));
    verifyExecutionRecord({ record, raw, plan: loaded.plan, planDigest: loaded.digest, executionDirectory: args.execution_directory, runId: args.run_id, runAttempt: args.run_attempt, validationJobResult: args.validation_job_result });
    const attestation = buildValidationAttestation({ raw, record, plan: loaded.plan, planDigest: loaded.digest, runId: args.run_id, runAttempt: args.run_attempt, validationJobResult: args.validation_job_result });
    writeFileSync(args.output, `${JSON.stringify(attestation, null, 2)}\n`);
    console.log(`ASK validation attestation created: commands=${attestation.command_evidence.length}, digest=${attestation.attestation_digest}`);
  } catch (error) {
    console.error(`ASK validation attestation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
