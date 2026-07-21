#!/usr/bin/env node
import { closeSync, cpSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { digestObject, sha256Bytes, validateAutomationRun, verifyRawArtifact } from "./ask-autonomous-guard.mjs";

export const VALIDATION_IMAGE = "node@sha256:5711a0d445a1af54af9589066c646df387d1831a608226f4cd694fc59e745059";
export const VALIDATION_IMAGE_DIGEST = "sha256:5711a0d445a1af54af9589066c646df387d1831a608226f4cd694fc59e745059";
export const VALIDATION_ENVIRONMENT = Object.freeze({
  PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
  HOME: "/tmp/home",
  LANG: "C.UTF-8",
  LC_ALL: "C.UTF-8",
  NODE_ENV: "test",
});

const COMMAND_ID = /^[a-z][a-z0-9_]{1,63}$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}

export function commandDefinitionDigest(command) {
  return sha256Bytes(Buffer.from(JSON.stringify(canonicalize(command))));
}

export function loadValidationPlan(planPath) {
  const bytes = readFileSync(planPath);
  const plan = JSON.parse(bytes.toString("utf8"));
  if (plan.schema_version !== "1.0.0") throw new Error("unsupported validation plan schema");
  if (plan.container?.image !== VALIDATION_IMAGE || plan.container?.image_digest !== VALIDATION_IMAGE_DIGEST) throw new Error("validation image must match the reviewed digest pin");
  if (plan.container?.node_major !== 24) throw new Error("validation Node.js major must be 24");
  if (JSON.stringify(plan.container?.environment_allowlist) !== JSON.stringify(Object.keys(VALIDATION_ENVIRONMENT))) throw new Error("validation environment allowlist drift detected");
  if (!Array.isArray(plan.commands) || plan.commands.length === 0) throw new Error("validation plan requires commands");
  const ids = new Set();
  for (const command of plan.commands) {
    if (!COMMAND_ID.test(command.id ?? "") || ids.has(command.id)) throw new Error("validation command IDs must be unique normalized identifiers");
    if (!Array.isArray(command.argv) || command.argv.length === 0 || command.argv.some((value) => typeof value !== "string" || value.length === 0)) throw new Error(`validation command ${command.id} requires an argv array`);
    if (command.argv.some((value) => /[\r\n\0]/u.test(value))) throw new Error(`validation command ${command.id} contains an invalid argv value`);
    ids.add(command.id);
  }
  return { plan, bytes, digest: sha256Bytes(bytes) };
}

export function dockerArguments({ image, repository, control, planPath, commandId }) {
  const environment = Object.entries(VALIDATION_ENVIRONMENT).map(([key, value]) => `${key}=${value}`);
  return [
    "run", "--rm", "--init", "--network", "none", "--read-only", "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges", "--pids-limit", "256",
    "--mount", `type=bind,src=${repository},dst=/source,readonly`,
    "--mount", `type=bind,src=${control},dst=/control,readonly`,
    "--mount", `type=bind,src=${planPath},dst=/validation-plan.json,readonly`,
    "--tmpfs", "/workspace:rw,nosuid,nodev,size=2g,mode=1777",
    "--tmpfs", "/tmp:rw,nosuid,nodev,size=256m,mode=1777",
    "--workdir", "/workspace", "--entrypoint", "/usr/bin/env", image, "-i",
    ...environment,
    "node", "/control/scripts/ask-autonomous-validate-execute.mjs", "container-command",
    "--plan", "/validation-plan.json", "--command-id", commandId,
  ];
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: null, stdio: ["ignore", "pipe", "pipe"], ...options });
  if (result.error) throw result.error;
  return result;
}

function safeLog(command, evidence) {
  return [
    `command_id=${command.id}`,
    `definition_sha256=${evidence.definition_sha256}`,
    `container_image_digest=${evidence.container_image_digest}`,
    `exit_status=${evidence.exit_status}`,
    `stdout_sha256=${evidence.stdout_sha256}`,
    `stderr_sha256=${evidence.stderr_sha256}`,
    "output_withheld=true",
    "",
  ].join("\n");
}

export function buildExecutionRecord({ raw, plan, planDigest, commandEvidence, runId, runAttempt, startedAt, finishedAt, status }) {
  const record = {
    schema_version: "1.0.0",
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
    started_at: startedAt,
    finished_at: finishedAt,
    status,
    commands: commandEvidence,
  };
  record.execution_digest = digestObject(record);
  return record;
}

