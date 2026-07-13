#!/usr/bin/env node
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { inspectExecutionEnvelope } from "./execution-envelope.mjs";
import { DEFAULT_RUNTIME_EVENT_STORE, resolveObservabilityPath } from "./observability-paths.mjs";

const DEFAULT_CONFIG = {
  enabled: true,
  storage: {
    event_store: DEFAULT_RUNTIME_EVENT_STORE,
  },
  capture: {
    task_boundary_required: true,
    allow_session_id_task_boundary: true,
    task_boundary_source: "session_id",
    record_file_change_events: true,
    record_verification_attempts: true,
    record_command_attempts: true,
    record_task_stop_candidates: true,
    record_command_hash: false,
    record_command_preview: false,
    max_paths_per_event: 50,
  },
  privacy: {
    raw_prompt_storage: false,
    secrets_storage: false,
    customer_data_storage: false,
    personal_data_storage: false,
    full_file_contents: false,
    full_command_output: false,
  },
  external_publication: {
    enabled: false,
  },
  runtime_health: {
    freshness_hours: 24,
    max_entries: 100,
  },
};

const VERIFICATION_COMMAND_PATTERN = /\b(test|lint|typecheck|tsc|build|validate|check|pytest|vitest|jest|mocha|cargo test|go test|mvn test|gradle test)\b/i;
const UNSAFE_COMMAND_PREVIEW_PATTERN = /\b(api[_-]?key|token|secret|password|passwd|authorization|bearer|_authToken|npm publish|curl\s+-H)\b|(?:^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]+/i;
const ALLOWED_TASK_TYPES = new Set(["implementation", "review", "refactor", "investigation", "adoption", "documentation", "handoff", "validation", "report", "ledger_refresh", "other"]);

