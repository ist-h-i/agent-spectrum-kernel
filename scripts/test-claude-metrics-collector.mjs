#!/usr/bin/env node
import { closeSync, existsSync, mkdtempSync, mkdirSync, openSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const recorder = resolve(repoRoot, "scripts/ai-metrics-record.mjs");
const fixtureRoot = mkdtempSync(resolve(tmpdir(), "claude-metrics-collector-"));

function envelope(overrides = {}) {
  const value = {
    schema_version: "1.0.0",
    route: {
      work_mode: "レビュー",
      operating_mode: "delivery_quality",
      user_facing: "変更をレビューする",
      internal: {
        primary: "review-router",
        secondary: ["review-final-merge-gate", "evidence-ledger"],
      },
    },
    evidence_status: {
      checked: ["git diff --check"],
      missing: ["external runtime evidence"],
    },
    stop_reason: {
      status: "insufficient_evidence",
      details: ["external runtime evidence was not checked"],
      human_decision_required: [],
      stop_if: ["runtime evidence is required for a readiness claim"],
    },
    next_action: "collect the missing runtime evidence",
    ...overrides,
  };
  return `Review summary. Secret outside the result: sk-test-secret\n\nExecution Envelope:\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
}

function normalizedCandidate(overrides = {}) {
  return {
    schema_version: "1.0.0",
    event_id: "task-result:collector-fixture",
    task_id: "TASK-COLLECTOR-1",
    task_type: "review",
    occurred_at: "2026-07-13T00:00:00Z",
    skills_used: ["review-router"],
    routing_result: {
      operating_mode: "delivery_quality",
      primary_skill: "review-router",
      secondary_skills: ["review-final-merge-gate"],
    },
    outcome_metrics: { rework_count: 0 },
    verification_metrics: {
      insufficient_evidence_reported: true,
      commands_run: [{ command_kind: "test", redacted_command_preview: "npm test --token sk-test-secret" }],
    },
    debt_movement_metrics: {},
    related_ids: { issues: ["#163", "sk-test-secret"] },
    evidence_references: ["git diff --check", "sk-test-secret"],
    privacy_note: {
      raw_prompts_stored: false,
      secrets_stored: false,
      customer_data_stored: false,
      personal_data_stored: false,
      external_publication: false,
      note: "secret sk-test-secret",
    },
    ...overrides,
  };
}

function runRecorder(root, args, input, env = {}) {
  return spawnSync(process.execPath, [recorder, ...args], {
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, ...env },
    input: JSON.stringify(input),
    encoding: "utf8",
  });
}

function runRecorderAsync(root, args, input, env = {}) {
  return new Promise((resolveResult) => {
    const stdinPath = resolve(fixtureRoot, `concurrent-stdin-${randomUUID()}.json`);
    writeFileSync(stdinPath, JSON.stringify(input));
    const stdinDescriptor = openSync(stdinPath, "r");
    const child = spawn(process.execPath, [recorder, ...args], {
      cwd: root,
      env: { ...process.env, CLAUDE_PROJECT_DIR: root, ...env },
      stdio: [stdinDescriptor, "pipe", "pipe"],
    });
    closeSync(stdinDescriptor);
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => {
      try { unlinkSync(stdinPath); } catch { /* fixture cleanup removes any remainder */ }
      resolveResult({ status, stdout, stderr });
    });
  });
}

function assertPass(label, result) {
  if (result.status !== 0) {
    throw new Error(`${label} should pass\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
}

function resultJson(label, result) {
  assertPass(label, result);
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${label} should print one JSON result\n${result.stdout}\n${result.stderr}`);
  }
}

function readEvents(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function assertRuntimeEvidence(label, result, expectedLevel) {
  if (
    result.capability?.capability_id !== "local_event_emission" ||
    result.capability?.evidence_level !== expectedLevel
  ) {
    throw new Error(`${label} should expose ${expectedLevel} capability evidence\n${JSON.stringify(result, null, 2)}`);
  }
}

async function main() {
  const writeRoot = resolve(fixtureRoot, "write");
  const eventStore = resolve(writeRoot, "events.jsonl");
  mkdirSync(writeRoot, { recursive: true });
  const hookInput = {
    session_id: "S-COLLECTOR-1",
    hook_event_name: "Stop",
    last_assistant_message: envelope(),
  };
  const writeResult = resultJson(
    "canonical task-result write",
    runRecorder(writeRoot, ["--event-kind", "task_stop", "--event-store", eventStore, "--print-result"], hookInput),
  );
  if (writeResult.status !== "recorded") {
    throw new Error(`first canonical task result should be recorded\n${JSON.stringify(writeResult, null, 2)}`);
  }
  assertRuntimeEvidence("canonical task-result write", writeResult, "executed");
  const [written] = readEvents(eventStore);
  if (
    !/^task:sha256:[a-f0-9]{64}$/.test(written.task_id) ||
    written.task_type !== "review" ||
    written.routing_result?.primary_skill !== "review-router" ||
    written.verification_metrics?.insufficient_evidence_reported !== true ||
    JSON.stringify(written).includes("sk-test-secret") ||
    JSON.stringify(written).includes("Review summary")
  ) {
    throw new Error(`collector should persist only bounded canonical fields\n${JSON.stringify(written, null, 2)}`);
  }

  const duplicateResult = resultJson(
    "duplicate task-result update",
    runRecorder(writeRoot, ["--event-kind", "task_stop", "--event-store", eventStore, "--print-result"], hookInput),
  );
  if (!["updated", "unchanged"].includes(duplicateResult.status) || readEvents(eventStore).length !== 1) {
    throw new Error(`duplicate Stop hooks must be idempotent\n${JSON.stringify(duplicateResult, null, 2)}`);
  }
  const distinctEnvelopeResult = resultJson(
    "same-session distinct task result",
    runRecorder(writeRoot, ["--event-kind", "task_stop", "--event-store", eventStore, "--print-result"], {
      ...hookInput,
      last_assistant_message: envelope({ next_action: "a different task follows" }),
    }),
  );
  const distinctEnvelopeEvents = readEvents(eventStore);
  if (
    distinctEnvelopeResult.status !== "recorded" ||
    distinctEnvelopeEvents.length !== 2 ||
    new Set(distinctEnvelopeEvents.map((event) => event.event_id)).size !== 2
  ) {
    throw new Error(`same session with distinct canonical envelopes must retain two event rows\n${JSON.stringify({ distinctEnvelopeResult, distinctEnvelopeEvents }, null, 2)}`);
  }

  const candidateRoot = resolve(fixtureRoot, "candidate");
  const candidateStore = resolve(candidateRoot, "events.jsonl");
  mkdirSync(candidateRoot, { recursive: true });
  const firstCandidate = normalizedCandidate();
  const sensitiveValues = [
    "alice@example.com",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhbGljZSJ9.signature",
    "AKIAIOSFODNN7EXAMPLE",
    "-----BEGIN PRIVATE KEY----- private material -----END PRIVATE KEY-----",
    "const customerName = 'Acme Corporation';",
    "Acme Corporation customer-4821",
  ];
  firstCandidate.task_id = sensitiveValues[5];
  firstCandidate.skills_used.push("acme-corporation");
  firstCandidate.evidence_references.push(...sensitiveValues);
  firstCandidate.verification_result_summary = sensitiveValues[4];
  firstCandidate.changed_file_summary = { count: 1, paths: [`customers/${sensitiveValues[5]}/source.ts`] };
  firstCandidate.related_ids.issues.push(sensitiveValues[5]);
  firstCandidate.routing_result.change_signals = [{ signal: "privacy_change", evidence: sensitiveValues[0] }];
  firstCandidate.routing_result.required_gate_routes = [{ gate: "risk-gate", reason: sensitiveValues[5], trigger_signals: ["privacy_change"] }];
  firstCandidate.gate_decisions = [{ gate: "risk-gate", status: "executed", judgment: sensitiveValues[4], evidence_checked: [sensitiveValues[2]] }];
  const firstCandidateResult = resultJson(
    "normalized candidate write",
    runRecorder(candidateRoot, ["--event-kind", "task_stop", "--event-store", candidateStore, "--print-result"], {
      session_id: "S-CANDIDATE",
      hook_event_name: "Stop",
      last_assistant_message: envelope({ metrics_event_candidate: firstCandidate }),
    }),
  );
  if (firstCandidateResult.status !== "recorded") {
    throw new Error(`normalized candidate should be recorded\n${JSON.stringify(firstCandidateResult, null, 2)}`);
  }
  const [sanitizedCandidate] = readEvents(candidateStore);
  if (
    ["sk-test-secret", "acme-corporation", ...sensitiveValues].some((value) => JSON.stringify(sanitizedCandidate).includes(value)) ||
    sanitizedCandidate.verification_metrics?.commands_run?.[0]?.redacted_command_preview ||
    sanitizedCandidate.evidence_references.some((reference) => !/^ref:sha256:[a-f0-9]{64}$/.test(reference)) ||
    sanitizedCandidate.changed_file_summary?.paths?.some((path) => !/^path:sha256:[a-f0-9]{64}$/.test(path)) ||
    sanitizedCandidate.related_ids?.issues?.some((issue) => !/^#[0-9]+$/.test(issue))
  ) {
    throw new Error(`normalized candidate privacy exclusions must be enforced by the runtime\n${JSON.stringify(sanitizedCandidate, null, 2)}`);
  }
  const updatedCandidate = normalizedCandidate({
    occurred_at: "2026-07-13T00:01:00Z",
    outcome_metrics: { rework_count: 1 },
  });
  const updateResult = resultJson(
    "normalized candidate merge/update",
    runRecorder(candidateRoot, ["--event-kind", "task_stop", "--event-store", candidateStore, "--print-result"], {
      session_id: "S-CANDIDATE",
      hook_event_name: "Stop",
      last_assistant_message: envelope({ metrics_event_candidate: updatedCandidate }),
    }),
  );
  const candidateEvents = readEvents(candidateStore);
  if (
    updateResult.status !== "updated" ||
    candidateEvents.length !== 1 ||
    candidateEvents[0].event_id !== sanitizedCandidate.event_id ||
    !/^evt:candidate:sha256:[a-f0-9]{64}$/.test(candidateEvents[0].event_id) ||
    candidateEvents[0].outcome_metrics?.rework_count !== 1
  ) {
    throw new Error(`same normalized event_id should update one JSONL row\n${JSON.stringify({ updateResult, candidateEvents }, null, 2)}`);
  }

  const skipRoot = resolve(fixtureRoot, "skip");
  const skipStore = resolve(skipRoot, "events.jsonl");
  mkdirSync(skipRoot, { recursive: true });
  const missingResult = resultJson(
    "missing canonical result skip",
    runRecorder(skipRoot, ["--event-kind", "task_stop", "--event-store", skipStore, "--print-result"], {
      session_id: "S-MISSING",
      hook_event_name: "Stop",
      last_assistant_message: "No structured task result.",
    }),
  );
  if (missingResult.status !== "skip" || missingResult.reason !== "canonical_task_result_missing" || existsSync(skipStore)) {
    throw new Error(`missing canonical result should skip without an event\n${JSON.stringify(missingResult, null, 2)}`);
  }
  assertRuntimeEvidence("missing canonical result", missingResult, "none");

  const malformedResult = resultJson(
    "malformed canonical result skip",
    runRecorder(skipRoot, ["--event-kind", "task_stop", "--event-store", skipStore, "--print-result", "--non-blocking"], {
      session_id: "S-MALFORMED",
      hook_event_name: "Stop",
      last_assistant_message: "Execution Envelope:\n```json\n{not-json}\n```",
    }),
  );
  if (malformedResult.status !== "skip" || malformedResult.reason !== "canonical_task_result_malformed" || existsSync(skipStore)) {
    throw new Error(`malformed canonical result should degrade and skip\n${JSON.stringify(malformedResult, null, 2)}`);
  }
  const healthPath = resolve(skipRoot, ".agent-spectrum-kernel/runtime/runtime-health.jsonl");
  if (!existsSync(healthPath) || !readFileSync(healthPath, "utf8").includes("canonical_task_result_malformed")) {
    throw new Error("malformed canonical result should be visible in sanitized runtime health");
  }

  const invalidResult = resultJson(
    "schema-invalid canonical result skip",
    runRecorder(skipRoot, ["--event-kind", "task_stop", "--event-store", skipStore, "--print-result", "--non-blocking"], {
      session_id: "S-INVALID",
      hook_event_name: "Stop",
      last_assistant_message: envelope({ route: {} }),
    }),
  );
  if (invalidResult.status !== "skip" || invalidResult.reason !== "canonical_task_result_invalid" || existsSync(skipStore)) {
    throw new Error(`schema-invalid canonical result should degrade and skip\n${JSON.stringify(invalidResult, null, 2)}`);
  }
  if (!readFileSync(healthPath, "utf8").includes("canonical_task_result_invalid")) {
    throw new Error("schema-invalid canonical result should be visible in sanitized runtime health");
  }

  const disabledRoot = resolve(fixtureRoot, "disabled");
  const disabledConfig = resolve(disabledRoot, "observability.yml");
  mkdirSync(disabledRoot, { recursive: true });
  writeFileSync(disabledConfig, "enabled: false\n");
  const disabledResult = resultJson(
    "disabled collector skip",
    runRecorder(disabledRoot, ["--event-kind", "task_stop", "--config", disabledConfig, "--print-result", "--non-blocking"], {
      session_id: "S-DISABLED",
      hook_event_name: "Stop",
      last_assistant_message: "Execution Envelope:\n```json\n{not-json}\n```",
    }),
  );
  if (disabledResult.status !== "skip" || disabledResult.reason !== "observability_disabled" || existsSync(resolve(disabledRoot, ".agent-spectrum-kernel"))) {
    throw new Error(`disabled observability must not emit events or health data\n${JSON.stringify(disabledResult, null, 2)}`);
  }

  const failureRoot = resolve(fixtureRoot, "failure");
  const directoryStore = resolve(failureRoot, "event-store-directory");
  mkdirSync(directoryStore, { recursive: true });
  const failure = runRecorder(
    failureRoot,
    ["--event-kind", "task_stop", "--event-store", directoryStore, "--non-blocking"],
    { session_id: "S-FAILURE", hook_event_name: "Stop", last_assistant_message: envelope() },
  );
  assertPass("non-blocking persistence failure", failure);
  if (failure.stdout || failure.stderr) {
    throw new Error(`non-blocking failure should stay silent\n${failure.stdout}\n${failure.stderr}`);
  }
  const failureHealth = resolve(failureRoot, ".agent-spectrum-kernel/runtime/runtime-health.jsonl");
  if (!existsSync(failureHealth) || !readFileSync(failureHealth, "utf8").includes("non_blocking_metrics_record_failure")) {
    throw new Error("persistence failure should write sanitized runtime health");
  }

  const concurrentRoot = resolve(fixtureRoot, "concurrent-health");
  mkdirSync(concurrentRoot, { recursive: true });
  const malformedCount = 12;
  const invalidCount = 8;
  const concurrentResults = await Promise.all([
    ...Array.from({ length: malformedCount }, (_, index) => runRecorderAsync(
      concurrentRoot,
      ["--event-kind", "task_stop", "--non-blocking", "--print-result"],
      { session_id: `S-CONCURRENT-MALFORMED-${index}`, last_assistant_message: "Execution Envelope:\n```json\n{not-json}\n```" },
    )),
    ...Array.from({ length: invalidCount }, (_, index) => runRecorderAsync(
      concurrentRoot,
      ["--event-kind", "task_stop", "--non-blocking", "--print-result"],
      { session_id: `S-CONCURRENT-INVALID-${index}`, last_assistant_message: envelope({ route: {} }) },
    )),
  ]);
  for (const [index, result] of concurrentResults.entries()) {
    const output = resultJson(`concurrent health writer ${index}`, result);
    const expectedReason = index < malformedCount ? "canonical_task_result_malformed" : "canonical_task_result_invalid";
    if (output.status !== "skip" || output.reason !== expectedReason) {
      throw new Error(`concurrent health writer ${index} should report ${expectedReason}\n${JSON.stringify(output, null, 2)}`);
    }
  }
  const concurrentHealthPath = resolve(concurrentRoot, ".agent-spectrum-kernel/runtime/runtime-health.jsonl");
  const concurrentHealth = readEvents(concurrentHealthPath);
  const malformedHealth = concurrentHealth.find((entry) => entry.error_code === "canonical_task_result_malformed");
  const invalidHealth = concurrentHealth.find((entry) => entry.error_code === "canonical_task_result_invalid");
  if (
    malformedHealth?.occurrence_count !== malformedCount ||
    invalidHealth?.occurrence_count !== invalidCount ||
    concurrentHealth.filter((entry) => entry.status === "error").length !== 2
  ) {
    throw new Error(`concurrent health writers must preserve every code and occurrence\n${JSON.stringify(concurrentHealth, null, 2)}`);
  }

  const cleanRoot = resolve(fixtureRoot, "read-only-clean");
  mkdirSync(cleanRoot, { recursive: true });
  const init = spawnSync("git", ["init", "-q"], { cwd: cleanRoot, encoding: "utf8" });
  assertPass("read-only fixture git init", init);
  const cleanResult = resultJson(
    "read-only runtime-local persistence",
    runRecorder(cleanRoot, ["--event-kind", "task_stop", "--print-result"], {
      session_id: "S-READ-ONLY",
      hook_event_name: "Stop",
      last_assistant_message: envelope(),
    }),
  );
  if (cleanResult.status !== "recorded") {
    throw new Error(`read-only fixture should record runtime-local state\n${JSON.stringify(cleanResult, null, 2)}`);
  }
  const cleanFailureResult = resultJson(
    "read-only runtime-local health persistence",
    runRecorder(cleanRoot, ["--event-kind", "task_stop", "--print-result", "--non-blocking"], {
      session_id: "S-READ-ONLY-INVALID",
      hook_event_name: "Stop",
      last_assistant_message: envelope({ route: {} }),
    }),
  );
  if (cleanFailureResult.status !== "skip" || cleanFailureResult.reason !== "canonical_task_result_invalid") {
    throw new Error(`read-only fixture should expose collector degradation without changing the task result\n${JSON.stringify(cleanFailureResult, null, 2)}`);
  }
  const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: cleanRoot, encoding: "utf8" });
  assertPass("read-only fixture git status", status);
  if (status.stdout.trim()) {
    throw new Error(`runtime-owned metrics must not dirty the engineering working tree\n${status.stdout}`);
  }
}

try {
  await main();
  console.log("claude metrics collector fixture tests passed");
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
