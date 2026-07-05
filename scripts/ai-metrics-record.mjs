#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";

const DEFAULT_CONFIG = {
  enabled: true,
  storage: {
    event_store: "docs/ai/metrics/events.jsonl",
  },
  capture: {
    task_boundary_required: true,
    allow_session_id_task_boundary: true,
    task_boundary_source: "session_id",
    record_file_change_events: true,
    record_verification_attempts: true,
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
};

const VERIFICATION_COMMAND_PATTERN = /\b(test|lint|typecheck|tsc|build|validate|check|pytest|vitest|jest|mocha|cargo test|go test|mvn test|gradle test)\b/i;
const UNSAFE_COMMAND_PREVIEW_PATTERN = /\b(api[_-]?key|token|secret|password|passwd|authorization|bearer|_authToken|npm publish|curl\s+-H)\b|sk-[A-Za-z0-9_-]+/i;

function parseArgs(argv) {
  const args = {
    config: "docs/ai/observability-config.yml",
    eventStore: null,
    eventKind: "task_event",
    hookEvent: null,
    taskId: process.env.AI_TASK_ID || "",
    taskType: process.env.AI_TASK_TYPE || "other",
    skills: process.env.AI_SKILLS_USED ? process.env.AI_SKILLS_USED.split(",").map((value) => value.trim()).filter(Boolean) : [],
    routingResultJson: process.env.AI_ROUTING_RESULT_JSON || "",
    reviewResultJson: process.env.AI_REVIEW_RESULT_JSON || "",
    dryRun: false,
    printResult: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config") {
      args.config = argv[++i];
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
  --event-kind <kind>       file_change | verification_attempt | task_stop | ledger_refresh | report
  --hook-event <name>       Claude hook event name.
  --task-id <id>            Optional explicit task boundary. Defaults to configured hook boundary source.
  --task-type <type>        implementation | review | validation | report | other.
  --skills <csv>            Skills used by this task.
  --routing-result-json <json>
                            Optional routing summary without raw prompt text.
  --review-result-json <json>
                            Optional review decision summary without raw review text.
  --event-store <path>      JSONL event store path.
  --config <path>           Observability config. Defaults to docs/ai/observability-config.yml.
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

function buildEvent(args, hookInput, config, taskId) {
  const now = new Date().toISOString();
  const paths = changedPaths(hookInput, config.capture.max_paths_per_event ?? 50);
  const command = hookInput.tool_input?.command ?? "";
  const skills = unique(args.skills);
  const routingResult = sanitizeRoutingResult({
    ...(hookInput.routing_result ?? {}),
    ...parseJsonOption(args.routingResultJson),
  });
  const reviewResult = sanitizeReviewResult({
    ...(hookInput.review_result ?? {}),
    ...parseJsonOption(args.reviewResultJson),
  });

  const event = {
    schema_version: "1.0.0",
    event_id: `evt:${now}:${randomUUID()}`,
    task_id: taskId,
    task_type: args.taskType,
    occurred_at: now,
    skills_used: skills,
    routing_result: routingResult,
    outcome_metrics: {},
    verification_metrics: {},
    debt_movement_metrics: {},
    evidence_references: [],
    privacy_note: {
      raw_prompts_stored: false,
      secrets_stored: false,
      customer_data_stored: false,
      personal_data_stored: false,
      external_publication: false,
      note: "Summarized local event. Raw prompts, secrets, full file contents, and full command output omitted by default.",
    },
  };

  if (Object.keys(reviewResult).length > 0) {
    event.review_result = reviewResult;
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

  if (args.eventKind === "task_stop") {
    event.outcome_metrics.task_completed = true;
  }

  if (args.eventKind === "ledger_refresh") {
    event.task_type = "ledger_refresh";
  }

  if (args.eventKind === "report") {
    event.task_type = "report";
  }

  return event;
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
  for (const field of ["secondary_skills", "required_gates", "executed_gates"]) {
    if (Array.isArray(source[field])) {
      result[field] = unique(source[field].filter((value) => typeof value === "string"));
    }
  }
  if (Array.isArray(source.skipped_gates)) {
    result.skipped_gates = source.skipped_gates
      .filter((item) => item && typeof item.gate === "string" && typeof item.reason === "string")
      .map((item) => ({ gate: item.gate, reason: item.reason.slice(0, 500) }))
      .slice(0, 50);
  }
  return result;
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

function appendEvent(eventStore, event) {
  mkdirSync(dirname(eventStore), { recursive: true });
  appendFileSync(eventStore, `${JSON.stringify(event)}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const hookInput = readStdinJson();
  const config = readConfig(args.config);
  const decision = shouldRecord(args, hookInput, config);
  if (!decision.ok) {
    if (args.printResult) {
      console.log(JSON.stringify({ status: "skip", reason: decision.reason }));
    }
    return;
  }
  const event = buildEvent(args, hookInput, config, decision.taskId);
  const eventStore = resolve(args.eventStore || config.storage.event_store || DEFAULT_CONFIG.storage.event_store);
  if (!args.dryRun) {
    appendEvent(eventStore, event);
  }
  if (args.printResult) {
    console.log(JSON.stringify({ status: args.dryRun ? "dry-run" : "recorded", event }, null, 2));
  }
}

try {
  main();
} catch (error) {
  console.error(`ai-metrics-record failed: ${error.message}`);
  process.exit(1);
}
