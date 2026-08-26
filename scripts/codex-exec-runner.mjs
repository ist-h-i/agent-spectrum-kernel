#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ASK_SHARED_MODULE_PATH, CODEX_PROMPT_CONTRACTS, inspectCodexDiscoverySkillAssets, inspectCodexProjectionCanonicalInputs, parseCodexCompactProfileHeader } from "./ask-shared.mjs";
import { mapCodexRunnerResult } from "./adapter-runtime-event.mjs";
import { buildExecutionEnvelopeRecord, hasExecutionEnvelopeMarker, inspectExecutionEnvelopeRecordEmission, renderExecutionEnvelopeProjection, selectExecutionEnvelopeEmission, validateExecutionEnvelope, validateExecutionEnvelopeRecord, validateJsonSchema } from "./execution-envelope.mjs";
import { resolveGitDirectory, resolveObservabilityPath } from "./observability-paths.mjs";

const CODEX_STATE_PATH = ".agent-spectrum-kernel/codex-install-state.json";
const DEFAULT_OUTPUT = ".agents/runs/codex-last-output.md";
const SENSOR_STATUS_PATTERN = /^ASK sensors:\s+(\w+)/m;
const RUNNING_RUNNER_PATH = realpathSync(fileURLToPath(import.meta.url));
const MANAGED_CODEX_RUNTIME_FILES = [
  "codex-exec-runner.mjs",
  "ask-sensors.mjs",
  "ask-shared.mjs",
  "execution-envelope.mjs",
  "adapter-runtime-event.mjs",
  "observability-paths.mjs",
  "execution-envelope.schema.json",
  "execution-envelope-record.schema.json",
  "codex-runner-result.schema.json",
  "metrics-event.schema.json",
  "adapter-runtime-event.schema.json",
];

function hashText(value) { return createHash("sha256").update(value).digest("hex"); }

function resolveWithinTarget(target, value, label) {
  if (!value || value.includes("\0") || value.startsWith("/") || value.split(/[\\/]/).includes("..")) throw new Error(`${label} must be a relative path inside target`);
  const resolved = resolve(target, value);
  if (resolved !== target && !resolved.startsWith(`${target}/`)) throw new Error(`${label} escapes target`);
  let existingParent = resolved;
  while (!existsSync(existingParent)) {
    const parent = dirname(existingParent);
    if (parent === existingParent) throw new Error(`${label} has no existing parent inside target`);
    existingParent = parent;
  }
  const canonicalParent = realpathSync(existingParent);
  if (canonicalParent !== target && !canonicalParent.startsWith(`${target}/`)) throw new Error(`${label} escapes target through a symbolic link`);
  return resolved;
}

