#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sensorsScript = resolve(repoRoot, "scripts/ask-sensors.mjs");

const envelope = `Execution Envelope:
\`\`\`json
${JSON.stringify({
  schema_version: "1.0.0",
  route: {
    work_mode: "レビュー",
    operating_mode: "delivery_quality",
    user_facing: "最終レビュー判定を検証する",
    internal: { primary: "review-final-merge-gate" },
  },
  evidence_status: { checked: ["direct review sensor fixture"], missing: [] },
  stop_reason: { status: "none", details: [], human_decision_required: [], stop_if: [] },
  next_action: "complete the bounded decision check",
}, null, 2)}
\`\`\``;

function finding({
  id = "F-MATRIX-001",
  severity = "minor",
  mergeBlocker = false,
} = {}) {
  return `- Finding ID: ${id}
  Severity: ${severity}
  Merge blocker: ${mergeBlocker}
  Practical impact: the final decision must preserve the finding consequence
  Trigger or failure trace: review finding -> final decision
  Evidence location: fixture/review-decision-matrix
  Required post-fix condition: emit the decision required by the closed matrix`;
}

function reviewOutput({
  baselineStatus = "pass",
  additionalGates = "- none",
  missingEvidence = "- none",
  findings = "- none",
  decision,
} = {}) {
  return `Baseline review:
- Gate: review-ai-quality
- Status: ${baselineStatus}
- Evidence: direct decision-matrix fixture

Additional required gates:
${additionalGates}

Missing evidence:
${missingEvidence}

Findings:
${findings}

Decision:
- ${decision}

${envelope}
`;
}

const outputQualityArgs = [
  "--required-gate", "review-output-quality",
  "--observed-signal", "docs_output_change",
];