function parseArgs(argv) {
  const args = {
    config: "docs/ai/observability-config.yml",
    projectRoot: process.env.CLAUDE_PROJECT_DIR || "",
    eventStore: null,
    eventKind: "task_event",
    hookEvent: null,
    taskId: process.env.AI_TASK_ID || "",
    taskType: process.env.AI_TASK_TYPE || "other",
    skills: process.env.AI_SKILLS_USED ? process.env.AI_SKILLS_USED.split(",").map((value) => value.trim()).filter(Boolean) : [],
    routingResultJson: process.env.AI_ROUTING_RESULT_JSON || "",
    reviewResultJson: process.env.AI_REVIEW_RESULT_JSON || "",
    gateDecisionsJson: process.env.AI_GATE_DECISIONS_JSON || "",
    nonBlocking: false,
    dryRun: false,
    printResult: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config") {
      args.config = argv[++i];
    } else if (arg === "--project-root") {
      args.projectRoot = argv[++i];
    } else if (arg === "--event-store") {
      args.eventStore = argv[++i];
    } else if (arg === "--event-kind") {
      args.eventKind = argv[++i];
    } else if (arg === "--hook-event") {
      args.hookEvent = argv[++i];
    } else if (arg === "--task-id") {
      args.taskId = argv[++i];
    } else if (arg === "--task-type") {
      args.taskType = argv[++i];
    } else if (arg === "--skills") {
      args.skills = argv[++i].split(",").map((value) => value.trim()).filter(Boolean);
    } else if (arg === "--routing-result-json") {
      args.routingResultJson = argv[++i];
    } else if (arg === "--review-result-json") {
      args.reviewResultJson = argv[++i];
    } else if (arg === "--gate-decisions-json") {
      args.gateDecisionsJson = argv[++i];
    } else if (arg === "--non-blocking") {
      args.nonBlocking = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
      args.printResult = true;
    } else if (arg === "--print-result") {
      args.printResult = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/ai-metrics-record.mjs [options]

Options:
  --event-kind <kind>       file_change | command_attempt | verification_attempt | task_stop | ledger_refresh | report
  --hook-event <name>       Claude hook event name.
  --task-id <id>            Optional explicit task boundary. Defaults to configured hook boundary source.
  --task-type <type>        implementation | review | validation | report | other.
  --skills <csv>            Skills used by this task.
  --routing-result-json <json>
                            Optional routing summary without raw prompt text.
  --review-result-json <json>
                            Optional review decision summary without raw review text.
  --gate-decisions-json <json>
                            Optional structured gate decisions without raw review text.
  --event-store <path>      JSONL event store path. Defaults to runtime-owned local storage.
  --config <path>           Observability config. Defaults to docs/ai/observability-config.yml.
  --project-root <path>     Adopting project root for runtime-health; CLAUDE_PROJECT_DIR takes precedence.
  --non-blocking            Exit successfully and stay silent if metrics recording fails.
  --dry-run                 Print event without writing.
  --print-result            Print result JSON.
`);
}

function readStdinJson() {
  if (process.stdin.isTTY) {
    return {};
  }
  const input = readFileSync(0, "utf8").trim();
  if (!input) {
    return {};
  }
  try {
    return JSON.parse(input);
  } catch {
    return {};
  }
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  return trimmed.replace(/^["']|["']$/g, "");
}

function readConfig(path) {
  const config = structuredClone(DEFAULT_CONFIG);
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    return config;
  }
  const lines = readFileSync(absolutePath, "utf8").split(/\r?\n/);
  const sectionStack = [];
  for (const rawLine of lines) {
    const withoutComment = rawLine.replace(/\s+#.*$/, "");
    if (!withoutComment.trim()) continue;
    const match = withoutComment.match(/^(\s*)([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const indent = match[1].length;
    const key = match[2];
    const value = match[3];
    const level = Math.floor(indent / 2);
    sectionStack.length = level;
    if (value === "") {
      sectionStack[level] = key;
      continue;
    }
    const pathParts = [...sectionStack.slice(0, level), key];
    assignConfig(config, pathParts, parseScalar(value));
  }
  return config;
}

function assignConfig(config, pathParts, value) {
  let cursor = config;
  for (const part of pathParts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== "object") {
      cursor[part] = {};
    }
    cursor = cursor[part];
  }
  cursor[pathParts.at(-1)] = value;
}

function resolveTaskId(args, hookInput, config) {
  if (args.taskId) return args.taskId;
  if (typeof hookInput.task_id === "string" && hookInput.task_id) return hookInput.task_id;
  const boundarySource = config.capture.task_boundary_source || "session_id";
  if (boundarySource === "session_id" && config.capture.allow_session_id_task_boundary && hookInput.session_id) {
    return `session:${hookInput.session_id}`;
  }
  if (!config.capture.task_boundary_required) return `session:${hookInput.session_id || "unknown"}`;
  return "";
}

function shouldRecord(args, hookInput, config) {
  if (!config.enabled) {
    return { ok: false, reason: "disabled" };
  }
  if (config.external_publication?.enabled) {
    return { ok: false, reason: "external_publication_enabled_requires_risk_gate" };
  }
  if (config.privacy?.raw_prompt_storage || config.privacy?.secrets_storage || config.privacy?.customer_data_storage || config.privacy?.personal_data_storage) {
    return { ok: false, reason: "unsafe_privacy_default" };
  }
  const taskId = resolveTaskId(args, hookInput, config);
  if (!taskId) {
    return { ok: false, reason: "missing_task_boundary" };
  }
  if (args.eventKind === "file_change" && !config.capture.record_file_change_events) {
    return { ok: false, reason: "file_change_capture_disabled" };
  }
  if (args.eventKind === "verification_attempt" && !config.capture.record_verification_attempts) {
    return { ok: false, reason: "verification_capture_disabled" };
  }
  if (args.eventKind === "command_attempt" && config.capture.record_command_attempts === false) {
    return { ok: false, reason: "command_attempt_capture_disabled" };
  }
  if (args.eventKind === "task_stop" && !config.capture.record_task_stop_candidates) {
    return { ok: false, reason: "task_stop_capture_disabled" };
  }
  if (args.eventKind === "verification_attempt") {
    const command = hookInput.tool_input?.command ?? "";
    if (!VERIFICATION_COMMAND_PATTERN.test(command)) {
      return { ok: false, reason: "not_a_verification_command" };
    }
  }
  return { ok: true, taskId };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function parseJsonOption(value, fallback = {}) {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function collectCanonicalTaskResult(args, hookInput) {
  if (args.eventKind !== "task_stop") return { status: "not_applicable", envelope: null };
  const result = inspectExecutionEnvelope(String(hookInput.last_assistant_message ?? ""));
  if (result.status === "parsed") return { status: "parsed", envelope: result.value };
  return {
    status: result.status,
    envelope: null,
    reason: `canonical_task_result_${result.status}`,
  };
}

function changedPaths(hookInput, maxPaths) {
  const input = hookInput.tool_input ?? {};
  return unique([
    input.file_path,
    input.path,
    ...(Array.isArray(input.edits) ? input.edits.map((edit) => edit.file_path || edit.path) : []),
  ]).slice(0, maxPaths);
}

function commandKind(command) {
  const normalized = String(command).toLowerCase();
  if (/\b(lint|eslint|ruff|rubocop)\b/.test(normalized)) return "lint";
  if (/\b(typecheck|tsc)\b/.test(normalized)) return "typecheck";
  if (/\b(build|webpack|vite build|next build)\b/.test(normalized)) return "build";
  if (/\b(validate|check)\b/.test(normalized)) return "validate";
  if (/\b(test|pytest|vitest|jest|mocha|cargo test|go test|mvn test|gradle test)\b/.test(normalized)) return "test";
  return "unknown";
}

function commandHash(command) {
  return createHash("sha256").update(String(command)).digest("hex");
}

function safeCommandPreview(command) {
  const value = String(command).trim().replace(/\s+/g, " ");
  if (!value || value.length > 120 || UNSAFE_COMMAND_PREVIEW_PATTERN.test(value)) {
    return "";
  }
  if (!/^(npm|pnpm|yarn|bun|node|npx|pytest|vitest|jest|go|cargo|mvn|gradle|make)\b/.test(value)) {
    return "";
  }
  return value;
}

function buildEvent(args, hookInput, config, taskId, envelope = null) {
  const now = new Date().toISOString();
  const paths = changedPaths(hookInput, config.capture.max_paths_per_event ?? 50);
  const command = hookInput.tool_input?.command ?? "";
  const candidate = isPlainObject(envelope?.metrics_event_candidate)
    ? structuredClone(envelope.metrics_event_candidate)
    : null;
  const envelopeSkills = [
    envelope?.route?.internal?.primary,
    ...(Array.isArray(envelope?.route?.internal?.secondary) ? envelope.route.internal.secondary : []),
  ];
  const skills = safeTextList([...(candidate?.skills_used ?? []), ...args.skills, ...envelopeSkills], 100, 120);
  const envelopeRoutingResult = envelope ? {
    operating_mode: envelope.route?.operating_mode,
    primary_skill: envelope.route?.internal?.primary,
    secondary_skills: envelope.route?.internal?.secondary,
    missing_evidence: (envelope.evidence_status?.missing ?? []).map((input) => ({
      input,
      reason: "Canonical task result reported missing evidence.",
    })),
  } : {};
  const routingResult = sanitizeRoutingResult({
    ...(candidate?.routing_result ?? {}),
    ...envelopeRoutingResult,
    ...(hookInput.routing_result ?? {}),
    ...parseJsonOption(args.routingResultJson),
  });
  const reviewResult = sanitizeReviewResult({
    ...(candidate?.review_result ?? {}),
    ...(hookInput.review_result ?? {}),
    ...parseJsonOption(args.reviewResultJson),
  });
  const gateDecisionOption = parseJsonOption(args.gateDecisionsJson, []);
  const gateDecisions = sanitizeGateDecisions([
    ...(Array.isArray(candidate?.gate_decisions) ? candidate.gate_decisions : []),
    ...(Array.isArray(hookInput.gate_decisions) ? hookInput.gate_decisions : []),
    ...(Array.isArray(gateDecisionOption) ? gateDecisionOption : []),
  ]);

  const event = {
    schema_version: "1.0.0",
    event_id: privacySafeText(candidate?.event_id, 200) || eventIdFor(args.eventKind, taskId, now),
    task_id: privacySafeText(candidate?.task_id, 200) || taskId,
    task_type: candidate?.task_type ?? taskTypeFromEnvelope(envelope, args.taskType),
    occurred_at: candidate?.occurred_at ?? now,
    skills_used: skills,
    routing_result: routingResult,
    instruction_quality_metrics: { ...(candidate?.instruction_quality_metrics ?? {}) },
    outcome_metrics: { ...(candidate?.outcome_metrics ?? {}) },
    verification_metrics: sanitizeVerificationMetrics(candidate?.verification_metrics, config),
    debt_movement_metrics: { ...(candidate?.debt_movement_metrics ?? {}) },
    evidence_references: safeTextList([
      ...(candidate?.evidence_references ?? []),
      ...(envelope?.evidence_status?.checked ?? []),
    ], 50, 500),
    privacy_note: {
      raw_prompts_stored: false,
      secrets_stored: false,
      customer_data_stored: false,
      personal_data_stored: false,
      external_publication: false,
      note: "Summarized local event. Raw prompts, secrets, full file contents, and full command output omitted by default.",
    },
  };

  if (candidate?.related_ids) event.related_ids = sanitizeRelatedIds(candidate.related_ids);
  if (candidate?.debt_inventory_snapshot) event.debt_inventory_snapshot = { ...candidate.debt_inventory_snapshot };
  if (typeof candidate?.verification_result_summary === "string") {
    event.verification_result_summary = sanitizeText(candidate.verification_result_summary, 2000);
  }
  if (candidate?.changed_file_summary) {
    const candidatePaths = safeTextList(candidate.changed_file_summary.paths ?? [], config.capture.max_paths_per_event ?? 50, 500);
    event.changed_file_summary = { count: candidatePaths.length, paths: candidatePaths };
  }

  if (Object.keys(reviewResult).length > 0) {
    event.review_result = reviewResult;
  }
  if (gateDecisions.length > 0) {
    event.gate_decisions = gateDecisions;
  }

  if (args.hookEvent) {
    event.evidence_references.push(`claude_hook:${args.hookEvent}`);
  }

  if (paths.length > 0) {
    event.changed_file_summary = {
      count: paths.length,
      paths,
    };
  }

  if (args.eventKind === "verification_attempt") {
    const commandRecord = {
      command_kind: commandKind(command),
    };
    if (config.capture.record_command_hash) {
      commandRecord.command_hash = commandHash(command);
    }
    if (config.capture.record_command_preview) {
      const preview = safeCommandPreview(command);
      if (preview) {
        commandRecord.redacted_command_preview = preview;
      }
    }
    event.verification_metrics.commands_run = [commandRecord];
    event.verification_result_summary = "Verification command attempted; command text and full command output omitted by default.";
  }

  if (args.eventKind === "command_attempt") {
    event.command_attempt_metrics = {
      command_kind: commandKind(command),
      classified_as_verification: false,
    };
    event.command_attempt_summary = "Command attempted; command text and full command output omitted by default. This is not counted as verified work.";
  }

  if (args.eventKind === "task_stop" && !candidate && envelope?.stop_reason?.status === "completed") {
    event.outcome_metrics.task_completed = true;
  }

  if (
    args.eventKind === "task_stop" &&
    !candidate &&
    ((envelope?.evidence_status?.missing?.length ?? 0) > 0 || envelope?.stop_reason?.status === "insufficient_evidence")
  ) {
    event.verification_metrics.insufficient_evidence_reported = true;
  }

  if (args.eventKind === "ledger_refresh") {
    event.task_type = "ledger_refresh";
  }

  if (args.eventKind === "report") {
    event.task_type = "report";
  }

  return event;
}

function eventIdFor(eventKind, taskId, now) {
  if (eventKind !== "task_stop") return `evt:${now}:${randomUUID()}`;
  const digest = createHash("sha256").update(`${taskId}\0task_stop`).digest("hex").slice(0, 24);
  return `evt:task-stop:${digest}`;
}

function taskTypeFromEnvelope(envelope, fallback) {
  if (ALLOWED_TASK_TYPES.has(fallback) && fallback !== "other") return fallback;
  const primary = envelope?.route?.internal?.primary ?? "";
  if (primary === "handoff-generation") return "handoff";
  if (primary === "test-first-verification") return "validation";
  if (primary === "skill-adoption-metrics") return "report";
  if (primary === "improvement-ledger") return "ledger_refresh";
  return {
    "実装": "implementation",
    "レビュー": "review",
    "調査": "investigation",
    "ドキュメント整理": "documentation",
    "知識蓄積": "documentation",
    "運用整理": "report",
  }[envelope?.route?.work_mode] ?? "other";
}

function sanitizeRoutingResult(source) {
  const result = {};
  if (typeof source.operating_mode === "string" && source.operating_mode) {
    result.operating_mode = source.operating_mode;
  }
  if (typeof source.primary_skill === "string" && source.primary_skill) {
    result.primary_skill = source.primary_skill;
  }
  if (typeof source.correct_routing === "boolean") {
    result.correct_routing = source.correct_routing;
  }
  if (Array.isArray(source.change_signals)) {
    result.change_signals = source.change_signals
      .map((item) => sanitizeChangeSignal(item))
      .filter(Boolean)
      .slice(0, 50);
  }
  for (const field of ["secondary_skills", "required_gates", "executed_gates"]) {
    if (Array.isArray(source[field])) {
      result[field] = unique(source[field].filter((value) => typeof value === "string"));
    }
  }
  if (Array.isArray(source.required_gate_routes)) {
    result.required_gate_routes = source.required_gate_routes
      .map((item) => sanitizeRequiredGateRoute(item))
      .filter(Boolean)
      .slice(0, 50);
  }
  if (Array.isArray(source.skipped_heavy_gates)) {
    result.skipped_heavy_gates = source.skipped_heavy_gates
      .map((item) => sanitizeSkippedHeavyGate(item))
      .filter(Boolean)
      .slice(0, 50);
  }
  if (Array.isArray(source.missing_evidence)) {
    result.missing_evidence = source.missing_evidence
      .map((item) => sanitizeMissingEvidence(item))
      .filter(Boolean)
      .slice(0, 50);
  }
  if (Array.isArray(source.skipped_gates)) {
    result.skipped_gates = source.skipped_gates
      .filter((item) => item && typeof item.gate === "string" && typeof item.reason === "string")
      .map((item) => ({ gate: item.gate, reason: item.reason.slice(0, 500) }))
      .slice(0, 50);
  }
  if (Array.isArray(source.gate_applicability)) {
    result.gate_applicability = source.gate_applicability
      .map((item) => sanitizeGateApplicability(item))
      .filter(Boolean)
      .slice(0, 50);
  }
  return result;
}

function sanitizeChangeSignal(item) {
  if (!item || typeof item.signal !== "string" || typeof item.evidence !== "string") {
    return null;
  }
  const signal = sanitizeText(item.signal, 120);
  const evidence = sanitizeText(item.evidence, 500);
  return signal && evidence ? { signal, evidence } : null;
}

function sanitizeRequiredGateRoute(item) {
  if (!item || typeof item.gate !== "string" || typeof item.reason !== "string" || !Array.isArray(item.trigger_signals)) {
    return null;
  }
  const gate = sanitizeText(item.gate, 120);
  const reason = sanitizeText(item.reason, 500);
  const triggerSignals = unique(item.trigger_signals.filter((value) => typeof value === "string").map((value) => sanitizeText(value, 120))).filter(Boolean).slice(0, 20);
  return gate && reason && triggerSignals.length > 0 ? { gate, reason, trigger_signals: triggerSignals } : null;
}

function sanitizeSkippedHeavyGate(item) {
  if (!item || typeof item.gate !== "string" || typeof item.reason !== "string" || typeof item.observed_evidence !== "string") {
    return null;
  }
  const gate = sanitizeText(item.gate, 120);
  const reason = sanitizeText(item.reason, 500);
  const observedEvidence = sanitizeText(item.observed_evidence, 500);
  if (!gate || !reason || !observedEvidence) {
    return null;
  }
  const result = { gate, reason, observed_evidence: observedEvidence };
  if (typeof item.layer === "string") {
    const layer = sanitizeText(item.layer, 120);
    if (layer) result.layer = layer;
  }
  return result;
}

function sanitizeMissingEvidence(item) {
  if (!item || typeof item.input !== "string" || typeof item.reason !== "string") {
    return null;
  }
  const input = sanitizeText(item.input, 120);
  const reason = sanitizeText(item.reason, 500);
  return input && reason ? { input, reason } : null;
}

function sanitizeGateApplicability(item) {
  const allowedStatuses = new Set(["required", "skipped", "insufficient_evidence"]);
  if (!item || typeof item.layer !== "string" || !allowedStatuses.has(item.status) || typeof item.reason !== "string" || typeof item.evidence !== "string") {
    return null;
  }
  const layer = sanitizeText(item.layer, 120);
  const reason = sanitizeText(item.reason, 1000);
  const evidence = sanitizeText(item.evidence, 1000);
  if (!layer || !reason || !evidence) {
    return null;
  }
  const row = {
    layer,
    status: item.status,
    reason,
    evidence,
  };
  if (typeof item.gate === "string") {
    const gate = sanitizeText(item.gate, 120);
    if (gate) {
      row.gate = gate;
    }
  }
  if (Array.isArray(item.trigger_signals)) {
    row.trigger_signals = unique(item.trigger_signals.filter((value) => typeof value === "string").map((value) => sanitizeText(value, 120))).slice(0, 20);
  }
  if (Array.isArray(item.inputs_still_needed)) {
    row.inputs_still_needed = unique(item.inputs_still_needed.filter((value) => typeof value === "string").map((value) => sanitizeText(value, 120))).slice(0, 20);
  }
  return row;
}

function sanitizeReviewResult(source) {
  const result = {};
  const allowedDecisions = new Set(["approve", "approve_with_comments", "request_changes", "block", "insufficient_evidence"]);
  if (allowedDecisions.has(source.decision)) {
    result.decision = source.decision;
  }
  if (Number.isInteger(source.required_fixes_count) && source.required_fixes_count >= 0) {
    result.required_fixes_count = source.required_fixes_count;
  }
  if (Array.isArray(source.insufficient_evidence_layers)) {
    result.insufficient_evidence_layers = unique(source.insufficient_evidence_layers.filter((value) => typeof value === "string")).slice(0, 20);
  }
  return result;
}

function sanitizeGateDecisions(source) {
  const allowedStatuses = new Set(["required", "executed", "skipped", "insufficient_evidence"]);
  const allowedConfidence = new Set(["high", "medium", "low"]);
  const allowedCategories = new Set(["no_trigger_signal", "not_applicable", "covered_by_other_gate", "missing_context", "missing_evidence", "other"]);
  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .map((item) => {
      if (!item || typeof item.gate !== "string" || !allowedStatuses.has(item.status)) {
        return null;
      }
      const gate = sanitizeText(item.gate, 120);
      if (!gate) {
        return null;
      }
      const decision = {
        gate,
        status: item.status,
      };
      if (typeof item.layer === "string" && item.layer) {
        decision.layer = sanitizeText(item.layer, 120);
      }
      if (typeof item.judgment === "string") {
        decision.judgment = sanitizeText(item.judgment, 500);
      }
      for (const field of ["evidence_checked", "triggering_signals", "missing_inputs"]) {
        if (Array.isArray(item[field])) {
          decision[field] = unique(item[field].filter((value) => typeof value === "string").map((value) => sanitizeText(value, 120))).slice(0, 20);
        }
      }
      if (allowedConfidence.has(item.confidence)) {
        decision.confidence = item.confidence;
      }
      if (allowedCategories.has(item.reason_category)) {
        decision.reason_category = item.reason_category;
      }
      return decision;
    })
    .filter(Boolean)
    .slice(0, 100);
}

function sanitizeText(value, maxLength) {
  const sanitized = String(value).replace(/\s+/g, " ").trim().slice(0, maxLength);
  return UNSAFE_COMMAND_PREVIEW_PATTERN.test(sanitized) ? "[redacted]" : sanitized;
}

function privacySafeText(value, maxLength) {
  if (typeof value !== "string") return "";
  const sanitized = value.replace(/\s+/g, " ").trim().slice(0, maxLength);
  return UNSAFE_COMMAND_PREVIEW_PATTERN.test(sanitized) ? "" : sanitized;
}

function safeTextList(values, maxItems, maxLength) {
  return unique((Array.isArray(values) ? values : []).map((value) => privacySafeText(value, maxLength)).filter(Boolean)).slice(0, maxItems);
}

function sanitizeVerificationMetrics(source, config) {
  if (!isPlainObject(source)) return {};
  const result = { ...source };
  if (!Array.isArray(source.commands_run)) return result;
  result.commands_run = source.commands_run.slice(0, 20).map((command) => {
    const record = { command_kind: command.command_kind };
    if (config.capture.record_command_hash && typeof command.command_hash === "string") record.command_hash = command.command_hash;
    if (config.capture.record_command_preview && typeof command.redacted_command_preview === "string") {
      const preview = safeCommandPreview(command.redacted_command_preview);
      if (preview) record.redacted_command_preview = preview;
    }
    return record;
  });
  return result;
}

function sanitizeRelatedIds(source) {
  const result = {};
  for (const field of ["prs", "issues", "improvement_ids", "skill_adoption_metric_ids"]) {
    if (Array.isArray(source[field])) result[field] = safeTextList(source[field], 50, 120);
  }
  return result;
}

function upsertEvent(eventStore, event) {
  mkdirSync(dirname(eventStore), { recursive: true });
  return withEventStoreLock(eventStore, () => {
    const lines = existsSync(eventStore) ? readFileSync(eventStore, "utf8").split(/\r?\n/).filter(Boolean) : [];
    let matchIndex = -1;
    for (const [index, line] of lines.entries()) {
      try {
        if (JSON.parse(line)?.event_id === event.event_id) {
          matchIndex = index;
          break;
        }
      } catch {
        // Preserve malformed historical lines; summary readers report them separately.
      }
    }
    const serialized = JSON.stringify(event);
    if (matchIndex >= 0 && lines[matchIndex] === serialized) return "unchanged";
    if (matchIndex >= 0) lines[matchIndex] = serialized;
    else lines.push(serialized);
    const temporaryPath = `${eventStore}.tmp-${process.pid}-${Date.now()}`;
    try {
      writeFileSync(temporaryPath, `${lines.join("\n")}\n`);
      renameSync(temporaryPath, eventStore);
    } catch (error) {
      try { rmSync(temporaryPath, { force: true }); } catch { /* preserve original error */ }
      throw error;
    }
    return matchIndex >= 0 ? "updated" : "recorded";
  });
}

function withEventStoreLock(eventStore, operation) {
  const lockPath = `${eventStore}.lock`;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    let descriptor = null;
    try {
      descriptor = openSync(lockPath, "wx");
      return operation();
    } catch (error) {
      if (descriptor !== null || error?.code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > 30_000) unlinkSync(lockPath);
      } catch {
        // Another collector may have released the lock between checks.
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    } finally {
      if (descriptor !== null) {
        closeSync(descriptor);
        try { unlinkSync(lockPath); } catch { /* lock cleanup is best-effort */ }
      }
    }
  }
  throw new Error("metrics event store lock timed out");
}

function resolveProjectRoot(args, eventStore = null) {
  if (process.env.CLAUDE_PROJECT_DIR) return resolve(process.env.CLAUDE_PROJECT_DIR);
  if (args.projectRoot) return resolve(args.projectRoot);
  const configPath = resolve(args.config);
  if (configPath.endsWith("/docs/ai/observability-config.yml")) return resolve(dirname(configPath), "../..");
  if (eventStore && eventStore.includes("/docs/ai/")) return resolve(eventStore.slice(0, eventStore.indexOf("/docs/ai/")));
  return process.cwd();
}

function resolveEventStore(args, config) {
  const projectRoot = resolveProjectRoot(args);
  return resolveObservabilityPath(projectRoot, args.eventStore || config.storage.event_store || DEFAULT_CONFIG.storage.event_store);
}

function readRuntimeHealth(path) {
  if (!existsSync(path)) return { entries: [], malformed: 0 };
  const entries = [];
  let malformed = 0;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry && typeof entry === "object") entries.push(entry);
      else malformed += 1;
    } catch {
      malformed += 1;
    }
  }
  return { entries, malformed };
}

function healthKey(entry) {
  return `${entry.component ?? "unknown-component"}:${entry.error_code ?? "runtime_error"}`;
}

function appendRuntimeHealth(path, entry, maxEntries) {
  const { entries } = readRuntimeHealth(path);
  const latest = [...entries].reverse().find((candidate) => healthKey(candidate) === healthKey(entry));
  const now = entry.occurred_at;
  if (latest?.status === entry.status) {
    const index = entries.lastIndexOf(latest);
    const updated = {
      ...latest,
      first_seen_at: latest.first_seen_at || latest.occurred_at || now,
      last_seen_at: now,
      occurrence_count: Math.max(1, Number(latest.occurrence_count) || 1) + 1,
      occurred_at: now,
    };
    entries.splice(index, 1);
    entries.push(updated);
  } else {
    entries.push({
      ...entry,
      first_seen_at: entry.first_seen_at || now,
      last_seen_at: entry.last_seen_at || now,
      occurrence_count: Math.max(1, Number(entry.occurrence_count) || 1),
    });
  }
  mkdirSync(dirname(path), { recursive: true });
  const bounded = entries.slice(-Math.max(1, Number(maxEntries) || 100));
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temporaryPath, `${bounded.map((candidate) => JSON.stringify(candidate)).join("\n")}\n`);
    renameSync(temporaryPath, path);
  } catch (error) {
    try { rmSync(temporaryPath, { force: true }); } catch { /* fail-open health path */ }
    throw error;
  }
}

function runtimeHealthPath(args, eventStore = null) {
  return resolveObservabilityPath(resolveProjectRoot(args, eventStore), "ask-runtime/runtime-health.jsonl");
}

function runtimeHealthEntry(status, errorCode = "non_blocking_metrics_record_failure") {
  return {
    schema_version: "1.0.0",
    occurred_at: new Date().toISOString(),
    component: "ai-metrics-record",
    status,
    error_code: errorCode,
    message: status === "recovered" ? "Metrics collector recovered; raw details omitted by default." : "Metrics collector degraded; raw details omitted by default.",
    privacy_note: {
      raw_prompts_stored: false,
      secrets_stored: false,
      customer_data_stored: false,
      personal_data_stored: false,
      full_command_output_stored: false,
      full_error_message_stored: false,
    },
  };
}

function recordRuntimeHealthRecovery(args, config, eventStore) {
  try {
    const path = runtimeHealthPath(args, eventStore);
    const unresolved = new Map();
    for (const entry of readRuntimeHealth(path).entries) {
      if (entry.component !== "ai-metrics-record") continue;
      if (entry.status === "error") unresolved.set(entry.error_code, entry);
      if (entry.status === "recovered") unresolved.delete(entry.error_code);
    }
    for (const errorCode of unresolved.keys()) {
      appendRuntimeHealth(path, runtimeHealthEntry("recovered", errorCode), config.runtime_health?.max_entries);
    }
  } catch {
    // Health recording remains fail-open for hooks.
  }
}

function main(args) {
  const hookInput = readStdinJson();
  const config = readConfig(args.config);
  if (!config.enabled) {
    if (args.printResult) console.log(JSON.stringify(skipResult("observability_disabled")));
    return;
  }
  const eventStore = resolveEventStore(args, config);
  const taskResult = collectCanonicalTaskResult(args, hookInput);
  if (taskResult.status === "parsed" && taskResult.envelope?.metrics_event_candidate) {
    args.taskId ||= taskResult.envelope.metrics_event_candidate.task_id;
    if (args.taskType === "other") args.taskType = taskResult.envelope.metrics_event_candidate.task_type;
  }
  if (args.eventKind === "task_stop" && taskResult.status !== "parsed") {
    if (args.nonBlocking && ["malformed", "invalid"].includes(taskResult.status)) {
      try {
        appendRuntimeHealth(
          runtimeHealthPath(args, eventStore),
          runtimeHealthEntry("error", taskResult.reason),
          config.runtime_health?.max_entries,
        );
      } catch {
        // A collector degradation must not change the engineering decision.
      }
    }
    if (args.printResult) console.log(JSON.stringify(skipResult(taskResult.reason)));
    return;
  }
  const decision = shouldRecord(args, hookInput, config);
  if (!decision.ok) {
    if (args.printResult) console.log(JSON.stringify(skipResult(decision.reason)));
    return;
  }
  const event = buildEvent(args, hookInput, config, decision.taskId, taskResult.envelope);
  let status = "dry-run";
  if (!args.dryRun) {
    status = upsertEvent(eventStore, event);
    if (args.nonBlocking) recordRuntimeHealthRecovery(args, config, eventStore);
  }
  if (args.printResult) {
    console.log(JSON.stringify({ status, event, capability: capabilityEvidence(args.dryRun ? "runtime_detected" : "executed") }, null, 2));
  }
}

function skipResult(reason) {
  return {
    status: "skip",
    reason,
    capability: {
      capability_id: "local_event_emission",
      support: "unknown",
      evidence_level: "none",
      downgrade_behavior: "unknown",
    },
  };
}

function capabilityEvidence(evidenceLevel) {
  return {
    capability_id: "local_event_emission",
    support: "supported",
    evidence_level: evidenceLevel,
    downgrade_behavior: evidenceLevel === "executed" ? "claim_execution_only" : "claim_runtime_detection_only",
  };
}

let runtimeArgs = null;
try {
  runtimeArgs = parseArgs(process.argv.slice(2));
  main(runtimeArgs);
} catch (error) {
  if (process.argv.includes("--non-blocking")) {
    recordRuntimeHealthFailure(error, runtimeArgs ?? parseArgs(process.argv.slice(2)));
    process.exit(0);
  }
  console.error(`ai-metrics-record failed: ${error.message}`);
  process.exit(1);
}

function recordRuntimeHealthFailure(error, args) {
  try {
    const config = readConfig(args.config);
    const eventStore = resolveEventStore(args, config);
    appendRuntimeHealth(runtimeHealthPath(args, eventStore), runtimeHealthEntry("error"), config.runtime_health?.max_entries);
  } catch {
    // Non-blocking hook failures must not interrupt the developer task.
  }
}
