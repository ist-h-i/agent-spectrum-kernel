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
  const values = events.map((event) => readPath(event, path)).filter((value) => Number.isFinite(Number(value)));
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
  const skills = unique(filtered.flatMap((event) => Array.isArray(event.skills_used) ? event.skills_used : []));
  const completed = filtered.filter((event) => event.outcome_metrics?.task_completed === true).length;
  const validationPassed = filtered.filter((event) => event.outcome_metrics?.validation_passed === true).length;
  const insufficientEvidence = filtered.filter((event) => event.verification_metrics?.insufficient_evidence_reported === true).length;

  return {
    schema_version: "1.0.0",
    report_type: args.reportType,
    generated_at: new Date().toISOString(),
    period: {
      start: args.periodStart,
      end: args.periodEnd,
    },
    summary: {
      tasks_reviewed: filtered.length,
      completed_tasks: completed,
      validation_passed: validationPassed,
      validation_failed: filtered.filter((event) => event.outcome_metrics?.validation_passed === false).length,
      insufficient_evidence: insufficientEvidence,
    },
    instruction_maturity: {
      average_goal_clarity: average(filtered, "instruction_quality_metrics.goal_clarity"),
      average_scope_clarity: average(filtered, "instruction_quality_metrics.scope_clarity"),
      average_context_sufficiency: average(filtered, "instruction_quality_metrics.context_sufficiency"),
      verification_instruction_rate: presenceRate(filtered, "instruction_quality_metrics.verification_instruction"),
      risk_awareness_rate: presenceRate(filtered, "instruction_quality_metrics.risk_awareness"),
      stop_condition_rate: presenceRate(filtered, "instruction_quality_metrics.stop_condition_clarity"),
    },
    skill_usage: {
      skills_used: skills,
      correct_routing_rate: null,
      required_gate_coverage: null,
      over_processing_count: 0,
      missing_evidence_count: insufficientEvidence,
    },
    debt_movement: {
      detected: sum(filtered, "debt_movement_metrics.debt_items_detected"),
      recorded: sum(filtered, "debt_movement_metrics.debt_items_recorded"),
      planned: sum(filtered, "debt_movement_metrics.debt_items_planned"),
      in_progress: sum(filtered, "debt_movement_metrics.debt_items_in_progress"),
      resolved: sum(filtered, "debt_movement_metrics.debt_items_resolved"),
      converted_to_rule: sum(filtered, "debt_movement_metrics.debt_items_converted_to_rule"),
      converted_to_check: sum(filtered, "debt_movement_metrics.debt_items_converted_to_check"),
      accepted: sum(filtered, "debt_movement_metrics.debt_items_accepted"),
      wont_fix: sum(filtered, "debt_movement_metrics.debt_items_wont_fix"),
      stale: sum(filtered, "debt_movement_metrics.stale_debt_items"),
    },
    adoption_effect: {
      strong_signal: [],
      weak_signal: filtered.length > 0 ? ["Local task-boundary events were available for this period."] : [],
      unknown: ["Causal impact is not proven by local metrics alone."],
      recommended_next_intervention: filtered.length === 0 ? "Enable local hooks or pass explicit task IDs when recording events." : "Review missing evidence and debt movement before the next reporting period.",
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
