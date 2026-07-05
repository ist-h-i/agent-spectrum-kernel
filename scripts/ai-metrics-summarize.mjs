#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

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
  const validationPassed = tasks.filter((task) => task.outcome_metrics.validation_passed === true).length;
  const validationFailed = tasks.filter((task) => task.outcome_metrics.validation_passed === false).length;
  const insufficientEvidence = tasks.filter((task) => task.verification_metrics.insufficient_evidence_reported === true).length;
  const latestInventorySnapshot = latestSnapshot(filtered, "debt_inventory_snapshot");

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
      correct_routing_rate: null,
      required_gate_coverage: null,
      over_processing_count: 0,
      missing_evidence_count: insufficientEvidence,
    },
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
      weak_signal: tasks.length > 0 ? ["Local task-boundary events were available for this period."] : [],
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
- Missing evidence count: ${report.skill_usage.missing_evidence_count}

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
