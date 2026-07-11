#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SIGNAL_REGISTRY_PATH = resolve(REPO_ROOT, "schemas/review-signal-gate-map.json");

function loadSignalRegistry() {
  if (!existsSync(SIGNAL_REGISTRY_PATH)) {
    throw new Error(`Controlled review signal registry is missing: ${SIGNAL_REGISTRY_PATH}`);
  }
  let registry;
  try {
    registry = JSON.parse(readFileSync(SIGNAL_REGISTRY_PATH, "utf8"));
  } catch (error) {
    throw new Error(`Controlled review signal registry is invalid JSON: ${error.message}`);
  }
  if (!Array.isArray(registry.heavy_gates) || !registry.heavy_gates.length || !registry.signal_to_gates || typeof registry.signal_to_gates !== "object") {
    throw new Error("Controlled review signal registry must define heavy_gates and signal_to_gates");
  }
  return registry;
}

const SIGNAL_REGISTRY = loadSignalRegistry();
const HEAVY_REVIEW_GATES = new Set(SIGNAL_REGISTRY.heavy_gates);
const SIGNAL_TO_GATES = new Map(Object.entries(SIGNAL_REGISTRY.signal_to_gates));

function parseArgs(argv) {
  const args = {
    eventStore: "docs/ai/metrics/events.jsonl",
    reportDir: "docs/ai/reports",
    out: "",
    reportType: "weekly",
    periodStart: "",
    periodEnd: "",
    format: "md",
    print: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--event-store") {
      args.eventStore = argv[++i];
    } else if (arg === "--report-dir") {
      args.reportDir = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--report-type") {
      args.reportType = argv[++i];
    } else if (arg === "--period-start") {
      args.periodStart = argv[++i];
    } else if (arg === "--period-end") {
      args.periodEnd = argv[++i];
    } else if (arg === "--format") {
      args.format = argv[++i];
    } else if (arg === "--print") {
      args.print = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  args.periodEnd ||= today;
  args.periodStart ||= args.reportType === "monthly" ? offsetDate(today, -30) : offsetDate(today, -7);
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/ai-metrics-summarize.mjs [options]

Options:
  --event-store <path>      JSONL event store. Defaults to docs/ai/metrics/events.jsonl.
  --report-dir <path>       Report directory. Defaults to docs/ai/reports.
  --out <path>              Output file. Defaults to report-dir/adoption-report-<end>.<md|json>.
  --report-type <type>      weekly | monthly | custom.
  --period-start <date>     YYYY-MM-DD.
  --period-end <date>       YYYY-MM-DD.
  --format <format>         md | json.
  --print                   Print report to stdout.
`);
}

function offsetDate(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function readEvents(path) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    return { events: [], invalidLines: 0 };
  }
  const events = [];
  let invalidLines = 0;
  const lines = readFileSync(absolutePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      invalidLines += 1;
    }
  }
  return { events, invalidLines };
}

function inPeriod(event, start, end) {
  const date = String(event.occurred_at || "").slice(0, 10);
  return date >= start && date <= end;
}

function sum(events, path) {
  return events.reduce((total, event) => total + Number(readPath(event, path) || 0), 0);
}

function readPath(object, path) {
  return path.split(".").reduce((cursor, part) => (cursor && Object.hasOwn(cursor, part) ? cursor[part] : undefined), object);
}

function average(events, path) {
  const values = events
    .map((event) => readPath(event, path))
    .filter((value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)));
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + Number(value), 0) / values.length;
}

function rate(events, path, expected = true) {
  if (events.length === 0) return null;
  const matches = events.filter((event) => readPath(event, path) === expected).length;
  return matches / events.length;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function summarize(events, invalidLines, args) {
  const filtered = events.filter((event) => inPeriod(event, args.periodStart, args.periodEnd));
  const tasks = aggregateTasks(filtered);
  const skills = unique(tasks.flatMap((task) => task.skills_used));
  const completed = tasks.filter((task) => task.outcome_metrics.task_completed === true).length;
  const commandAttempts = filtered.filter((event) => event.command_attempt_metrics?.classified_as_verification === false).length;
  const verificationCommands = tasks.reduce((total, task) => total + (task.verification_metrics.commands_run?.length ?? 0), 0);
  const validationPassed = tasks.filter((task) => task.outcome_metrics.validation_passed === true).length;
  const validationFailed = tasks.filter((task) => task.outcome_metrics.validation_passed === false).length;
  const insufficientEvidence = tasks.filter((task) => taskHasInsufficientEvidence(task)).length;
  const latestInventorySnapshot = latestSnapshot(filtered, "debt_inventory_snapshot");
  const reviewQuality = summarizeReviewQuality(tasks);
  const gateDecisionSummary = summarizeGateDecisions(tasks);
  const routingWarnings = routingDeviationWarnings(tasks);

  return {
    schema_version: "1.0.0",
    report_type: args.reportType,
    generated_at: new Date().toISOString(),
    period: {
      start: args.periodStart,
      end: args.periodEnd,
    },
    summary: {
      event_count: filtered.length,
      tasks_reviewed: tasks.length,
      completed_tasks: completed,
      validation_passed: validationPassed,
      validation_failed: validationFailed,
      insufficient_evidence: insufficientEvidence,
      command_attempts: commandAttempts,
      verification_commands: verificationCommands,
    },
    instruction_maturity: {
      average_goal_clarity: average(tasks, "instruction_quality_metrics.goal_clarity"),
      average_scope_clarity: average(tasks, "instruction_quality_metrics.scope_clarity"),
      average_context_sufficiency: average(tasks, "instruction_quality_metrics.context_sufficiency"),
      verification_instruction_rate: presenceRate(tasks, "instruction_quality_metrics.verification_instruction"),
      risk_awareness_rate: presenceRate(tasks, "instruction_quality_metrics.risk_awareness"),
      stop_condition_rate: presenceRate(tasks, "instruction_quality_metrics.stop_condition_clarity"),
    },
    skill_usage: {
      skills_used: skills,
      correct_routing_rate: correctRoutingRate(tasks),
      required_gate_coverage: requiredGateCoverage(tasks),
      over_processing_count: sumCounts(gateDecisionSummary.over_processing_warnings),
      under_processing_count: sumCounts(gateDecisionSummary.under_processing_warnings),
      missing_evidence_count: insufficientEvidence,
    },
    gate_decision_summary: gateDecisionSummary,
    gate_decision_drilldown: gateDecisionDrilldown(tasks),
    review_quality: reviewQuality,
    debt_movement: {
      detected: sum(tasks, "debt_movement_metrics.debt_items_detected"),
      recorded: sum(tasks, "debt_movement_metrics.debt_items_recorded"),
      planned: sum(tasks, "debt_movement_metrics.debt_items_planned"),
      in_progress: sum(tasks, "debt_movement_metrics.debt_items_in_progress"),
      resolved: sum(tasks, "debt_movement_metrics.debt_items_resolved"),
      converted_to_rule: sum(tasks, "debt_movement_metrics.debt_items_converted_to_rule"),
      converted_to_check: sum(tasks, "debt_movement_metrics.debt_items_converted_to_check"),
      accepted: sum(tasks, "debt_movement_metrics.debt_items_accepted"),
      wont_fix: sum(tasks, "debt_movement_metrics.debt_items_wont_fix"),
      stale: sum(tasks, "debt_movement_metrics.stale_debt_items"),
    },
    debt_inventory_snapshot: latestInventorySnapshot,
    adoption_effect: {
      strong_signal: [],
      weak_signal: [
        ...(tasks.length > 0 ? ["Local task-boundary events were available for this period."] : []),
        ...routingWarnings.map(formatRoutingWarning),
      ],
      unknown: ["Causal impact is not proven by local metrics alone."],
      recommended_next_intervention: tasks.length === 0 ? "Enable local hooks or pass explicit task IDs when recording events." : "Review missing evidence and debt movement before the next reporting period.",
    },
    evidence_references: [args.eventStore],
    privacy_note: {
      raw_prompts_stored: false,
      external_publication: false,
      personnel_evaluation_boundary: "Report is for workflow adoption and improvement, not HR or personnel evaluation.",
      sensitive_data_handling: "Summaries only; raw prompts, secrets, personal data, customer data, full file contents, and full command output omitted by default.",
    },
    diagnostics: {
      invalid_jsonl_lines: invalidLines,
    },
  };
}

function aggregateTasks(events) {
  const grouped = new Map();
  for (const event of events) {
    const taskId = event.task_id || `event:${event.event_id || grouped.size}`;
    if (!grouped.has(taskId)) {
      grouped.set(taskId, {
        task_id: taskId,
        events: [],
        skills_used: new Set(),
        instruction_quality_values: {
          goal_clarity: [],
          scope_clarity: [],
          context_sufficiency: [],
          verification_instruction: [],
          risk_awareness: [],
          stop_condition_clarity: [],
        },
        outcome_metrics: {},
        verification_metrics: {},
        debt_movement_metrics: {},
        routing_result: {
          secondary_skills: new Set(),
          required_gates: new Set(),
          executed_gates: new Set(),
          change_signals: [],
          required_gate_routes: [],
          skipped_heavy_gates: [],
          missing_evidence: [],
          skipped_gates: [],
          gate_applicability: [],
        },
        gate_decisions: [],
        review_result: {
          insufficient_evidence_layers: new Set(),
        },
        latest_debt_inventory_snapshot: null,
      });
    }
    const task = grouped.get(taskId);
    task.events.push(event);
    for (const skill of Array.isArray(event.skills_used) ? event.skills_used : []) {
      task.skills_used.add(skill);
    }
    collectInstructionMetric(task, event, "goal_clarity");
    collectInstructionMetric(task, event, "scope_clarity");
    collectInstructionMetric(task, event, "context_sufficiency");
    collectInstructionMetric(task, event, "verification_instruction");
    collectInstructionMetric(task, event, "risk_awareness");
    collectInstructionMetric(task, event, "stop_condition_clarity");
    mergeOutcome(task.outcome_metrics, event.outcome_metrics ?? {});
    mergeVerification(task.verification_metrics, event.verification_metrics ?? {});
    mergeRouting(task.routing_result, event.routing_result ?? {});
    mergeGateDecisions(task.gate_decisions, event.gate_decisions ?? [], task.task_id);
    mergeReview(task.review_result, event.review_result ?? {});
    addMetricObject(task.debt_movement_metrics, event.debt_movement_metrics ?? {});
    if (event.debt_inventory_snapshot) {
      task.latest_debt_inventory_snapshot = event.debt_inventory_snapshot;
    }
  }

  return [...grouped.values()].map((task) => ({
    task_id: task.task_id,
    event_count: task.events.length,
    skills_used: [...task.skills_used].sort(),
    instruction_quality_metrics: summarizeInstructionMetrics(task.instruction_quality_values),
    outcome_metrics: task.outcome_metrics,
    verification_metrics: task.verification_metrics,
    routing_result: {
      operating_mode: task.routing_result.operating_mode,
      primary_skill: task.routing_result.primary_skill,
      correct_routing: task.routing_result.correct_routing,
      secondary_skills: [...task.routing_result.secondary_skills].sort(),
      required_gates: [...task.routing_result.required_gates].sort(),
      executed_gates: [...task.routing_result.executed_gates].sort(),
      change_signals: task.routing_result.change_signals,
      required_gate_routes: task.routing_result.required_gate_routes,
      skipped_heavy_gates: task.routing_result.skipped_heavy_gates,
      missing_evidence: task.routing_result.missing_evidence,
      skipped_gates: task.routing_result.skipped_gates,
      gate_applicability: task.routing_result.gate_applicability,
    },
    gate_decisions: task.gate_decisions,
    review_result: {
      decision: task.review_result.decision,
      required_fixes_count: task.review_result.required_fixes_count ?? 0,
      insufficient_evidence_layers: [...task.review_result.insufficient_evidence_layers].sort(),
    },
    debt_movement_metrics: task.debt_movement_metrics,
    debt_inventory_snapshot: task.latest_debt_inventory_snapshot,
  }));
}

function collectInstructionMetric(task, event, field) {
  const value = event.instruction_quality_metrics?.[field];
  if (value !== undefined && value !== null && value !== "") {
    task.instruction_quality_values[field].push(value);
  }
}

function summarizeInstructionMetrics(values) {
  return {
    goal_clarity: averageRaw(values.goal_clarity),
    scope_clarity: averageRaw(values.scope_clarity),
    context_sufficiency: averageRaw(values.context_sufficiency),
    verification_instruction: mostPositivePresence(values.verification_instruction),
    risk_awareness: mostPositivePresence(values.risk_awareness),
    stop_condition_clarity: mostPositivePresence(values.stop_condition_clarity),
  };
}

function averageRaw(values) {
  const numbers = values.filter((value) => Number.isFinite(Number(value))).map(Number);
  if (numbers.length === 0) return null;
  return numbers.reduce((total, value) => total + value, 0) / numbers.length;
}

function mostPositivePresence(values) {
  if (values.includes("present")) return "present";
  if (values.includes("partial")) return "partial";
  if (values.includes("missing")) return "missing";
  if (values.includes("unknown")) return "unknown";
  if (values.includes("not_applicable")) return "not_applicable";
  return null;
}

function mergeOutcome(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "boolean") {
      if (value === true || target[key] === undefined) {
        target[key] = value;
      }
    } else if (Number.isFinite(Number(value))) {
      target[key] = (target[key] || 0) + Number(value);
    }
  }
}

function mergeVerification(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (key === "commands_run" && Array.isArray(value)) {
      target.commands_run = [...(target.commands_run ?? []), ...value];
    } else if (typeof value === "boolean") {
      if (value === true || target[key] === undefined) {
        target[key] = value;
      }
    } else if (Number.isFinite(Number(value))) {
      target[key] = (target[key] || 0) + Number(value);
    }
  }
}

function mergeRouting(target, source) {
  if (typeof source.operating_mode === "string" && source.operating_mode) {
    target.operating_mode = source.operating_mode;
  }
  if (typeof source.primary_skill === "string" && source.primary_skill) {
    target.primary_skill = source.primary_skill;
  }
  if (typeof source.correct_routing === "boolean") {
    target.correct_routing = source.correct_routing === false ? false : target.correct_routing ?? true;
  }
  if (Array.isArray(source.change_signals)) {
    for (const item of source.change_signals) {
      const signal = normalizeChangeSignal(item);
      if (signal) target.change_signals.push(signal);
    }
  }
  for (const field of ["secondary_skills", "required_gates", "executed_gates"]) {
    if (!Array.isArray(source[field])) {
      continue;
    }
    for (const value of source[field]) {
      if (typeof value === "string" && value) {
        target[field].add(value);
      }
    }
  }
  if (Array.isArray(source.required_gate_routes)) {
    for (const item of source.required_gate_routes) {
      const route = normalizeRequiredGateRoute(item);
      if (route) target.required_gate_routes.push(route);
    }
  }
  if (Array.isArray(source.skipped_heavy_gates)) {
    for (const item of source.skipped_heavy_gates) {
      const skipped = normalizeSkippedHeavyGate(item);
      if (skipped) target.skipped_heavy_gates.push(skipped);
    }
  }
  if (Array.isArray(source.missing_evidence)) {
    for (const item of source.missing_evidence) {
      const missing = normalizeMissingEvidence(item);
      if (missing) target.missing_evidence.push(missing);
    }
  }
  if (Array.isArray(source.skipped_gates)) {
    for (const item of source.skipped_gates) {
      if (item && typeof item.gate === "string" && typeof item.reason === "string") {
        target.skipped_gates.push({ gate: item.gate, reason: item.reason });
      }
    }
  }
  if (Array.isArray(source.gate_applicability)) {
    for (const item of source.gate_applicability) {
      const row = normalizeGateApplicability(item);
      if (row) {
        target.gate_applicability.push(row);
      }
    }
  }
}

function normalizeChangeSignal(item) {
  if (!item || typeof item.signal !== "string" || typeof item.evidence !== "string" || !item.signal || !item.evidence) return null;
  return { signal: item.signal, evidence: item.evidence };
}

function normalizeRequiredGateRoute(item) {
  if (!item || typeof item.gate !== "string" || typeof item.reason !== "string" || !Array.isArray(item.trigger_signals) || item.trigger_signals.length === 0) return null;
  return {
    gate: item.gate,
    reason: item.reason,
    trigger_signals: unique(item.trigger_signals.filter((value) => typeof value === "string" && value)),
  };
}

function normalizeSkippedHeavyGate(item) {
  if (!item || typeof item.gate !== "string" || typeof item.reason !== "string") return null;
  const result = { gate: item.gate, reason: item.reason };
  if (typeof item.layer === "string" && item.layer) result.layer = item.layer;
  if (typeof item.observed_evidence === "string" && item.observed_evidence) result.observed_evidence = item.observed_evidence;
  return result;
}

function normalizeMissingEvidence(item) {
  if (!item || typeof item.input !== "string" || typeof item.reason !== "string" || !item.input || !item.reason) return null;
  return { input: item.input, reason: item.reason };
}

function normalizeGateApplicability(item) {
  const allowedStatuses = new Set(["required", "skipped", "insufficient_evidence"]);
  if (!item || typeof item.layer !== "string" || !allowedStatuses.has(item.status) || typeof item.reason !== "string" || typeof item.evidence !== "string") {
    return null;
  }
  const row = {
    layer: item.layer,
    status: item.status,
    reason: item.reason,
    evidence: item.evidence,
    trigger_signals: Array.isArray(item.trigger_signals)
      ? unique(item.trigger_signals.filter((value) => typeof value === "string" && value))
      : [],
    inputs_still_needed: Array.isArray(item.inputs_still_needed)
      ? unique(item.inputs_still_needed.filter((value) => typeof value === "string" && value))
      : [],
  };
  if (typeof item.gate === "string" && item.gate) {
    row.gate = item.gate;
  }
  return row;
}

function mergeReview(target, source) {
  const allowedDecisions = new Set(["approve", "approve_with_comments", "request_changes", "block", "insufficient_evidence"]);
  if (allowedDecisions.has(source.decision)) {
    target.decision = source.decision;
  }
  if (Number.isFinite(Number(source.required_fixes_count))) {
    target.required_fixes_count = Math.max(target.required_fixes_count ?? 0, Number(source.required_fixes_count));
  }
  if (Array.isArray(source.insufficient_evidence_layers)) {
    for (const value of source.insufficient_evidence_layers) {
      if (typeof value === "string" && value) {
        target.insufficient_evidence_layers.add(value);
      }
    }
  }
}

function addMetricObject(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (Number.isFinite(Number(value))) {
      target[key] = (target[key] || 0) + Number(value);
    }
  }
}

function latestSnapshot(events, field) {
  const withSnapshots = events
    .filter((event) => event[field])
    .sort((a, b) => String(a.occurred_at || "").localeCompare(String(b.occurred_at || "")));
  return withSnapshots.length > 0 ? withSnapshots.at(-1)[field] : null;
}

function taskHasInsufficientEvidence(task) {
  return (
    task.verification_metrics.insufficient_evidence_reported === true ||
    task.review_result.decision === "insufficient_evidence" ||
    task.review_result.insufficient_evidence_layers.length > 0 ||
    task.gate_decisions.some((decision) => decision.status === "insufficient_evidence") ||
    task.routing_result.missing_evidence.length > 0 ||
    task.routing_result.gate_applicability.some((item) => item.status === "insufficient_evidence" || requiredApplicabilityMissingGate(item))
  );
}

function correctRoutingRate(tasks) {
  const values = tasks
    .map((task) => task.routing_result.correct_routing)
    .filter((value) => typeof value === "boolean");
  if (values.length === 0) return null;
  return values.filter(Boolean).length / values.length;
}

function requiredGateCoverage(tasks) {
  const coverages = tasks
    .map((task) => {
      const required = effectiveRequiredGates(task);
      if (required.length === 0) {
        return null;
      }
      const executed = new Set(effectiveExecutedGates(task));
      return required.filter((gate) => executed.has(gate)).length / required.length;
    })
    .filter((value) => value !== null);
  if (coverages.length === 0) return null;
  return coverages.reduce((total, value) => total + value, 0) / coverages.length;
}

function mergeGateDecisions(target, source, taskId) {
  if (!Array.isArray(source)) {
    return;
  }
  for (const item of source) {
    const decision = normalizeGateDecision(item, taskId);
    if (decision) {
      target.push(decision);
    }
  }
}

function normalizeGateDecision(item, taskId) {
  const allowedStatuses = new Set(["required", "executed", "skipped", "insufficient_evidence"]);
  if (!item || typeof item.gate !== "string" || !allowedStatuses.has(item.status)) {
    return null;
  }
  const gate = item.gate.trim();
  if (!gate) {
    return null;
  }
  const decision = {
    task_id: taskId,
    gate,
    status: item.status,
    evidence_checked: Array.isArray(item.evidence_checked) ? unique(item.evidence_checked.filter((value) => typeof value === "string")) : [],
    triggering_signals: Array.isArray(item.triggering_signals) ? unique(item.triggering_signals.filter((value) => typeof value === "string")) : [],
    missing_inputs: Array.isArray(item.missing_inputs) ? unique(item.missing_inputs.filter((value) => typeof value === "string")) : [],
  };
  if (typeof item.layer === "string" && item.layer) {
    decision.layer = item.layer;
  }
  if (typeof item.judgment === "string") {
    decision.judgment = item.judgment;
  }
  if (["high", "medium", "low"].includes(item.confidence)) {
    decision.confidence = item.confidence;
  }
  if (typeof item.reason_category === "string" && item.reason_category) {
    decision.reason_category = item.reason_category;
  }
  return decision;
}

function effectiveRequiredGates(task) {
  const required = new Set(Array.isArray(task.routing_result.required_gates) ? task.routing_result.required_gates : []);
  for (const decision of task.gate_decisions) {
    if (decision.status === "required") {
      required.add(decision.gate);
    }
  }
  for (const item of task.routing_result.gate_applicability ?? []) {
    if (item.status === "required" && item.gate) {
      required.add(item.gate);
    }
  }
  for (const item of task.routing_result.required_gate_routes ?? []) {
    if (item.gate) required.add(item.gate);
  }
  return [...required].sort();
}

function effectiveExecutedGates(task) {
  const executed = new Set(Array.isArray(task.routing_result.executed_gates) ? task.routing_result.executed_gates : []);
  for (const decision of task.gate_decisions) {
    if (decision.status === "executed") {
      executed.add(decision.gate);
    }
  }
  return [...executed].sort();
}

function summarizeGateDecisions(tasks) {
  const skippedByCategory = new Map();
  const insufficientEvidence = new Map();
  const underProcessing = new Map();
  const overProcessing = new Map();
  const missingSkipReasons = new Map();
  let totalDecisions = 0;
  let missingSkipReasonCount = 0;

  for (const task of tasks) {
    totalDecisions += task.gate_decisions.length;
    const required = new Set(effectiveRequiredGates(task));
    const executed = new Set(effectiveExecutedGates(task));

    for (const gate of required) {
      if (!executed.has(gate)) {
        increment(underProcessing, gate);
      }
    }

    for (const gate of executed) {
      if (HEAVY_REVIEW_GATES.has(gate) && !hasGateTriggerEvidence(task, gate)) {
        increment(overProcessing, gate);
      }
    }

    for (const item of task.routing_result.missing_evidence ?? []) {
      const key = JSON.stringify([item.input, ""]);
      if (!insufficientEvidence.has(key)) {
        insufficientEvidence.set(key, { gate: item.input, count: 0 });
      }
      insufficientEvidence.get(key).count += 1;
    }

    for (const decision of task.gate_decisions) {
      if (decision.status === "skipped") {
        if (!hasSkipReason(decision)) {
          missingSkipReasonCount += 1;
          increment(missingSkipReasons, decision.gate);
        }
        increment(skippedByCategory, skipReasonCategory(decision));
      } else if (decision.status === "insufficient_evidence") {
        const key = JSON.stringify([decision.gate, decision.layer ?? ""]);
        if (!insufficientEvidence.has(key)) {
          insufficientEvidence.set(key, { gate: decision.gate, layer: decision.layer, count: 0 });
        }
        insufficientEvidence.get(key).count += 1;
      }
    }
  }

  return {
    total_decisions: totalDecisions,
    missing_skip_reason_count: missingSkipReasonCount,
    skipped_by_reason_category: countMapEntries(skippedByCategory, "category"),
    insufficient_evidence: [...insufficientEvidence.values()].sort(compareCountEntries),
    under_processing_warnings: countMapEntries(underProcessing, "gate"),
    over_processing_warnings: countMapEntries(overProcessing, "gate"),
    top_gate_deviation_patterns: topGateDeviationPatterns({
      underProcessing,
      overProcessing,
      missingSkipReasons,
      insufficientEvidence,
    }),
  };
}

function gateDecisionDrilldown(tasks) {
  return tasks.flatMap((task) => task.gate_decisions).slice(0, 200);
}

function hasSkipReason(decision) {
  return typeof decision.judgment === "string" && decision.judgment.trim().length > 0;
}

function skipReasonCategory(decision) {
  if (decision.reason_category) {
    return decision.reason_category;
  }
  if (!hasSkipReason(decision)) {
    return "missing_reason";
  }
  const text = `${decision.judgment} ${decision.missing_inputs.join(" ")} ${decision.triggering_signals.join(" ")}`.toLowerCase();
  if (/\b(no trigger|no .*signal|not triggered)\b/.test(text)) return "no_trigger_signal";
  if (/\b(missing|unavailable|insufficient).*(context|diff|evidence|input)\b/.test(text)) return "missing_context";
  if (/\bcovered by|redundant|duplicate\b/.test(text)) return "covered_by_other_gate";
  if (/\bnot applicable|n\/a|out of scope\b/.test(text)) return "not_applicable";
  return "other";
}

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function countMapEntries(map, keyName) {
  return [...map.entries()]
    .map(([key, count]) => ({ [keyName]: key, count }))
    .sort(compareCountEntries);
}

function compareCountEntries(a, b) {
  return b.count - a.count || String(a.gate ?? a.category ?? "").localeCompare(String(b.gate ?? b.category ?? ""));
}

function sumCounts(entries) {
  return entries.reduce((total, entry) => total + entry.count, 0);
}

function topGateDeviationPatterns({ underProcessing, overProcessing, missingSkipReasons, insufficientEvidence }) {
  const patterns = [
    ...countMapEntries(underProcessing, "gate").map((entry) => ({ deviation_type: "under_processing", ...entry })),
    ...countMapEntries(overProcessing, "gate").map((entry) => ({ deviation_type: "over_processing", ...entry })),
    ...countMapEntries(missingSkipReasons, "gate").map((entry) => ({ deviation_type: "missing_skip_reason", ...entry })),
    ...[...insufficientEvidence.values()].sort(compareCountEntries).map((entry) => ({ deviation_type: "insufficient_evidence", ...entry })),
  ];
  return patterns.sort(compareDeviationPatterns).slice(0, 10);
}

function compareDeviationPatterns(a, b) {
  const typeOrder = {
    under_processing: 0,
    over_processing: 1,
    missing_skip_reason: 2,
    insufficient_evidence: 3,
  };
  return (
    b.count - a.count ||
    (typeOrder[a.deviation_type] ?? 99) - (typeOrder[b.deviation_type] ?? 99) ||
    String(a.gate).localeCompare(String(b.gate)) ||
    String(a.layer ?? "").localeCompare(String(b.layer ?? ""))
  );
}

function routingDeviationWarnings(tasks) {
  const warnings = [];
  const seen = new Set();

  function add(warning) {
    const key = `${warning.type}:${warning.task_id}:${warning.gate}:${warning.layer ?? ""}:${warning.reason}`;
    if (seen.has(key) || warnings.length >= 100) {
      return;
    }
    seen.add(key);
    warnings.push(warning);
  }

  for (const task of tasks) {
    const required = new Set(effectiveRequiredGates(task));
    const executed = new Set(effectiveExecutedGates(task));
    const applicability = task.routing_result.gate_applicability ?? [];
    const requiredRoutes = task.routing_result.required_gate_routes ?? [];

    for (const gate of required) {
      if (!executed.has(gate)) {
        add({
          type: "under_processing",
          task_id: task.task_id,
          gate,
          reason: "Required gate was not present in executed_gates.",
        });
      }
    }

    for (const item of applicability) {
      if (requiredApplicabilityMissingGate(item)) {
        add({
          type: "missing_evidence",
          task_id: task.task_id,
          gate: item.layer,
          layer: item.layer,
          reason: `Required gate applicability is missing a gate id: ${item.reason}`,
        });
      }
      if (item.status === "insufficient_evidence") {
        add({
          type: "missing_evidence",
          task_id: task.task_id,
          gate: item.gate ?? item.layer,
          layer: item.layer,
          reason: item.inputs_still_needed.length > 0
            ? `Layer applicability needs: ${item.inputs_still_needed.join(", ")}.`
            : item.reason,
        });
      }
    }

    for (const item of task.routing_result.missing_evidence ?? []) {
      add({
        type: "missing_evidence",
        task_id: task.task_id,
        gate: item.input,
        reason: item.reason,
      });
    }

    for (const gate of executed) {
      if (!HEAVY_REVIEW_GATES.has(gate)) {
        continue;
      }
      const item = applicability.find((candidate) => candidate.gate === gate);
      const route = requiredRoutes.find((candidate) => candidate.gate === gate);
      const hasTriggerSignals = hasGateTriggerEvidence(task, gate);
      if (!hasTriggerSignals) {
        add({
          type: "over_processing",
          task_id: task.task_id,
          gate,
          layer: item?.layer,
          reason: heavyGateTriggerWarningReason(item, route, executed.has(gate)),
        });
      }
    }
  }

  return warnings;
}

function heavyGateTriggerWarningReason(item, route, gateIsExecuted) {
  if (!item && !route) {
    return "Heavy gate selected without a required gate route or diagnostic applicability row with trigger signals.";
  }
  if (item?.status === "required" || route) {
    return "Heavy gate marked required without recorded trigger signals.";
  }
  if (item?.status === "skipped" && gateIsExecuted) {
    return `Executed heavy gate despite skipped applicability: ${item.reason}`;
  }
  if (gateIsExecuted) {
    return "Executed heavy gate without required applicability trigger signals.";
  }
  return "Heavy gate selected without required applicability trigger signals.";
}

function hasGateTriggerEvidence(task, gate) {
  const observedSignals = new Set(
    (task.routing_result.change_signals ?? [])
      .map((item) => item?.signal)
      .filter((signal) => typeof signal === "string" && signal),
  );
  const signalsMatch = (signals) => Array.isArray(signals)
    && signals.length > 0
    && signals.every((signal) => observedSignals.has(signal) && SIGNAL_TO_GATES.get(signal)?.includes(gate));

  const route = (task.routing_result.required_gate_routes ?? []).find((candidate) => candidate.gate === gate);
  if (route) {
    return signalsMatch(route.trigger_signals);
  }

  const gateDecisions = task.gate_decisions.filter(
    (candidate) => candidate.gate === gate && ["required", "executed"].includes(candidate.status),
  );
  if (gateDecisions.length > 0) {
    return gateDecisions.every((candidate) => signalsMatch(candidate.triggering_signals));
  }

  const applicability = task.routing_result.gate_applicability ?? [];
  const diagnostic = applicability.find((candidate) => candidate.gate === gate);
  if (diagnostic) {
    return diagnostic.status === "required" && signalsMatch(diagnostic.trigger_signals);
  }

  return [...observedSignals].some((signal) => SIGNAL_TO_GATES.get(signal)?.includes(gate));
}

function requiredApplicabilityMissingGate(item) {
  return item.status === "required" && !item.gate;
}

function formatRoutingWarning(warning) {
  const label = {
    under_processing: "Under-processing",
    over_processing: "Over-processing",
    missing_evidence: "Missing evidence",
  }[warning.type] ?? "Routing warning";
  const layer = warning.layer ? ` layer=${warning.layer}` : "";
  return `${label}: task=${warning.task_id} gate=${warning.gate}${layer} - ${warning.reason}`;
}

function summarizeReviewQuality(tasks) {
  const decisions = {
    approve: 0,
    approve_with_comments: 0,
    request_changes: 0,
    block: 0,
    insufficient_evidence: 0,
  };
  const reviewTasks = tasks.filter((task) => task.review_result.decision);
  let requiredFixes = 0;
  const insufficientLayers = new Set();
  for (const task of reviewTasks) {
    decisions[task.review_result.decision] += 1;
    requiredFixes += Number(task.review_result.required_fixes_count || 0);
    for (const layer of task.review_result.insufficient_evidence_layers) {
      insufficientLayers.add(layer);
    }
  }
  return {
    review_tasks: reviewTasks.length,
    decisions,
    required_fixes_count: requiredFixes,
    insufficient_evidence_tasks: reviewTasks.filter((task) => taskHasInsufficientEvidence(task)).length,
    insufficient_evidence_layers: [...insufficientLayers].sort(),
  };
}

function presenceRate(events, path) {
  const values = events.map((event) => readPath(event, path)).filter(Boolean);
  if (values.length === 0) return null;
  return values.filter((value) => value === "present").length / values.length;
}

function renderMarkdown(report) {
  return `# ${titleCase(report.report_type)} Adoption Report

Period: ${report.period.start} to ${report.period.end}

## Summary

- Tasks reviewed: ${report.summary.tasks_reviewed}
- Events reviewed: ${report.summary.event_count}
- Completed tasks: ${report.summary.completed_tasks}
- Validation passed: ${report.summary.validation_passed}
- Validation failed: ${report.summary.validation_failed}
- Insufficient evidence: ${report.summary.insufficient_evidence}

## Skill Usage

- Skills used: ${report.skill_usage.skills_used.length > 0 ? report.skill_usage.skills_used.join(", ") : "none"}
- Correct routing rate: ${formatUnknownNumber(report.skill_usage.correct_routing_rate)}
- Required gate coverage: ${formatUnknownNumber(report.skill_usage.required_gate_coverage)}
- Over-processing warnings: ${report.skill_usage.over_processing_count}
- Under-processing warnings: ${report.skill_usage.under_processing_count}
- Missing evidence count: ${report.skill_usage.missing_evidence_count}
- Missing skip reason count: ${report.gate_decision_summary.missing_skip_reason_count}
- Skipped gate categories: ${formatCountList(report.gate_decision_summary.skipped_by_reason_category, "category")}
- Insufficient evidence gates: ${formatGateLayerList(report.gate_decision_summary.insufficient_evidence)}
- Top gate deviations: ${formatDeviationList(report.gate_decision_summary.top_gate_deviation_patterns)}
- Under-processing gates: ${formatCountList(report.gate_decision_summary.under_processing_warnings, "gate")}

## Review Quality

- Review tasks: ${report.review_quality.review_tasks}
- Decisions: ${Object.entries(report.review_quality.decisions).map(([decision, count]) => `${decision}=${count}`).join(", ")}
- Required fixes count: ${report.review_quality.required_fixes_count}
- Insufficient evidence tasks: ${report.review_quality.insufficient_evidence_tasks}
- Insufficient evidence layers: ${report.review_quality.insufficient_evidence_layers.length > 0 ? report.review_quality.insufficient_evidence_layers.join(", ") : "none"}

## Debt Movement

- detected: ${report.debt_movement.detected}
- recorded: ${report.debt_movement.recorded}
- planned: ${report.debt_movement.planned}
- in_progress: ${report.debt_movement.in_progress}
- resolved: ${report.debt_movement.resolved}
- converted_to_rule: ${report.debt_movement.converted_to_rule}
- converted_to_check: ${report.debt_movement.converted_to_check}
- accepted: ${report.debt_movement.accepted}
- wont_fix: ${report.debt_movement.wont_fix}
- stale: ${report.debt_movement.stale}

## Debt Inventory Snapshot

${report.debt_inventory_snapshot ? Object.entries(report.debt_inventory_snapshot).map(([status, count]) => `- ${status}: ${count}`).join("\n") : "- none"}

## Adoption Effect

- Strong signal: ${report.adoption_effect.strong_signal.length > 0 ? report.adoption_effect.strong_signal.join("; ") : "none"}
- Weak signal: ${report.adoption_effect.weak_signal.length > 0 ? report.adoption_effect.weak_signal.join("; ") : "none"}
- Unknown: ${report.adoption_effect.unknown.join("; ")}
- Recommended next intervention: ${report.adoption_effect.recommended_next_intervention}

## Evidence

${report.evidence_references.map((reference) => `- ${reference}`).join("\n")}

## Privacy / Safety

- Raw prompt storage: false
- External publication: false
- Personnel-evaluation boundary: ${report.privacy_note.personnel_evaluation_boundary}
- Sensitive data handling: ${report.privacy_note.sensitive_data_handling}
`;
}

function titleCase(value) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function formatUnknownNumber(value) {
  return value === null || value === undefined ? "unknown" : String(value);
}

function formatCountList(entries, key) {
  return entries.length > 0 ? entries.map((entry) => `${entry[key]}=${entry.count}`).join(", ") : "none";
}

function formatGateLayerList(entries) {
  return entries.length > 0
    ? entries.map((entry) => `${entry.gate}${entry.layer ? `/${entry.layer}` : ""}=${entry.count}`).join(", ")
    : "none";
}

function formatDeviationList(entries) {
  return entries.length > 0
    ? entries.slice(0, 5).map((entry) => `${entry.deviation_type}:${entry.gate}${entry.layer ? `/${entry.layer}` : ""}=${entry.count}`).join(", ")
    : "none";
}

function writeOutput(args, content) {
  const extension = args.format === "json" ? "json" : "md";
  const outputPath = resolve(args.out || `${args.reportDir}/adoption-report-${args.periodEnd}.${extension}`);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content);
  return outputPath;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { events, invalidLines } = readEvents(args.eventStore);
  const report = summarize(events, invalidLines, args);
  const content = args.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdown(report);
  const outputPath = writeOutput(args, content);
  if (args.print) {
    console.log(content.trimEnd());
  } else {
    console.log(`Adoption report written: ${outputPath}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`ai-metrics-summarize failed: ${error.message}`);
  process.exit(1);
}