const cases = [
  {
    label: "baseline pass_with_comments and a nonblocking Minor accept approve_with_comments",
    output: reviewOutput({
      baselineStatus: "pass_with_comments",
      findings: finding(),
      decision: "approve with comments",
    }),
    expectedStatus: "pass",
  },
  {
    label: "additional pass_with_comments accepts approve_with_comments",
    output: reviewOutput({
      additionalGates: "- review-output-quality: status=pass_with_comments; evidence=bounded output comments; signals=docs_output_change",
      decision: "approve with comments",
    }),
    args: outputQualityArgs,
    expectedStatus: "pass",
  },
  {
    label: "clean all-pass accepts approve",
    output: reviewOutput({ decision: "approve" }),
    expectedStatus: "pass",
  },
  {
    label: "clean all-pass rejects approve_with_comments as an empty alias",
    output: reviewOutput({ decision: "approve with comments" }),
    expectedStatus: "fail",
  },
  {
    label: "approve rejects a comment-bearing gate",
    output: reviewOutput({
      additionalGates: "- review-output-quality: status=pass_with_comments; evidence=bounded output comments; signals=docs_output_change",
      decision: "approve",
    }),
    args: outputQualityArgs,
    expectedStatus: "fail",
  },
  {
    label: "approve_with_comments rejects a failing gate",
    output: reviewOutput({
      additionalGates: "- review-output-quality: status=fail; evidence=output defect; signals=docs_output_change",
      decision: "approve with comments",
    }),
    args: outputQualityArgs,
    expectedStatus: "fail",
  },
  {
    label: "approve_with_comments rejects insufficient evidence with named missing evidence",
    output: reviewOutput({
      additionalGates: "- review-output-quality: status=insufficient_evidence; evidence=rendered output unavailable; signals=docs_output_change",
      missingEvidence: "- review-output-quality: rendered output unavailable; render the exact candidate",
      decision: "approve with comments",
    }),
    args: outputQualityArgs,
    expectedStatus: "fail",
  },
  {
    label: "approve_with_comments rejects a merge blocker",
    output: reviewOutput({
      findings: finding({ mergeBlocker: true }),
      decision: "approve with comments",
    }),
    expectedStatus: "fail",
  },
  {
    label: "incomplete Finding is rejected before decision evaluation",
    output: reviewOutput({
      findings: "- Finding ID: F-INCOMPLETE\n  Severity: major\n  Merge blocker: false",
      decision: "request changes",
    }),
    expectedStatus: "fail",
  },
  {
    label: "complete nonblocking Major accepts request_changes",
    output: reviewOutput({
      findings: finding({ severity: "major" }),
      decision: "request changes",
    }),
    expectedStatus: "pass",
  },
  {
    label: "complete nonblocking Major rejects approve_with_comments",
    output: reviewOutput({
      findings: finding({ severity: "major" }),
      decision: "approve with comments",
    }),
    expectedStatus: "fail",
  },
  {
    label: "nonblocking Minor alone rejects request_changes",
    output: reviewOutput({
      findings: finding(),
      decision: "request changes",
    }),
    expectedStatus: "fail",
  },
  {
    label: "Blocker accepts block",
    output: reviewOutput({
      findings: finding({ severity: "blocker", mergeBlocker: true }),
      decision: "block",
    }),
    expectedStatus: "pass",
  },
  {
    label: "clean all-pass rejects block without a blocker",
    output: reviewOutput({ decision: "block" }),
    expectedStatus: "fail",
  },
  {
    label: "named insufficient gate accepts insufficient_evidence",
    output: reviewOutput({
      baselineStatus: "insufficient_evidence",
      missingEvidence: "- review-ai-quality: exact diff unavailable; inspect the current target",
      decision: "insufficient evidence",
    }),
    expectedStatus: "pass",
  },
  {
    label: "clean all-pass rejects insufficient_evidence without an insufficient gate",
    output: reviewOutput({ decision: "insufficient evidence" }),
    expectedStatus: "fail",
  },
  {
    label: "failing gate accepts request_changes",
    output: reviewOutput({
      baselineStatus: "fail",
      decision: "request changes",
    }),
    expectedStatus: "pass",
  },
  {
    label: "block takes precedence over insufficient evidence and failure",
    output: reviewOutput({
      baselineStatus: "fail",
      additionalGates: "- review-output-quality: status=insufficient_evidence; evidence=rendered output unavailable; signals=docs_output_change",
      missingEvidence: "- review-output-quality: rendered output unavailable; render the exact candidate",
      findings: finding({ mergeBlocker: true }),
      decision: "block",
    }),
    args: outputQualityArgs,
    expectedStatus: "pass",
  },
  {
    label: "insufficient evidence takes precedence over failure and Major",
    output: reviewOutput({
      baselineStatus: "fail",
      additionalGates: "- review-output-quality: status=insufficient_evidence; evidence=rendered output unavailable; signals=docs_output_change",
      missingEvidence: "- review-output-quality: rendered output unavailable; render the exact candidate",
      findings: finding({ severity: "major" }),
      decision: "insufficient evidence",
    }),
    args: outputQualityArgs,
    expectedStatus: "pass",
  },
  {
    label: "request_changes takes precedence over comments",
    output: reviewOutput({
      baselineStatus: "fail",
      findings: finding(),
      decision: "request changes",
    }),
    expectedStatus: "pass",
  },
];

const failures = [];
for (const testCase of cases) {
  const result = spawnSync(process.execPath, [
    sensorsScript,
    "--target", repoRoot,
    "--mode", "review",
    "--required-gate", "review-final-merge-gate",
    ...(testCase.args ?? []),
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    input: testCase.output,
  });
  assert.equal(result.status, 0, `${testCase.label}: sensor process failed\n${result.stdout}\n${result.stderr}`);
  if (!result.stdout.includes(`ASK sensors: ${testCase.expectedStatus}`)) {
    failures.push(`${testCase.label}: expected ${testCase.expectedStatus}\n${result.stdout}`);
  }
}

if (failures.length > 0) {
  throw new Error(`Review decision matrix failures (${failures.length})\n${failures.join("\n\n")}`);
}

console.log(`Review decision matrix tests passed (${cases.length} cases)`);