function parseArgs(argv) {
  const args = {
    target: process.cwd(),
    prompt: "skill-implement.md",
    mode: null,
    sandbox: null,
    output: DEFAULT_OUTPUT,
    codexBin: "codex",
    diffBase: "",
    explicitRequiredGates: [],
    gatesObserved: false,
    dryRun: false,
    diagnosticEnvelope: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--target") {
      args.target = resolve(argv[++index]);
    } else if (arg === "--prompt") {
      args.prompt = argv[++index];
    } else if (arg === "--mode") {
      args.mode = argv[++index];
    } else if (arg === "--sandbox") {
      args.sandbox = argv[++index];
    } else if (arg === "--output") {
      args.output = argv[++index];
    } else if (arg === "--codex-bin") {
      args.codexBin = argv[++index];
    } else if (arg === "--diff-base") {
      args.diffBase = argv[++index];
    } else if (arg === "--required-gate") {
      args.explicitRequiredGates.push(argv[++index]);
    } else if (arg === "--gates-observed") {
      args.gatesObserved = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--diagnostic-envelope") {
      args.diagnosticEnvelope = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  const profile = CODEX_PROMPT_CONTRACTS[args.prompt];
  if (!profile) throw new Error(`prompt has no validated execution profile: ${args.prompt}`);
  if (args.mode && args.mode !== profile.mode) throw new Error(`prompt/mode mismatch: ${args.prompt} requires ${profile.mode}`);
  if (args.sandbox && args.sandbox !== profile.sandbox) throw new Error(`prompt/sandbox mismatch: ${args.prompt} requires ${profile.sandbox}`);
  if (args.explicitRequiredGates.some((gate) => typeof gate !== "string" || !/^[a-z0-9][a-z0-9-]*$/u.test(gate))) throw new Error("--required-gate must be a controlled identifier");
  args.mode = profile.mode;
  args.sandbox = profile.sandbox;
  args.explicitRequiredGates = [...new Set(args.explicitRequiredGates)].sort();
  args.requiredGates = [...new Set([...(profile.requiredGates ?? []), ...args.explicitRequiredGates])].sort();
  args.gateEvidenceLevel = args.explicitRequiredGates.length > 0 || args.gatesObserved
    ? "runtime_detected"
    : (profile.requiredGates ?? []).length > 0
      ? "projected"
      : "none";
  args.gatesObserved = args.gatesObserved || args.requiredGates.length > 0;
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/codex-exec-runner.mjs [options]

Options:
  --target <path>       Repository root containing .agent-spectrum-kernel/codex-install-state.json.
  --prompt <file>       Installed .agents/prompts file name. Defaults to skill-implement.md.
  --mode <mode>         Must match the selected prompt's managed contract.
  --sandbox <mode>      read-only | workspace-write. Defaults to workspace-write.
  --output <path>       Output file inside target. Defaults to .agents/runs/codex-last-output.md.
  --codex-bin <path>    Codex executable. Defaults to codex.
  --diff-base <rev>     Optional git diff range for review context, for example origin/main...HEAD.
  --required-gate <id>  Task-specific required gate. Repeat for multiple gates.
  --gates-observed      Record that task gate classification ran and found no additional gate.
  --dry-run             Run preflight and print the codex command without invoking Codex.
  --diagnostic-envelope Explicitly serialize the validated record for route/debug diagnosis.
  --json                Print machine-readable result JSON.

The runner is bounded: it runs preflight, assembles an installed prompt with
local repository context, invokes codex exec, captures final output, runs
ask-sensors, and reports an evidence level. ask-sensors is report-only and does
not prove business correctness.
`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function preflight(args) {
  const failures = [];
  const warnings = [];
  const capabilityMissing = [];
  if (!existsSync(args.target)) {
    failures.push(`target is missing: ${args.target}`);
    return { failures, warnings, capabilityMissing, state: null, promptPath: null, compactProfile: null };
  }
  args.target = realpathSync(args.target);
  const statePath = resolve(args.target, CODEX_STATE_PATH);
  let state = null;
  if (!existsSync(statePath)) {
    failures.push(`Codex install state is missing: ${CODEX_STATE_PATH}`);
  } else {
    try {
      state = readJson(statePath);
    } catch (error) {
      failures.push(`Codex install state is invalid: ${error.message}`);
    }
  }
  if (state?.install_status !== "installed") {
    failures.push(`Codex install status must be installed, received ${state?.install_status ?? "missing"}`);
  }
  if (state) {
    for (const finding of inspectCodexDiscoverySkillAssets(args.target, state)) {
      failures.push(`Codex discovery skill ${finding.status}: ${finding.path}`);
    }
  }
  if (args.prompt !== args.prompt.split(/[\\/]/).at(-1)) failures.push("prompt must be an installed prompt basename");
  let promptPath = null;
  try { promptPath = resolveWithinTarget(args.target, `.agents/prompts/${args.prompt}`, "prompt"); } catch (error) { failures.push(error.message); }
  if (!existsSync(promptPath)) {
    failures.push(`installed prompt is missing: .agents/prompts/${args.prompt}`);
  }
  if (state && Array.isArray(state.selected_prompts) && !state.selected_prompts.includes(args.prompt)) {
    failures.push(`prompt is not selected in Codex install state: ${args.prompt}`);
  }
  const promptRecord = state?.managed_files?.[`.agents/prompts/${args.prompt}`];
  if (!promptRecord || promptRecord.kind !== "codex_prompt" || !promptRecord.sha256) {
    failures.push(`selected prompt has no managed Codex prompt record: ${args.prompt}`);
  } else if (promptPath && existsSync(promptPath) && hashText(readFileSync(promptPath, "utf8")) !== promptRecord.sha256) {
    failures.push(`prompt hash does not match Codex install state: ${args.prompt}`);
  }
  const promptContent = promptPath && existsSync(promptPath) ? readFileSync(promptPath, "utf8") : "";
  const compactHeader = parseCodexCompactProfileHeader(promptContent);
  const compactProfile = promptRecord?.compact_profile ?? null;
  if (!compactProfile || !compactHeader) {
    failures.push(`selected prompt has no generated Codex compact-profile evidence: ${args.prompt}`);
  } else {
    const expectedHeader = {
      v: compactProfile.schema_version,
      id: compactProfile.profile_id,
      revision: compactProfile.canonical_revision,
      source_digest: compactProfile.canonical_source_digest,
      profile_fingerprint: compactProfile.profile_fingerprint,
      requested_contracts: compactProfile.requested_contracts,
      control_ids: compactProfile.control_ids,
    };
    if (JSON.stringify(compactHeader) !== JSON.stringify(expectedHeader)) failures.push(`compact-profile header does not match Codex install state: ${args.prompt}`);
    if (compactProfile.mode !== args.mode) failures.push(`compact-profile mode mismatch: ${args.prompt} requires ${compactProfile.mode}`);
    if (compactProfile.rendered_sha256 !== `sha256:${hashText(promptContent)}`) failures.push(`compact-profile rendered digest mismatch: ${args.prompt}`);
    if (compactProfile.canonical_source_digest !== state?.projection_plan?.canonical_source_digest) failures.push(`compact-profile canonical source digest does not match shared projection plan: ${args.prompt}`);
    if (compactProfile.profile_fingerprint !== state?.projection_plan?.fingerprint) failures.push(`compact-profile fingerprint does not match shared projection plan: ${args.prompt}`);
    for (const gate of args.requiredGates) if (!(state?.selected_skills ?? []).includes(gate)) capabilityMissing.push(gate);
    const selectedProfile = (state?.compact_runtime_profiles ?? []).find((profile) => profile.profile_id === compactProfile.profile_id);
    if (!selectedProfile || selectedProfile.rendered_sha256 !== compactProfile.rendered_sha256) failures.push(`compact profile is not selected in Codex install state: ${compactProfile.profile_id}`);
    for (const finding of inspectCodexProjectionCanonicalInputs(args.target, state?.projection_plan)) {
      failures.push(`compact-profile canonical source ${finding.status}: ${finding.path}`);
    }
  }
  try { args.outputPath = resolveWithinTarget(args.target, args.output, "output"); } catch (error) { failures.push(error.message); }
  try {
    const managedRunnerPath = resolveWithinTarget(args.target, "scripts/codex-exec-runner.mjs", "managed runner");
    const canonicalManagedRunnerPath = existsSync(managedRunnerPath) ? realpathSync(managedRunnerPath) : managedRunnerPath;
    if (RUNNING_RUNNER_PATH !== canonicalManagedRunnerPath) {
      failures.push(`running runner is not the target managed runner: expected ${canonicalManagedRunnerPath}, received ${RUNNING_RUNNER_PATH}`);
    }
  } catch (error) {
    failures.push(error.message);
  }
  for (const runtime of MANAGED_CODEX_RUNTIME_FILES) {
    const relativePath = `scripts/${runtime}`;
    const record = state?.managed_files?.[relativePath];
    let runtimePath = null;
    try {
      runtimePath = resolveWithinTarget(args.target, relativePath, "managed Codex runtime");
    } catch (error) {
      failures.push(error.message);
      continue;
    }
    if (!state?.selected_runtime_scripts?.includes(runtime) || record?.kind !== "codex_runtime" || !existsSync(runtimePath)) {
      failures.push(`managed Codex runtime is missing or unselected: ${relativePath}`);
    } else if (hashText(readFileSync(runtimePath, "utf8")) !== record.sha256) {
      failures.push(`managed Codex runtime hash mismatch: ${relativePath}`);
    }
    if (runtime === "ask-shared.mjs" && existsSync(runtimePath) && ASK_SHARED_MODULE_PATH !== realpathSync(runtimePath)) {
      failures.push(`imported ask-shared runtime is not the target managed runtime: expected ${realpathSync(runtimePath)}, received ${ASK_SHARED_MODULE_PATH}`);
    }
  }
  if (args.diffBase) {
    try {
      args.diffRange = resolveDiffRange(args.target, args.diffBase);
    } catch (error) {
      failures.push(`invalid --diff-base: ${error.message}`);
    }
  }
  args.structuredResultSchemaPath = resolve(args.target, "scripts/codex-runner-result.schema.json");
  args.envelopeRecordSchemaPath = resolve(args.target, "scripts/execution-envelope-record.schema.json");
  return { failures, warnings, capabilityMissing, state, promptPath, compactProfile };
}

function resolveDiffRange(target, value) {
  if (!value || value.startsWith("-") || /[\0\r\n\s]/.test(value)) throw new Error("must be a revision or A..B / A...B range without options or whitespace");
  const separator = value.includes("...") ? "..." : value.includes("..") ? ".." : null;
  const endpoints = separator ? value.split(separator) : [value];
  if (endpoints.length > 2 || endpoints.some((endpoint) => !endpoint)) throw new Error("range endpoints must be non-empty");
  const revisions = endpoints.map((endpoint) => {
    const result = spawnSync("git", ["rev-parse", "--verify", `${endpoint}^{commit}`], { cwd: target, encoding: "utf8" });
    if (result.error || result.status !== 0) throw new Error(`revision is not a commit: ${endpoint}`);
    return result.stdout.trim();
  });
  return separator ? revisions.join(separator) : revisions[0];
}

function gitDiffContext(args) {
  if (!args.diffBase) {
    return "";
  }
  const result = spawnSync("git", ["diff", "--patch", args.diffRange, "--"], {
    cwd: args.target,
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return `Git diff context unavailable for ${args.diffBase}:\n${result.stderr || result.stdout || "unknown git diff failure"}`;
  }
  return result.stdout.trim() ? `Git diff context (${args.diffBase}):\n${result.stdout}` : `Git diff context (${args.diffBase}): empty diff.`;
}

function buildPrompt(args, state, promptPath, compactProfile) {
  const prompt = readFileSync(promptPath, "utf8");
  const context = [
    "Repository context:",
    `- Codex profile: ${state?.selected_profile ?? "unknown"}`,
    `- Compact runtime profile: ${compactProfile?.profile_id ?? "unavailable"}`,
    `- Requested contracts: ${(compactProfile?.requested_contracts ?? []).join(", ") || "unavailable"}`,
    `- Selected skills: ${(state?.selected_skills ?? []).join(", ") || "unknown"}`,
    `- Runner mode: ${args.mode}`,
    `- Sandbox: ${args.sandbox}`,
    `- Required gates: ${args.gatesObserved ? args.requiredGates.join(", ") || "none" : "unobserved"}`,
    "Evidence boundary: file projection and sensors do not prove business correctness.",
    "Managed runner result boundary:",
    "- Return only the JSON object required by scripts/codex-runner-result.schema.json.",
    "- Put the domain artifact in response_markdown without an Execution Envelope marker.",
    "- Put evidence_status, stop_reason, and next_action in control; do not infer them from prose.",
    "- Omit route fields. The runner derives them from this validated compact profile.",
  ];
  const diff = gitDiffContext(args);
  return [prompt.trimEnd(), "", context.join("\n"), diff ? `\n${diff}` : ""].join("\n");
}

function runCodex(args, prompt) {
  mkdirSync(dirname(args.outputPath), { recursive: true });
  const temporaryOutput = `.agents/runs/codex-run-${process.pid}-${Date.now()}.json`;
  const temporaryOutputPath = resolveWithinTarget(args.target, temporaryOutput, "temporary output");
  mkdirSync(dirname(temporaryOutputPath), { recursive: true });
  const commandArgs = ["exec", "--sandbox", args.sandbox, "--output-schema", "scripts/codex-runner-result.schema.json", "--output-last-message", temporaryOutput];
  const result = spawnSync(args.codexBin, commandArgs, {
    cwd: args.target,
    encoding: "utf8",
    input: prompt,
    maxBuffer: 10 * 1024 * 1024,
  });
  const outputExists = existsSync(temporaryOutputPath);
  const finalOutput = outputExists ? readFileSync(temporaryOutputPath, "utf8") : "";
  const acceptedOutput = !result.error && result.status === 0 && outputExists && finalOutput.trim().length > 0;
  if (!acceptedOutput && outputExists) unlinkSync(temporaryOutputPath);
  return {
    command: [args.codexBin, ...commandArgs, "<stdin-prompt>"].join(" "),
    exitCode: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message ?? null,
    temporaryOutputPath: acceptedOutput ? temporaryOutputPath : null,
    finalOutput: acceptedOutput ? finalOutput : "",
  };
}

function runnerBinding(args, compactProfile) {
  return {
    adapter_id: "codex",
    entry_id: args.prompt,
    mode: args.mode,
    profile_id: compactProfile.profile_id,
    profile_schema_version: compactProfile.schema_version,
    canonical_revision: compactProfile.canonical_revision,
    canonical_source_digest: compactProfile.canonical_source_digest,
    profile_fingerprint: compactProfile.profile_fingerprint,
    rendered_sha256: compactProfile.rendered_sha256,
  };
}

function envelopeForControl(args, compactProfile, control) {
  const contract = CODEX_PROMPT_CONTRACTS[args.prompt];
  const secondary = (compactProfile.requested_contracts ?? []).filter((item) => item !== compactProfile.primary_contract);
  const internal = {
    primary: compactProfile.primary_contract,
    ...(secondary.length > 0 ? { secondary } : {}),
  };
  return {
    schema_version: "1.0.0",
    route: {
      work_mode: contract.route.workMode,
      operating_mode: "delivery_quality",
      user_facing: contract.route.userFacing,
      internal,
    },
    evidence_status: control.evidence_status,
    stop_reason: control.stop_reason,
    next_action: control.next_action,
  };
}

function recordForControl(args, compactProfile, responseMarkdown, control, { dynamicFieldsSource, controlInputSha256 = null } = {}) {
  const envelope = envelopeForControl(args, compactProfile, control);
  const envelopeErrors = validateExecutionEnvelope(envelope);
  if (envelopeErrors.length > 0) throw new Error(`structured control cannot produce a canonical Execution Envelope: ${envelopeErrors.join("; ")}`);
  const emissionClass = selectExecutionEnvelopeEmission({
    mode: args.mode,
    stopStatus: envelope.stop_reason.status,
    diagnostic: args.diagnosticEnvelope,
  });
  const record = buildExecutionEnvelopeRecord({
    emissionClass,
    authority: {
      owner: "runner",
      fixed_fields_source: "compact_profile",
      dynamic_fields_source: dynamicFieldsSource,
    },
    binding: runnerBinding(args, compactProfile),
    envelope,
    responseMarkdown,
    controlInputSha256,
  });
  const errors = validateExecutionEnvelopeRecord(record, { schemaPath: args.envelopeRecordSchemaPath, responseMarkdown });
  if (errors.length > 0) throw new Error(`runner-owned Execution Envelope record is invalid: ${errors.join("; ")}`);
  return record;
}

function parseStructuredResult(args, compactProfile, rawOutput) {
  let value;
  try {
    value = JSON.parse(rawOutput);
  } catch (error) {
    throw new Error(`Codex structured result is invalid JSON: ${error.message}`);
  }
  const schemaErrors = validateJsonSchema(value, { schemaPath: args.structuredResultSchemaPath });
  if (schemaErrors.length > 0) throw new Error(`Codex structured result does not match its schema: ${schemaErrors.join("; ")}`);
  if (hasExecutionEnvelopeMarker(value.response_markdown)) throw new Error("Codex response_markdown duplicates the runner-owned Execution Envelope");
  const controlInputSha256 = `sha256:${hashText(rawOutput)}`;
  const record = recordForControl(args, compactProfile, value.response_markdown, value.control, {
    dynamicFieldsSource: "structured_runtime_result",
    controlInputSha256,
  });
  return { value, record };
}

function runnerObservedStop(args, compactProfile, { status, details, missing, nextAction, responseMarkdown }) {
  return {
    responseMarkdown,
    record: recordForControl(args, compactProfile, responseMarkdown, {
      evidence_status: {
        checked: [`managed compact profile ${compactProfile.profile_id}`],
        missing,
      },
      stop_reason: {
        status,
        details,
        human_decision_required: status === "risk_gate" ? ["specific approval for the risk-gated action"] : [],
        stop_if: details,
      },
      next_action: nextAction,
    }, { dynamicFieldsSource: "runner_observation" }),
  };
}

function prepareOutputCandidate(args, responseMarkdown, record) {
  const output = renderExecutionEnvelopeProjection(responseMarkdown, record);
  const nonce = `${process.pid}-${Date.now()}`;
  const temporaryOutputPath = resolveWithinTarget(args.target, `${args.output}.ask-${nonce}.tmp`, "temporary managed output");
  const temporaryRecordPath = resolveWithinTarget(args.target, `${args.output}.ask-${nonce}.record.json`, "temporary envelope record");
  mkdirSync(dirname(temporaryOutputPath), { recursive: true });
  writeFileSync(temporaryOutputPath, output, { flag: "wx", mode: 0o600 });
  writeFileSync(temporaryRecordPath, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return { output, temporaryOutputPath, temporaryRecordPath };
}

function cleanupCandidate(candidate) {
  for (const path of [candidate?.temporaryOutputPath, candidate?.temporaryRecordPath]) {
    if (path && existsSync(path)) unlinkSync(path);
  }
}

function insidePath(path, root) {
  return path === root || path.startsWith(`${root}/`);
}

function persistEnvelopeRecord(args, record) {
  const logicalPath = `ask-runtime/execution-envelopes/${record.record_id}.json`;
  const storageDirectory = resolveObservabilityPath(args.target, "ask-runtime/execution-envelopes");
  const recordPath = resolveObservabilityPath(args.target, logicalPath);
  const gitDirectory = resolveGitDirectory(args.target);
  const allowedRoot = realpathSync(gitDirectory ?? args.target);
  let existingParent = storageDirectory;
  while (!existsSync(existingParent)) existingParent = dirname(existingParent);
  if (!insidePath(realpathSync(existingParent), allowedRoot)) throw new Error("Execution Envelope record store escapes runtime-owned storage through a symbolic link");
  mkdirSync(storageDirectory, { recursive: true });
  if (!insidePath(realpathSync(storageDirectory), allowedRoot)) throw new Error("Execution Envelope record store escapes runtime-owned storage through a symbolic link");
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  if (existsSync(recordPath)) {
    const stats = lstatSync(recordPath);
    if (stats.isSymbolicLink() || !stats.isFile()) throw new Error("Execution Envelope record path must be a regular runtime-owned file");
    if (readFileSync(recordPath, "utf8") !== bytes) throw new Error("content-addressed Execution Envelope record conflicts with existing bytes");
    return { logicalPath, recordPath, digest: `sha256:${hashText(bytes)}` };
  }
  const temporaryPath = `${recordPath}.${process.pid}-${Date.now()}.tmp`;
  try {
    writeFileSync(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
    renameSync(temporaryPath, recordPath);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
  return { logicalPath, recordPath, digest: `sha256:${hashText(bytes)}` };
}

function runSensors(args, outputPath, recordPath) {
  const result = spawnSync(process.execPath, ["scripts/ask-sensors.mjs", "--target", args.target, "--mode", args.mode, "--input", outputPath, "--envelope-record", recordPath], {
    cwd: args.target,
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
  });
  const status = result.stdout.match(SENSOR_STATUS_PATTERN)?.[1] ?? "unknown";
  return {
    status,
    exitCode: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function publishOutput(args, responseMarkdown, record, { inspectDomainOutput = true } = {}) {
  const candidate = prepareOutputCandidate(args, responseMarkdown, record);
  let sensorResult = null;
  try {
    const inspection = inspectExecutionEnvelopeRecordEmission(candidate.output, record, { schemaPath: args.envelopeRecordSchemaPath });
    if (inspection.status !== "valid") throw new Error(`runner output projection is invalid: ${inspection.errors.join("; ")}`);
    if (inspectDomainOutput) {
      sensorResult = runSensors(args, candidate.temporaryOutputPath, candidate.temporaryRecordPath);
      if (sensorResult.exitCode !== 0 || sensorResult.status !== "pass") return { published: false, sensorResult, persistence: null };
    }
    const persistence = persistEnvelopeRecord(args, record);
    renameSync(candidate.temporaryOutputPath, args.outputPath);
    unlinkSync(candidate.temporaryRecordPath);
    return { published: true, sensorResult, persistence };
  } finally {
    cleanupCandidate(candidate);
  }
}

function resultStatus({ preflightResult, codexResult, sensorResult, dryRun, approvalBlocked, capabilityBlocked, record, published, structuredError }) {
  if (preflightResult.failures.length > 0) {
    return { status: "insufficient_evidence", evidenceLevel: "unknown" };
  }
  if (approvalBlocked || capabilityBlocked) {
    return { status: "insufficient_evidence", evidenceLevel: "runtime_detected" };
  }
  if (dryRun) {
    return { status: "ready_to_execute", evidenceLevel: "projected" };
  }
  if (!codexResult || codexResult.error) {
    return { status: "execution_failed", evidenceLevel: "projected" };
  }
  if (codexResult.exitCode !== 0) {
    return { status: "execution_failed", evidenceLevel: "runtime_detected" };
  }
  if (!codexResult.finalOutput.trim()) {
    return { status: "insufficient_evidence", evidenceLevel: "runtime_detected" };
  }
  if (structuredError || !record || !published) {
    return { status: "insufficient_evidence", evidenceLevel: "executed" };
  }
  if (["none", "completed"].includes(record.envelope.stop_reason.status) && sensorResult?.exitCode === 0 && sensorResult?.status === "pass") {
    return { status: "executed", evidenceLevel: "executed" };
  }
  return { status: "insufficient_evidence", evidenceLevel: "executed" };
}

function printResult(report, json) {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`Codex runner: ${report.status}`);
  console.log(`Evidence level: ${report.evidence_level}`);
  console.log(`Output: ${report.output_path ?? "not written"}`);
  console.log(`Envelope emission: ${report.execution_envelope_record?.emission_class ?? "not available"}`);
  console.log(`Envelope record: ${report.execution_envelope_record?.logical_path ?? "not persisted"}`);
  console.log(`Sensor status: ${report.sensor_status ?? "not run"}`);
  console.log(`Requested contracts: ${report.execution_evidence.requested_contracts.contracts.length}`);
  console.log(`Required gates evidence: ${report.execution_evidence.required_gates.evidence_level}`);
  console.log(`Projected contracts evidence: ${report.execution_evidence.projected_contracts.evidence_level}`);
  console.log(`Runtime-detected compact output profile evidence: ${report.execution_evidence.runtime_detected_profile.evidence_level}`);
  console.log(`Runtime-loaded contracts evidence: ${report.execution_evidence.runtime_loaded_contracts.evidence_level}`);
  console.log(`Applied output contracts evidence: ${report.execution_evidence.applied_output_contracts.evidence_level}`);
  console.log(`Workflow contract application evidence: ${report.execution_evidence.workflow_contract_application.evidence_level}`);
  console.log(`Risk/approval contract application evidence: ${report.execution_evidence.risk_approval_contract_application.evidence_level}`);
  console.log(`Verification contract application evidence: ${report.execution_evidence.verification_contract_application.evidence_level}`);
  console.log("Boundary: ask-sensors is report-only and does not prove business correctness.");
  if (report.failures.length > 0) {
    console.log("Failures:");
    for (const failure of report.failures) {
      console.log(`- ${failure}`);
    }
  }
  if (report.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of report.warnings) {
      console.log(`- ${warning}`);
    }
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const preflightResult = preflight(args);
  let codexResult = null;
  let sensorResult = null;
  let command = null;
  let envelopeRecord = null;
  let publication = null;
  let structuredError = null;
  const approvalBlocked = args.requiredGates.includes("risk-gate");
  const capabilityBlocked = preflightResult.capabilityMissing.length > 0;
  if (preflightResult.failures.length === 0) {
    const prompt = buildPrompt(args, preflightResult.state, preflightResult.promptPath, preflightResult.compactProfile);
    command = `${args.codexBin} exec --sandbox ${args.sandbox} --output-schema scripts/codex-runner-result.schema.json --output-last-message <temporary-json> <stdin-prompt>`;
    if (!args.dryRun) {
      if (approvalBlocked) {
        const stop = runnerObservedStop(args, preflightResult.compactProfile, {
          status: "risk_gate",
          details: ["risk-gate requires specific-action approval before execution"],
          missing: ["specific_action_approval"],
          nextAction: "obtain approval for the exact risk-gated action",
          responseMarkdown: "Codex runner stopped before execution because the selected action requires specific approval.\n",
        });
        envelopeRecord = stop.record;
        publication = publishOutput(args, stop.responseMarkdown, stop.record, { inspectDomainOutput: false });
      } else if (capabilityBlocked) {
        const missing = preflightResult.capabilityMissing.map((capability) => `selected capability ${capability}`);
        const stop = runnerObservedStop(args, preflightResult.compactProfile, {
          status: "capability_missing",
          details: missing.map((item) => `${item} is unavailable in the installed profile`),
          missing,
          nextAction: `install or explicitly select a profile containing ${preflightResult.capabilityMissing.join(", ")}`,
          responseMarkdown: "Codex runner stopped before execution because a required capability is unavailable.\n",
        });
        envelopeRecord = stop.record;
        publication = publishOutput(args, stop.responseMarkdown, stop.record, { inspectDomainOutput: false });
      } else {
        codexResult = runCodex(args, prompt);
        try {
          if (codexResult.exitCode === 0 && codexResult.finalOutput.trim()) {
            const parsed = parseStructuredResult(args, preflightResult.compactProfile, codexResult.finalOutput);
            envelopeRecord = parsed.record;
            publication = publishOutput(args, parsed.value.response_markdown, parsed.record);
            sensorResult = publication.sensorResult;
          }
        } catch (error) {
          structuredError = error.message;
        } finally {
          if (codexResult.temporaryOutputPath && existsSync(codexResult.temporaryOutputPath)) unlinkSync(codexResult.temporaryOutputPath);
        }
      }
    }
  }
  const normalized = resultStatus({ preflightResult, codexResult, sensorResult, dryRun: args.dryRun, approvalBlocked, capabilityBlocked, record: envelopeRecord, published: publication?.published === true, structuredError });
  const preflightPassed = preflightResult.failures.length === 0;
  const report = {
    status: normalized.status,
    evidence_level: normalized.evidenceLevel,
    mode: args.mode,
    sandbox: args.sandbox,
    command,
    output_path: publication?.published ? args.output : null,
    sensor_status: sensorResult?.status ?? null,
    execution_envelope_record: envelopeRecord ? {
      ...envelopeRecord,
      persisted: publication?.published === true,
      logical_path: publication?.persistence?.logicalPath ?? null,
      record_file_sha256: publication?.persistence?.digest ?? null,
    } : null,
    execution_evidence: {
      requested_contracts: {
        profile_id: preflightResult.compactProfile?.profile_id ?? null,
        contracts: preflightResult.compactProfile?.requested_contracts ?? [],
      },
      required_gates: {
        evidence_level: preflightPassed ? args.gateEvidenceLevel : "none",
        gates: args.requiredGates,
        missing_evidence: [
          ...(!preflightPassed || !args.gatesObserved ? ["required_gate_observation"] : []),
          ...(approvalBlocked ? ["specific_action_approval"] : []),
          ...preflightResult.capabilityMissing.map((capability) => `capability:${capability}`),
        ],
        detail: !args.gatesObserved
          ? "Task-specific required-gate classification was not observed."
          : approvalBlocked
            ? "risk-gate is required and specific-action approval is not available."
            : "Required gates were derived from the managed prompt contract or explicit task classification.",
      },
      projected_contracts: {
        evidence_level: preflightPassed ? "projected" : "none",
        prompt: `.agents/prompts/${args.prompt}`,
        canonical_revision: preflightResult.compactProfile?.canonical_revision ?? null,
      },
      runtime_detected_profile: {
        evidence_level: preflightPassed ? "runtime_detected" : "none",
        detail: preflightPassed
          ? "The managed runner loaded the generated prompt/profile into the invocation context."
          : "The managed compact profile was not loaded because preflight failed.",
      },
      runtime_loaded_contracts: {
        evidence_level: "none",
        contracts: [],
        missing_evidence: ["runtime_contract_load"],
        detail: "Codex-controlled canonical Skill and contract loading is not observable.",
      },
      applied_output_contracts: {
        evidence_level: sensorResult?.exitCode === 0 && sensorResult?.status === "pass" ? "executed" : "none",
        evidence_scope: "Required output sections inspected by ask-sensors only.",
        detail: sensorResult
          ? `ask-sensors status=${sensorResult.status}, exit=${sensorResult.exitCode}`
          : "No Codex output was evaluated against the requested output contract.",
      },
      workflow_contract_application: {
        evidence_level: "none",
        missing_evidence: ["workflow_contract_application"],
        detail: "Output inspection does not expose whether Codex applied the requested workflow contract.",
      },
      risk_approval_contract_application: {
        evidence_level: "none",
        missing_evidence: ["risk_approval_contract_application"],
        detail: "Output inspection does not expose whether Codex applied the risk and approval contract.",
      },
      verification_contract_application: {
        evidence_level: "none",
        missing_evidence: ["verification_contract_application"],
        detail: "Output inspection distinguishes reported evidence but does not prove that the verification workflow was applied.",
      },
    },
    failures: [...preflightResult.failures, ...(codexResult?.error ? [`codex exec could not start: ${codexResult.error}`] : []), ...(codexResult && codexResult.exitCode !== null && codexResult.exitCode !== 0 ? [`codex exec exited ${codexResult.exitCode}`] : []), ...(structuredError ? [structuredError] : []), ...(sensorResult && (sensorResult.exitCode !== 0 || sensorResult.status !== "pass") ? [`ask-sensors rejected output: status=${sensorResult.status}, exit=${sensorResult.exitCode}`] : [])],
    warnings: preflightResult.warnings,
    boundary: "File projection and ask-sensors output checks do not prove business correctness, product readiness, or no regression.",
  };
  const normalizedEventSchemaPath = resolve(args.target, "scripts/adapter-runtime-event.schema.json");
  report.normalized_adapter_event = existsSync(normalizedEventSchemaPath)
    ? mapCodexRunnerResult(report, { schemaPath: normalizedEventSchemaPath })
    : null;
  printResult(report, args.json);
  process.exit(normalized.status === "executed" ? 0 : normalized.status === "execution_failed" ? 1 : 2);
} catch (error) {
  console.error(`codex-exec-runner failed: ${error.message}`);
  process.exit(1);
}