export function executeValidationPlan({ repository, control, raw, plan, planDigest, planPath, outputDirectory, runId, runAttempt, now = () => new Date().toISOString(), spawn = run }) {
  mkdirSync(resolve(outputDirectory, "safe-logs"), { recursive: true });
  const commandEvidence = [];
  const startedAt = now();
  let status = "success";
  for (const command of plan.commands) {
    const commandStartedAt = now();
    const result = spawn("docker", dockerArguments({ image: plan.container.image, repository, control, planPath, commandId: command.id }));
    const stdout = result.stdout ?? Buffer.alloc(0);
    const stderr = result.stderr ?? Buffer.alloc(0);
    const safeLogPath = `safe-logs/${command.id}.log`;
    const evidence = {
      id: command.id,
      definition_sha256: commandDefinitionDigest(command),
      started_at: commandStartedAt,
      finished_at: now(),
      exit_status: result.status ?? 1,
      stdout_sha256: sha256Bytes(stdout),
      stderr_sha256: sha256Bytes(stderr),
      safe_log_path: safeLogPath,
      container_image_digest: plan.container.image_digest,
    };
    const logBytes = Buffer.from(safeLog(command, evidence));
    evidence.safe_log_sha256 = sha256Bytes(logBytes);
    writeFileSync(resolve(outputDirectory, safeLogPath), logBytes);
    commandEvidence.push(evidence);
    if (evidence.exit_status !== 0) {
      status = "failure";
      break;
    }
  }
  const record = buildExecutionRecord({ raw, plan, planDigest, commandEvidence, runId, runAttempt, startedAt, finishedAt: now(), status });
  writeFileSync(resolve(outputDirectory, "execution.json"), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

function materializeDisposableWorkspace() {
  for (const entry of readdirSync("/source")) {
    cpSync(resolve("/source", entry), resolve("/workspace", entry), { recursive: true, force: true, verbatimSymlinks: true });
  }
}

function runContainerCommand({ planPath, commandId }) {
  const loaded = loadValidationPlan(planPath);
  const command = loaded.plan.commands.find((candidate) => candidate.id === commandId);
  if (!command) throw new Error("command ID is not present in the immutable validation plan");
  materializeDisposableWorkspace();
  mkdirSync("/tmp/home", { recursive: true });
  const stdoutPath = "/tmp/command.stdout";
  const stderrPath = "/tmp/command.stderr";
  const stdoutFd = openSync(stdoutPath, "w");
  const stderrFd = openSync(stderrPath, "w");
  let result;
  try {
    result = spawnSync(command.argv[0], command.argv.slice(1), {
      cwd: "/workspace",
      env: VALIDATION_ENVIRONMENT,
      stdio: ["ignore", stdoutFd, stderrFd],
      timeout: 15 * 60 * 1_000,
      killSignal: "SIGKILL",
    });
  } finally {
    closeSync(stdoutFd);
    closeSync(stderrFd);
  }
  process.stdout.write(readFileSync(stdoutPath));
  process.stderr.write(readFileSync(stderrPath));
  if (result.error) throw new Error(`immutable validation command ${command.id} did not complete`);
  if (result.status !== 0) throw new Error(`immutable validation command ${command.id} failed`);
}

export function changedMjsFiles(repository, base) {
  const result = run("git", ["-C", repository, "diff", "--name-only", "--diff-filter=ACMR", base, "HEAD", "--", "*.mjs"]);
  if (result.status !== 0) throw new Error("failed to enumerate changed .mjs files");
  return result.stdout.toString("utf8").split(/\r?\n/u).filter(Boolean);
}

function prepareValidationWorkspace({ repository, rawDirectory, schemaPath, runId, runAttempt }) {
  const raw = verifyRawArtifact({ directory: rawDirectory, schemaPath, expected: { runId, runAttempt } });
  const apply = run("git", ["-C", repository, "apply", "--binary", raw.paths.patch]);
  if (apply.status !== 0) throw new Error("original raw patch could not be applied");
  const change = validateAutomationRun({ repository, context: raw.context, result: raw.result, expectedPatch: raw.patch });
  run("git", ["-C", repository, "config", "user.name", "ask-validation[bot]"]);
  run("git", ["-C", repository, "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  const add = run("git", ["-C", repository, "add", "--all", "--", "."]);
  if (add.status !== 0) throw new Error("validation patch could not be staged");
  const commit = run("git", ["-C", repository, "-c", "core.hooksPath=/dev/null", "commit", "--no-gpg-sign", "-m", "ASK isolated validation patch"]);
  if (commit.status !== 0) throw new Error("validation patch could not be committed in the disposable workspace");
  return { raw, change };
}

function parseArgs(argv) {
  const parsed = { command: argv.shift() };
  while (argv.length > 0) {
    const flag = argv.shift();
    if (!flag?.startsWith("--") || argv.length === 0) throw new Error(`invalid argument: ${flag}`);
    parsed[flag.slice(2).replaceAll("-", "_")] = resolve(argv.shift());
  }
  return parsed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.command === "container-command") {
      runContainerCommand({ planPath: args.plan, commandId: basename(args.command_id) });
    } else if (args.command === "changed-syntax") {
      for (const file of changedMjsFiles(args.repository, basename(args.base))) {
        const result = run("node", ["--check", resolve(args.repository, file)]);
        if (result.status !== 0) throw new Error(`syntax check failed: ${file}`);
      }
    } else if (args.command === "execute") {
      for (const required of ["repository", "control", "raw_directory", "schema", "plan", "output_directory", "run_id", "run_attempt"]) if (!args[required]) throw new Error(`--${required.replaceAll("_", "-")} is required`);
      rmSync(args.output_directory, { recursive: true, force: true });
      mkdirSync(args.output_directory, { recursive: true });
      const { raw } = prepareValidationWorkspace({ repository: args.repository, rawDirectory: args.raw_directory, schemaPath: args.schema, runId: basename(args.run_id), runAttempt: basename(args.run_attempt) });
      const loaded = loadValidationPlan(args.plan);
      const pull = run("docker", ["pull", loaded.plan.container.image]);
      if (pull.status !== 0) throw new Error("reviewed validation container could not be pulled");
      const record = executeValidationPlan({ repository: args.repository, control: args.control, raw, plan: loaded.plan, planDigest: loaded.digest, planPath: args.plan, outputDirectory: args.output_directory, runId: basename(args.run_id), runAttempt: basename(args.run_attempt) });
      if (record.status !== "success") throw new Error("isolated repository validation failed; output content was withheld and only digests were recorded");
      console.log(`ASK isolated validation passed: commands=${record.commands.length}, image=${record.container_image_digest}`);
    } else {
      throw new Error("command must be container-command, changed-syntax, or execute");
    }
  } catch (error) {
    console.error(`ASK isolated validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
