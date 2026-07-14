#!/usr/bin/env node
import { closeSync, existsSync, mkdtempSync, mkdirSync, openSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const recorder = resolve(repoRoot, "scripts/ai-metrics-record.mjs");
const summarizer = resolve(repoRoot, "scripts/ai-metrics-summarize.mjs");
const doctor = resolve(repoRoot, "scripts/ask-doctor.mjs");
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

function summarizeStore(root, eventStore, name) {
  const output = resolve(root, `${name}.json`);
  const result = spawnSync(process.execPath, [
    summarizer,
    "--event-store", eventStore,
    "--out", output,
    "--period-start", "2000-01-01",
    "--period-end", "2999-12-31",
    "--format", "json",
  ], { cwd: root, encoding: "utf8" });
  assertPass(`summarize ${name}`, result);
  return JSON.parse(readFileSync(output, "utf8"));
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
  const transcriptPath = resolve(writeRoot, "transcript.jsonl");
  writeFileSync(transcriptPath, `${JSON.stringify({ type: "assistant", uuid: "turn-a" })}\n`);
  const hookInput = {
    session_id: "S-COLLECTOR-1",
    transcript_path: transcriptPath,
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
  if (
    writeResult.normalized_adapter_event?.adapter_id !== "claude_code" ||
    writeResult.normalized_adapter_event?.event_type !== "task_stop" ||
    writeResult.normalized_adapter_event?.stop?.status !== "insufficient_evidence"
  ) {
    throw new Error(`collector should map its metrics event to the normalized adapter event schema\n${JSON.stringify(writeResult, null, 2)}`);
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
  writeFileSync(transcriptPath, `${JSON.stringify({ type: "assistant", uuid: "turn-b-after-read-only-work" })}\n`, { flag: "a" });
  const sameEnvelopeFollowupResult = resultJson(
    "same-envelope follow-up after transcript-only turn",
    runRecorder(writeRoot, ["--event-kind", "task_stop", "--event-store", eventStore, "--print-result"], hookInput),
  );
  writeFileSync(transcriptPath, `${JSON.stringify({ type: "assistant", uuid: "turn-c-after-conversation-only-work" })}\n`, { flag: "a" });
  const sameEnvelopeRestartResult = resultJson(
    "same-envelope follow-up after collector restart",
    runRecorder(writeRoot, ["--event-kind", "task_stop", "--event-store", eventStore, "--print-result"], hookInput),
  );
  const sameEnvelopeEvents = readEvents(eventStore);
  if (
    sameEnvelopeFollowupResult.status !== "recorded" ||
    sameEnvelopeRestartResult.status !== "recorded" ||
    sameEnvelopeEvents.length !== 3 ||
    new Set(sameEnvelopeEvents.map((event) => event.task_id)).size !== 3
  ) {
    throw new Error(`later read-only or conversation-only turns with the same Envelope must remain separate across collector processes\n${JSON.stringify({ sameEnvelopeFollowupResult, sameEnvelopeRestartResult, sameEnvelopeEvents }, null, 2)}`);
  }
  const persistedBoundaryState = readFileSync(resolve(writeRoot, ".agent-spectrum-kernel/runtime/task-boundaries.json"), "utf8");
  if (persistedBoundaryState.includes(transcriptPath) || persistedBoundaryState.includes("turn-a") || persistedBoundaryState.includes("turn-b")) {
    throw new Error(`task boundary state must persist only the hashed transcript identity\n${persistedBoundaryState}`);
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
    distinctEnvelopeEvents.length !== 4 ||
    new Set(distinctEnvelopeEvents.map((event) => event.event_id)).size !== 4 ||
    new Set(distinctEnvelopeEvents.map((event) => event.task_id)).size !== 4
  ) {
    throw new Error(`same session with distinct canonical envelopes must retain two task boundaries\n${JSON.stringify({ distinctEnvelopeResult, distinctEnvelopeEvents }, null, 2)}`);
  }
  const distinctEnvelopeReport = summarizeStore(writeRoot, eventStore, "same-session-distinct-tasks");
  if (distinctEnvelopeReport.summary.tasks_reviewed !== 4) {
    throw new Error(`same-session Stop boundaries must remain two tasks in the summarizer\n${JSON.stringify(distinctEnvelopeReport.summary, null, 2)}`);
  }

  const candidateRoot = resolve(fixtureRoot, "candidate");
  const candidateStore = resolve(candidateRoot, "events.jsonl");
  mkdirSync(candidateRoot, { recursive: true });
  const candidateTranscriptPath = resolve(candidateRoot, "transcript.jsonl");
  writeFileSync(candidateTranscriptPath, `${JSON.stringify({ type: "assistant", uuid: "candidate-turn-a" })}\n`);
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
      transcript_path: candidateTranscriptPath,
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
      transcript_path: candidateTranscriptPath,
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
  writeFileSync(candidateTranscriptPath, `${JSON.stringify({ type: "assistant", uuid: "candidate-turn-b" })}\n`, { flag: "a" });
  const laterSameCandidateResult = resultJson(
    "same candidate on a later transcript turn",
    runRecorder(candidateRoot, ["--event-kind", "task_stop", "--event-store", candidateStore, "--print-result"], {
      session_id: "S-CANDIDATE",
      transcript_path: candidateTranscriptPath,
      hook_event_name: "Stop",
      last_assistant_message: envelope({ metrics_event_candidate: updatedCandidate }),
    }),
  );
  const laterCandidateEvents = readEvents(candidateStore);
  if (
    laterSameCandidateResult.status !== "recorded" ||
    laterCandidateEvents.length !== 2 ||
    new Set(laterCandidateEvents.map((event) => event.event_id)).size !== 2 ||
    new Set(laterCandidateEvents.map((event) => event.task_id)).size !== 2
  ) {
    throw new Error(`the same candidate event ID on a later transcript turn must be scoped to a new runtime task\n${JSON.stringify({ laterSameCandidateResult, laterCandidateEvents }, null, 2)}`);
  }

  const boundaryRoot = resolve(fixtureRoot, "task-boundary");
  const boundaryStore = resolve(boundaryRoot, "events.jsonl");
  mkdirSync(boundaryRoot, { recursive: true });
  const postToolResult = resultJson(
    "task boundary PostToolUse",
    runRecorder(boundaryRoot, ["--event-kind", "command_attempt", "--hook-event", "PostToolUse", "--event-store", boundaryStore, "--print-result"], {
      session_id: "S-BOUNDARY",
      hook_event_name: "PostToolUse",
      tool_input: { command: "npm test" },
    }),
  );
  const boundaryCandidate = normalizedCandidate({
    event_id: "task-result:boundary-fixture",
    task_id: "TASK-BOUNDARY-CANDIDATE",
  });
  const boundaryStopInput = {
    session_id: "S-BOUNDARY",
    hook_event_name: "Stop",
    last_assistant_message: envelope({ metrics_event_candidate: boundaryCandidate }),
  };
  const concurrentBoundaryStops = await Promise.all([
    runRecorderAsync(boundaryRoot, ["--event-kind", "task_stop", "--hook-event", "Stop", "--event-store", boundaryStore, "--print-result"], boundaryStopInput),
    runRecorderAsync(boundaryRoot, ["--event-kind", "task_stop", "--hook-event", "Stop", "--event-store", boundaryStore, "--print-result"], boundaryStopInput),
  ]);
  const boundaryStopResults = concurrentBoundaryStops.map((result, index) => resultJson(`task boundary concurrent candidate Stop ${index}`, result));
  const boundaryEvents = readEvents(boundaryStore);
  const boundaryReport = summarizeStore(boundaryRoot, boundaryStore, "post-tool-candidate-stop");
  if (
    postToolResult.status !== "recorded" ||
    boundaryStopResults.filter((result) => result.status === "recorded").length !== 1 ||
    boundaryStopResults.some((result) => !["recorded", "updated", "unchanged"].includes(result.status)) ||
    boundaryEvents.length !== 2 ||
    new Set(boundaryEvents.map((event) => event.task_id)).size !== 1 ||
    boundaryReport.summary.tasks_reviewed !== 1
  ) {
    throw new Error(`PostToolUse and candidate Stop must share one task while duplicate Stops converge\n${JSON.stringify({ boundaryEvents, summary: boundaryReport.summary }, null, 2)}`);
  }

  const expiredClaimRoot = resolve(fixtureRoot, "expired-stop-claim");
  const expiredClaimStore = resolve(expiredClaimRoot, "events.jsonl");
  mkdirSync(expiredClaimRoot, { recursive: true });
  const expiredClaimInput = {
    session_id: "S-EXPIRED-STOP-CLAIM",
    hook_event_name: "Stop",
    last_assistant_message: envelope(),
  };
  const firstExpiredClaimResult = resultJson(
    "initial fallback Stop claim",
    runRecorder(expiredClaimRoot, ["--event-kind", "task_stop", "--hook-event", "Stop", "--event-store", expiredClaimStore, "--print-result"], expiredClaimInput),
  );
  const boundaryStatePath = resolve(expiredClaimRoot, ".agent-spectrum-kernel/runtime/task-boundaries.json");
  const boundaryState = JSON.parse(readFileSync(boundaryStatePath, "utf8"));
  const [sessionState] = Object.values(boundaryState.sessions);
  sessionState.last_stop_claimed_at_ms = 0;
  writeFileSync(boundaryStatePath, `${JSON.stringify(boundaryState)}\n`);
  const restartedExpiredClaimResult = resultJson(
    "expired fallback Stop claim after process restart",
    runRecorder(expiredClaimRoot, ["--event-kind", "task_stop", "--hook-event", "Stop", "--event-store", expiredClaimStore, "--print-result"], expiredClaimInput),
  );
  const expiredClaimEvents = readEvents(expiredClaimStore);
  if (
    firstExpiredClaimResult.status !== "recorded" ||
    restartedExpiredClaimResult.status !== "recorded" ||
    expiredClaimEvents.length !== 2 ||
    new Set(expiredClaimEvents.map((event) => event.task_id)).size !== 2
  ) {
    throw new Error(`an expired fallback Stop claim must not survive as an indefinite duplicate across process restarts\n${JSON.stringify({ firstExpiredClaimResult, restartedExpiredClaimResult, expiredClaimEvents }, null, 2)}`);
  }

  const signalRoot = resolve(fixtureRoot, "controlled-signals");
  const signalStore = resolve(signalRoot, "events.jsonl");
  mkdirSync(signalRoot, { recursive: true });
  const signalCandidate = normalizedCandidate({
    event_id: "task-result:controlled-signal",
    task_id: "TASK-CONTROLLED-SIGNAL",
    skills_used: ["review-router", "review-architecture-impact", "review-domain-impact"],
    routing_result: {
      operating_mode: "delivery_quality",
      primary_skill: "review-router",
      change_signals: [
        { signal: "public_api_change", evidence: "public API changed" },
        { signal: "customer-4821", evidence: "uncontrolled customer identifier" },
      ],
      required_gates: ["review-architecture-impact"],
      executed_gates: ["review-architecture-impact"],
      required_gate_routes: [{ gate: "review-architecture-impact", reason: "public API changed", trigger_signals: ["public_api_change", "customer-4821"] }],
    },
    gate_decisions: [
      {
        gate: "review-architecture-impact",
        status: "executed",
        judgment: "Architecture gate executed for the public API change.",
        triggering_signals: ["public_api_change", "customer-4821"],
      },
      {
        gate: "review-domain-impact",
        status: "skipped",
        judgment: "No domain behavior signal.",
        reason_category: "no_trigger_signal",
      },
    ],
  });
  const signalResult = resultJson(
    "controlled signal collection",
    runRecorder(signalRoot, ["--event-kind", "task_stop", "--hook-event", "Stop", "--event-store", signalStore, "--print-result"], {
      session_id: "S-CONTROLLED-SIGNAL",
      hook_event_name: "Stop",
      last_assistant_message: envelope({ metrics_event_candidate: signalCandidate }),
    }),
  );
  const [signalEvent] = readEvents(signalStore);
  const signalReport = summarizeStore(signalRoot, signalStore, "controlled-signal-summary");
  if (
    signalResult.status !== "recorded" ||
    signalEvent.routing_result.change_signals?.map((item) => item.signal).join(",") !== "public_api_change" ||
    signalEvent.routing_result.required_gate_routes?.[0]?.trigger_signals?.join(",") !== "public_api_change" ||
    signalEvent.gate_decisions?.[0]?.triggering_signals?.join(",") !== "public_api_change" ||
    JSON.stringify(signalEvent).includes("customer-4821") ||
    signalReport.skill_usage.over_processing_count !== 0 ||
    signalReport.gate_decision_summary.missing_skip_reason_count !== 0
  ) {
    throw new Error(`collector and summarizer must preserve controlled signal meaning and controlled skip reasons\n${JSON.stringify({ signalEvent, summary: signalReport.gate_decision_summary, skillUsage: signalReport.skill_usage }, null, 2)}`);
  }

  for (const referenceCount of [49, 50]) {
    const referenceRoot = resolve(fixtureRoot, `reference-boundary-${referenceCount}`);
    const referenceStore = resolve(referenceRoot, "events.jsonl");
    mkdirSync(referenceRoot, { recursive: true });
    const referenceCandidate = normalizedCandidate({
      event_id: `task-result:reference-boundary-${referenceCount}`,
      task_id: `TASK-REFERENCE-${referenceCount}`,
      evidence_references: Array.from({ length: referenceCount }, (_, index) => `reference-${index}`),
    });
    const referenceResult = resultJson(
      `${referenceCount} evidence references plus hook reference`,
      runRecorder(referenceRoot, ["--event-kind", "task_stop", "--hook-event", "Stop", "--event-store", referenceStore, "--print-result"], {
        session_id: `S-REFERENCE-${referenceCount}`,
        hook_event_name: "Stop",
        last_assistant_message: envelope({
          evidence_status: { checked: [], missing: [] },
          metrics_event_candidate: referenceCandidate,
        }),
      }),
    );
    const [referenceEvent] = readEvents(referenceStore);
    if (
      referenceResult.status !== "recorded" ||
      referenceEvent.evidence_references.length !== 50 ||
      !referenceEvent.evidence_references.includes("claude_hook:Stop")
    ) {
      throw new Error(`${referenceCount} candidate references plus the controlled hook reference must remain schema-valid\n${JSON.stringify(referenceEvent, null, 2)}`);
    }
  }

  const pathLimitCases = [
    { label: "50", configuredValue: "50" },
    { label: "51", configuredValue: "51" },
    { label: "100", configuredValue: "100" },
    { label: "negative", configuredValue: "-1" },
    { label: "non-numeric", configuredValue: "not-a-number" },
  ];
  const manyPaths = Array.from({ length: 100 }, (_, index) => ({ file_path: `src/path-${index}.mjs` }));
  for (const { label, configuredValue } of pathLimitCases) {
    const pathRoot = resolve(fixtureRoot, `path-limit-${label}`);
    const pathStore = resolve(pathRoot, "events.jsonl");
    const pathConfig = resolve(pathRoot, "observability.yml");
    mkdirSync(pathRoot, { recursive: true });
    writeFileSync(pathConfig, `capture:\n  max_paths_per_event: ${configuredValue}\n`);
    const hookPathResult = resultJson(
      `hook path limit ${label}`,
      runRecorder(pathRoot, ["--event-kind", "file_change", "--hook-event", "PostToolUse", "--config", pathConfig, "--event-store", pathStore, "--print-result"], {
        session_id: `S-PATH-LIMIT-${label}`,
        hook_event_name: "PostToolUse",
        tool_input: { edits: manyPaths },
      }),
    );
    const pathCandidate = normalizedCandidate({
      event_id: `task-result:path-limit-${label}`,
      task_id: `TASK-PATH-LIMIT-${label}`,
      changed_file_summary: {
        count: 50,
        paths: manyPaths.slice(0, 50).map((item) => item.file_path),
      },
    });
    const candidatePathResult = resultJson(
      `candidate path limit ${label}`,
      runRecorder(pathRoot, ["--event-kind", "task_stop", "--hook-event", "Stop", "--config", pathConfig, "--event-store", pathStore, "--print-result"], {
        session_id: `S-PATH-LIMIT-${label}`,
        hook_event_name: "Stop",
        last_assistant_message: envelope({ metrics_event_candidate: pathCandidate }),
      }),
    );
    const [hookPathEvent, candidatePathEvent] = readEvents(pathStore);
    if (
      hookPathResult.status !== "recorded" ||
      candidatePathResult.status !== "recorded" ||
      hookPathEvent.changed_file_summary?.paths?.length !== 50 ||
      candidatePathEvent.changed_file_summary?.paths?.length !== 50
    ) {
      throw new Error(`configured path limit ${label} must normalize to a schema-safe 50 paths\n${JSON.stringify({ hookPathResult, candidatePathResult, events: readEvents(pathStore) }, null, 2)}`);
    }
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

  const invalidBoundaryCases = [
    {
      label: "missing",
      reason: "canonical_task_result_missing",
      message: "No structured task result.",
    },
    {
      label: "malformed",
      reason: "canonical_task_result_malformed",
      message: "Execution Envelope:\n```json\n{not-json}\n```",
    },
    {
      label: "invalid",
      reason: "canonical_task_result_invalid",
      message: envelope({ route: {} }),
    },
  ];
  for (const boundaryCase of invalidBoundaryCases) {
    const invalidBoundaryRoot = resolve(fixtureRoot, `invalid-boundary-${boundaryCase.label}`);
    const invalidBoundaryStore = resolve(invalidBoundaryRoot, "events.jsonl");
    const invalidBoundaryTranscript = resolve(invalidBoundaryRoot, "transcript.jsonl");
    mkdirSync(invalidBoundaryRoot, { recursive: true });
    writeFileSync(invalidBoundaryTranscript, `${JSON.stringify({ type: "assistant", uuid: `${boundaryCase.label}-turn-a` })}\n`);
    const sessionId = `S-INVALID-BOUNDARY-${boundaryCase.label}`;
    const taskAResult = resultJson(
      `${boundaryCase.label} boundary task A command`,
      runRecorder(invalidBoundaryRoot, ["--event-kind", "command_attempt", "--hook-event", "PostToolUse", "--event-store", invalidBoundaryStore, "--print-result"], {
        session_id: sessionId,
        transcript_path: invalidBoundaryTranscript,
        hook_event_name: "PostToolUse",
        tool_input: { command: "echo task-a" },
      }),
    );
    const invalidStopInput = {
      session_id: sessionId,
      transcript_path: invalidBoundaryTranscript,
      hook_event_name: "Stop",
      last_assistant_message: boundaryCase.message,
    };
    const duplicateInvalidStops = await Promise.all([
      runRecorderAsync(invalidBoundaryRoot, ["--event-kind", "task_stop", "--hook-event", "Stop", "--event-store", invalidBoundaryStore, "--print-result", "--non-blocking"], invalidStopInput),
      runRecorderAsync(invalidBoundaryRoot, ["--event-kind", "task_stop", "--hook-event", "Stop", "--event-store", invalidBoundaryStore, "--print-result", "--non-blocking"], invalidStopInput),
    ]);
    const invalidStopResults = duplicateInvalidStops.map((result, index) => resultJson(`${boundaryCase.label} duplicate invalid Stop ${index}`, result));
    writeFileSync(invalidBoundaryTranscript, `${JSON.stringify({ type: "assistant", uuid: `${boundaryCase.label}-turn-b` })}\n`, { flag: "a" });
    const taskBCommandResult = resultJson(
      `${boundaryCase.label} boundary task B command`,
      runRecorder(invalidBoundaryRoot, ["--event-kind", "command_attempt", "--hook-event", "PostToolUse", "--event-store", invalidBoundaryStore, "--print-result"], {
        session_id: sessionId,
        transcript_path: invalidBoundaryTranscript,
        hook_event_name: "PostToolUse",
        tool_input: { command: "echo task-b" },
      }),
    );
    const taskBStopResult = resultJson(
      `${boundaryCase.label} boundary task B Stop`,
      runRecorder(invalidBoundaryRoot, ["--event-kind", "task_stop", "--hook-event", "Stop", "--event-store", invalidBoundaryStore, "--print-result"], {
        session_id: sessionId,
        transcript_path: invalidBoundaryTranscript,
        hook_event_name: "Stop",
        last_assistant_message: envelope(),
      }),
    );
    const invalidBoundaryEvents = readEvents(invalidBoundaryStore);
    const invalidBoundaryReport = summarizeStore(invalidBoundaryRoot, invalidBoundaryStore, `${boundaryCase.label}-invalid-stop-boundary`);
    const [taskAEvent, taskBCommandEvent, taskBStopEvent] = invalidBoundaryEvents;
    const invalidBoundaryState = JSON.parse(readFileSync(resolve(invalidBoundaryRoot, ".agent-spectrum-kernel/runtime/task-boundaries.json"), "utf8"));
    const [invalidBoundarySession] = Object.values(invalidBoundaryState.sessions);
    if (
      taskAResult.status !== "recorded" ||
      invalidStopResults.some((result) => result.status !== "skip" || result.reason !== boundaryCase.reason) ||
      taskBCommandResult.status !== "recorded" ||
      taskBStopResult.status !== "recorded" ||
      invalidBoundaryEvents.length !== 3 ||
      taskAEvent.task_id === taskBCommandEvent.task_id ||
      taskBCommandEvent.task_id !== taskBStopEvent.task_id ||
      invalidBoundaryReport.summary.tasks_reviewed !== 2 ||
      invalidBoundaryReport.summary.command_attempts !== 2 ||
      invalidBoundarySession.next_segment !== 2
    ) {
      throw new Error(`${boundaryCase.label} Stop must skip its event, close task A exactly once, and keep task B separate\n${JSON.stringify({ invalidStopResults, invalidBoundaryEvents, summary: invalidBoundaryReport.summary, invalidBoundarySession }, null, 2)}`);
    }
  }

  const boundedStateRoot = resolve(fixtureRoot, "bounded-task-boundary-state");
  const boundedStateStore = resolve(boundedStateRoot, "events.jsonl");
  const boundedStatePath = resolve(boundedStateRoot, ".agent-spectrum-kernel/runtime/task-boundaries.json");
  mkdirSync(dirname(boundedStatePath), { recursive: true });
  const seededSessions = {};
  for (let index = 0; index < 160; index += 1) {
    const sessionId = `S-EVICT-${index}`;
    const sessionKey = createHash("sha256").update(sessionId).digest("hex");
    seededSessions[sessionKey] = {
      generation: `seed-generation-${index}`,
      next_segment: 3,
      segment_open: false,
      last_touched_at_ms: 0,
      duplicate_open: false,
    };
  }
  const openSessionId = "S-BOUNDED-OPEN";
  const openSessionKey = createHash("sha256").update(openSessionId).digest("hex");
  seededSessions[openSessionKey] = {
    generation: "active-open-generation",
    next_segment: 1,
    segment_open: true,
    last_touched_at_ms: Date.now(),
    duplicate_open: false,
  };
  writeFileSync(boundedStatePath, `${JSON.stringify({ schema_version: "1.0.0", sessions: seededSessions })}\n`);
  const concurrentSessionIds = Array.from({ length: 20 }, (_, index) => `S-BOUNDED-CONCURRENT-${index}`);
  const concurrentBoundaryResults = await Promise.all(concurrentSessionIds.map((sessionId) => runRecorderAsync(
    boundedStateRoot,
    ["--event-kind", "task_stop", "--hook-event", "Stop", "--event-store", boundedStateStore, "--print-result", "--non-blocking"],
    { session_id: sessionId, hook_event_name: "Stop", last_assistant_message: envelope() },
  )));
  const boundedOutputs = concurrentBoundaryResults.map((result, index) => resultJson(`bounded state concurrent session ${index}`, result));
  const prunedBoundaryState = JSON.parse(readFileSync(boundedStatePath, "utf8"));
  const activeSessionKeys = concurrentSessionIds.map((sessionId) => createHash("sha256").update(sessionId).digest("hex"));
  const evictedSessionId = "S-EVICT-0";
  const evictedSessionKey = createHash("sha256").update(evictedSessionId).digest("hex");
  if (
    boundedOutputs.some((output) => output.status !== "recorded") ||
    Object.keys(prunedBoundaryState.sessions).length > 128 ||
    readFileSync(boundedStatePath).length > 131_072 ||
    !prunedBoundaryState.sessions[openSessionKey] ||
    activeSessionKeys.some((sessionKey) => !prunedBoundaryState.sessions[sessionKey]) ||
    prunedBoundaryState.sessions[evictedSessionKey]
  ) {
    throw new Error(`concurrent boundary pruning must preserve open sessions and active claims inside the bounded state limits\n${JSON.stringify({ outputs: boundedOutputs, sessionCount: Object.keys(prunedBoundaryState.sessions).length, stateBytes: readFileSync(boundedStatePath).length }, null, 2)}`);
  }
  const resumedCommandResult = resultJson(
    "evicted session resumes with a command",
    runRecorder(boundedStateRoot, ["--event-kind", "command_attempt", "--hook-event", "PostToolUse", "--event-store", boundedStateStore, "--print-result"], {
      session_id: evictedSessionId,
      hook_event_name: "PostToolUse",
      tool_input: { command: "echo resumed-session" },
    }),
  );
  const resumedStopResult = resultJson(
    "evicted session resumes with a Stop",
    runRecorder(boundedStateRoot, ["--event-kind", "task_stop", "--hook-event", "Stop", "--event-store", boundedStateStore, "--print-result"], {
      session_id: evictedSessionId,
      hook_event_name: "Stop",
      last_assistant_message: envelope(),
    }),
  );
  const resumedEvents = readEvents(boundedStateStore).slice(-2);
  const resumedBoundaryState = JSON.parse(readFileSync(boundedStatePath, "utf8"));
  const oldRawTaskId = `session-boundary:${evictedSessionKey}:seed-generation-0:3`;
  const oldHashedTaskId = `task:sha256:${createHash("sha256").update(oldRawTaskId).digest("hex")}`;
  if (
    resumedCommandResult.status !== "recorded" ||
    resumedStopResult.status !== "recorded" ||
    resumedEvents.length !== 2 ||
    resumedEvents[0].task_id !== resumedEvents[1].task_id ||
    resumedEvents[0].task_id === oldHashedTaskId ||
    resumedBoundaryState.sessions[evictedSessionKey]?.generation === "seed-generation-0" ||
    Object.keys(resumedBoundaryState.sessions).length > 128 ||
    readFileSync(boundedStatePath).length > 131_072
  ) {
    throw new Error(`an evicted session must resume in a fresh generation without exceeding state bounds\n${JSON.stringify({ resumedCommandResult, resumedStopResult, resumedEvents, resumedSession: resumedBoundaryState.sessions[evictedSessionKey] }, null, 2)}`);
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

  const legacyRecoveryRoot = resolve(fixtureRoot, "legacy-health-recovery");
  const legacyRecoveryPath = resolve(legacyRecoveryRoot, ".agent-spectrum-kernel/runtime-health.jsonl");
  mkdirSync(dirname(legacyRecoveryPath), { recursive: true });
  const legacyErrorCode = "legacy-only-error";
  writeFileSync(legacyRecoveryPath, `${JSON.stringify({
    schema_version: "1.0.0",
    occurred_at: new Date().toISOString(),
    component: "ai-metrics-record",
    status: "error",
    error_code: legacyErrorCode,
  })}\n`);
  const doctorBeforeRecovery = spawnSync(process.execPath, [doctor, "--target", legacyRecoveryRoot], { encoding: "utf8" });
  if (!doctorBeforeRecovery.stdout.includes(`adapter runtime health issue: ai-metrics-record ${legacyErrorCode}`)) {
    throw new Error(`doctor should expose the unresolved legacy-only health error before recovery\n${doctorBeforeRecovery.stdout}`);
  }
  const legacyRecoveryResult = runRecorder(
    legacyRecoveryRoot,
    ["--event-kind", "task_stop", "--non-blocking"],
    { session_id: "S-LEGACY-RECOVERY", hook_event_name: "Stop", last_assistant_message: envelope() },
  );
  assertPass("successful collector recovers legacy health", legacyRecoveryResult);
  const doctorAfterRecovery = spawnSync(process.execPath, [doctor, "--target", legacyRecoveryRoot], { encoding: "utf8" });
  if (doctorAfterRecovery.stdout.includes(`adapter runtime health issue: ai-metrics-record ${legacyErrorCode}`)) {
    throw new Error(`a successful collector run must close a legacy-only health error through the runtime-owned log\n${doctorAfterRecovery.stdout}`);
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
