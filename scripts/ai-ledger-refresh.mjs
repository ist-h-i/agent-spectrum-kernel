#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DEFAULT_LEDGER = "docs/ai/improvement-ledger.md";
const HEADER = [
  "ID",
  "Source",
  "Finding",
  "Category",
  "Evidence",
  "Impact",
  "Severity",
  "Urgency",
  "Decision",
  "Recommended action",
  "Prevention target",
  "Repeat pattern",
  "Proposed rule or check",
  "Scope",
  "Owner",
  "Status",
  "Created date",
  "Refresh date",
  "Close condition",
];
const OPEN_SECTION = "Open Improvement Items";
const STATUS_METRIC_MAP = {
  detected: "debt_items_detected",
  recorded: "debt_items_recorded",
  open: "debt_items_recorded",
  triaged: "debt_items_recorded",
  accepted: "debt_items_accepted",
  planned: "debt_items_planned",
  in_progress: "debt_items_in_progress",
  resolved: "debt_items_resolved",
  converted_to_rule: "debt_items_converted_to_rule",
  converted_to_check: "debt_items_converted_to_check",
  wont_fix: "debt_items_wont_fix",
  stale: "stale_debt_items",
};

function parseArgs(argv) {
  const args = {
    ledger: DEFAULT_LEDGER,
    candidates: "",
    write: false,
    markStale: false,
    json: false,
    taskId: process.env.AI_TASK_ID || "",
    eventStore: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--ledger") {
      args.ledger = argv[++i];
    } else if (arg === "--candidates") {
      args.candidates = argv[++i];
    } else if (arg === "--write") {
      args.write = true;
    } else if (arg === "--mark-stale") {
      args.markStale = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--task-id") {
      args.taskId = argv[++i];
    } else if (arg === "--event-store") {
      args.eventStore = argv[++i];
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
  console.log(`Usage: node scripts/ai-ledger-refresh.mjs [options]

Options:
  --ledger <path>       Improvement ledger markdown. Defaults to docs/ai/improvement-ledger.md.
  --candidates <path>   JSON array of non-blocking ledger candidates to append.
  --write               Write candidate appends and stale status changes. Default is dry-run.
  --mark-stale          Mark overdue active rows stale when --write is set.
  --json                Print JSON summary.
  --task-id <id>        Optional task ID for metrics event.
  --event-store <path>  Optional JSONL event store for a ledger_refresh metrics event.
`);
}

function splitMarkdownTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return [];
  return trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function isSeparator(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function normalize(value) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function parseLedger(text) {
  const lines = text.split(/\r?\n/);
  const rows = [];
  let section = "";
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^##\s+(.+?)\s*$/);
    if (heading) {
      section = heading[1];
      continue;
    }
    const cells = splitMarkdownTableRow(lines[index]);
    if (cells.length === 0 || !HEADER.every((field) => cells.map(normalize).includes(normalize(field)))) {
      continue;
    }
    let rowIndex = index + 1;
    if (isSeparator(splitMarkdownTableRow(lines[rowIndex] || ""))) {
      rowIndex += 1;
    }
    while (rowIndex < lines.length && lines[rowIndex].trim().startsWith("|")) {
      const rowCells = splitMarkdownTableRow(lines[rowIndex]);
      if (!isSeparator(rowCells) && rowCells.some(Boolean)) {
        const values = {};
        cells.forEach((field, fieldIndex) => {
          values[field] = rowCells[fieldIndex] || "";
        });
        rows.push({ line: rowIndex, section, values });
      }
      rowIndex += 1;
    }
  }
  return { lines, rows };
}

function statusOf(row) {
  return row.values.Status || "unknown";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function staleCandidates(rows, today) {
  return rows.filter((row) => {
    const status = statusOf(row);
    const refreshDate = row.values["Refresh date"];
    return refreshDate && refreshDate < today && !["resolved", "converted_to_rule", "converted_to_check", "wont_fix", "stale"].includes(status);
  });
}

function countsByStatus(rows) {
  const counts = {};
  for (const row of rows) {
    const status = statusOf(row);
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

function nextId(rows) {
  const max = rows.reduce((current, row) => {
    const match = String(row.values.ID || "").match(/^IMP-(\d{4})$/);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return `IMP-${String(max + 1).padStart(4, "0")}`;
}

function readCandidates(path) {
  if (!path) return [];
  const candidates = JSON.parse(readFileSync(resolve(path), "utf8"));
  if (!Array.isArray(candidates)) {
    throw new Error("--candidates must point to a JSON array");
  }
  return candidates.filter((candidate) => !candidate.current_pr_blocker);
}

function candidateToRow(candidate, id) {
  const values = {
    ID: candidate.id || id,
    Source: candidate.source || "review",
    Finding: candidate.finding || "",
    Category: candidate.category || "technical_debt",
    Evidence: candidate.evidence || "",
    Impact: candidate.impact || "",
    Severity: candidate.severity || "medium",
    Urgency: candidate.urgency || "backlog",
    Decision: candidate.decision || "backlog",
    "Recommended action": candidate.recommended_action || "",
    "Prevention target": candidate.prevention_target || "no prevention needed",
    "Repeat pattern": candidate.repeat_pattern || "",
    "Proposed rule or check": candidate.proposed_rule_or_check || "",
    Scope: candidate.scope || "",
    Owner: candidate.owner || "unassigned",
    Status: candidate.status || "triaged",
    "Created date": candidate.created_date || todayIso(),
    "Refresh date": candidate.refresh_date || candidate.created_date || todayIso(),
    "Close condition": candidate.close_condition || "",
  };
  return `| ${HEADER.map((field) => escapeCell(values[field] || "")).join(" | ")} |`;
}

function escapeCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function appendCandidates(text, rows, candidates) {
  if (candidates.length === 0) {
    return text;
  }
  const parsed = parseLedger(text);
  const headingIndex = parsed.lines.findIndex((line) => line.trim() === `## ${OPEN_SECTION}`);
  if (headingIndex === -1) {
    throw new Error(`Ledger is missing section: ${OPEN_SECTION}`);
  }
  let insertIndex = headingIndex + 1;
  while (insertIndex < parsed.lines.length && !parsed.lines[insertIndex].startsWith("## ")) {
    insertIndex += 1;
  }
  const newRows = [];
  let next = nextId(rows);
  for (const candidate of candidates) {
    newRows.push(candidateToRow(candidate, candidate.id || next));
    if (!candidate.id) {
      const numeric = Number(next.slice(4)) + 1;
      next = `IMP-${String(numeric).padStart(4, "0")}`;
    }
  }
  parsed.lines.splice(insertIndex, 0, ...newRows);
  return parsed.lines.join("\n");
}

function markRowsStale(text, staleRows) {
  if (staleRows.length === 0) return text;
  const parsed = parseLedger(text);
  for (const stale of staleRows) {
    const line = parsed.lines[stale.line];
    const cells = splitMarkdownTableRow(line);
    const statusIndex = HEADER.indexOf("Status");
    cells[statusIndex] = "stale";
    parsed.lines[stale.line] = `| ${cells.join(" | ")} |`;
  }
  return parsed.lines.join("\n");
}

function debtMovementFromCounts(counts, detected = 0) {
  const movement = { debt_items_detected: detected };
  for (const [status, count] of Object.entries(counts)) {
    const metric = STATUS_METRIC_MAP[status];
    if (metric) {
      movement[metric] = (movement[metric] || 0) + count;
    }
  }
  return movement;
}

function writeMetricsEvent(eventStore, taskId, movement, ledgerPath) {
  if (!eventStore || !taskId) return;
  const now = new Date().toISOString();
  const event = {
    schema_version: "1.0.0",
    event_id: `evt:${now}:ledger-refresh`,
    task_id: taskId,
    task_type: "ledger_refresh",
    occurred_at: now,
    skills_used: ["improvement-ledger", "skill-adoption-metrics"],
    outcome_metrics: { task_completed: true },
    verification_metrics: {},
    debt_movement_metrics: movement,
    evidence_references: [ledgerPath],
    privacy_note: {
      raw_prompts_stored: false,
      secrets_stored: false,
      customer_data_stored: false,
      personal_data_stored: false,
      external_publication: false,
      note: "Ledger movement counts only; full findings remain in the project-local ledger.",
    },
  };
  mkdirSync(dirname(resolve(eventStore)), { recursive: true });
  writeFileSync(resolve(eventStore), `${JSON.stringify(event)}\n`, { flag: "a" });
}

function renderText(summary) {
  return `Improvement ledger refresh:
- Ledger: ${summary.ledger}
- Mode: ${summary.write ? "write" : "dry-run"}
- Rows reviewed: ${summary.rows_reviewed}
- Candidates added: ${summary.candidates_added}
- Current-PR blockers skipped: ${summary.current_pr_blockers_skipped}
- Stale candidates: ${summary.stale_candidates.length}
- Status counts: ${Object.entries(summary.status_counts).map(([status, count]) => `${status}=${count}`).join(", ") || "none"}
- Metrics event: ${summary.metrics_event_written ? "written" : "not written"}
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const ledgerPath = resolve(args.ledger);
  if (!existsSync(ledgerPath)) {
    throw new Error(`Ledger not found: ${args.ledger}`);
  }
  const original = readFileSync(ledgerPath, "utf8");
  const parsed = parseLedger(original);
  const today = todayIso();
  const stale = staleCandidates(parsed.rows, today);
  const rawCandidates = args.candidates ? JSON.parse(readFileSync(resolve(args.candidates), "utf8")) : [];
  const candidates = args.candidates ? rawCandidates.filter((candidate) => !candidate.current_pr_blocker) : [];
  const blockersSkipped = args.candidates ? rawCandidates.length - candidates.length : 0;

  let nextText = original;
  if (args.write) {
    nextText = appendCandidates(nextText, parsed.rows, candidates);
    if (args.markStale) {
      nextText = markRowsStale(nextText, stale);
    }
    if (nextText !== original) {
      writeFileSync(ledgerPath, nextText.endsWith("\n") ? nextText : `${nextText}\n`);
    }
  }

  const refreshedRows = parseLedger(nextText).rows;
  const statusCounts = countsByStatus(refreshedRows);
  const movement = debtMovementFromCounts(statusCounts, candidates.length + blockersSkipped);
  const metricsEventWritten = Boolean(args.eventStore && args.taskId);
  if (metricsEventWritten) {
    writeMetricsEvent(args.eventStore, args.taskId, movement, args.ledger);
  }

  const summary = {
    ledger: args.ledger,
    write: args.write,
    rows_reviewed: parsed.rows.length,
    candidates_added: args.write ? candidates.length : 0,
    candidates_pending: args.write ? 0 : candidates.length,
    current_pr_blockers_skipped: blockersSkipped,
    stale_candidates: stale.map((row) => ({ id: row.values.ID, line: row.line + 1, refresh_date: row.values["Refresh date"] })),
    status_counts: statusCounts,
    debt_movement_metrics: movement,
    metrics_event_written: metricsEventWritten,
  };

  console.log(args.json ? JSON.stringify(summary, null, 2) : renderText(summary).trimEnd());
}

try {
  main();
} catch (error) {
  console.error(`ai-ledger-refresh failed: ${error.message}`);
  process.exit(1);
}
