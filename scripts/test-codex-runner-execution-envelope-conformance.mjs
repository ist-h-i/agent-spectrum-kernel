#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = mkdtempSync(resolve(tmpdir(), "codex-envelope-conformance-"));
const target = resolve(fixtureRoot, "adopting-project");
const coreInstaller = resolve(repoRoot, "scripts/install-kernel.mjs");
const codexInstaller = resolve(repoRoot, "scripts/install-codex-adapter.mjs");
const manifest = JSON.parse(readFileSync(resolve(repoRoot, "manifest.json"), "utf8"));

function runNode(args, { cwd = repoRoot, env = {} } = {}) {
  return spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    maxBuffer: 20 * 1024 * 1024,
  });
}

function runGit(args, { cwd = target } = {}) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function hashText(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableCanonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableCanonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableCanonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function canonicalValueDigest(value) {
  return `sha256:${hashText(stableCanonicalJson(value ?? null))}`;
}

function assertPass(label, result) {
  assert.equal(result.status, 0, `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

function structuredResult(responseMarkdown, control = {}) {
  return {
    schema_version: "1.0.0",
    response_markdown: responseMarkdown,
    control: {
      evidence_status: { checked: ["isolated adopting-project fixture"], missing: [], ...(control.evidence_status ?? {}) },
      stop_reason: { status: "completed", details: [], human_decision_required: [], stop_if: [], ...(control.stop_reason ?? {}) },
      next_action: control.next_action ?? "continue the bounded fixture",
    },
  };
}

function reviewResponse({
  baselineStatus = "pass",
  additionalGates = "- none",
  missingEvidence = "- none",
  findings = "- none",
  decision,
}) {
  return `Baseline review:
- Gate: review-ai-quality
- Status: ${baselineStatus}
- Evidence: isolated installed-runner fixture

Additional required gates:
${additionalGates}

Missing evidence:
${missingEvidence}

Findings:
${findings}
${decision === undefined ? "" : `
Decision:
- ${decision}`}
`;
}

function findingMarkdown({
  findingId = "F-COMPLETE",
  severity = "major",
  mergeBlocker = "false",
  practicalImpact = "callers receive an incorrect review decision",
  triggerOrFailureTrace = "managed review -> finding inventory",
  evidenceLocation = "scripts/ask-sensors.mjs",
  requiredPostFixCondition = "the closed finding inventory is accepted",
  category = "correctness",
} = {}) {
  return `- Finding ID: ${findingId}
  Severity: ${severity}
  Merge blocker: ${mergeBlocker}
  Practical impact: ${practicalImpact}
  Trigger or failure trace: ${triggerOrFailureTrace}
  Evidence location: ${evidenceLocation}
  Required post-fix condition: ${requiredPostFixCondition}${category === null ? "" : `\n  Category: ${category}`}`;
}

function withoutFindingField(markdown, field) {
  return markdown.split("\n").filter((line) => !line.match(new RegExp(`^\\s*(?:-\\s+)?${field}:`, "u"))).join("\n");
}

function fencedFindingExample({ opening = "```", closing = opening, body }) {
  return `${opening}markdown
${body}
${closing}`;
}

function quotedFindingExample(body) {
  return body.split("\n").map((line) => `> ${line}`).join("\n");
}

const modeCases = [
  {
    prompt: "skill-implement.md",
    mode: "implementation",
    emission: "sidecar",
    response: `Implementation Contract:
- Artifact ID: IMPL-CONFORMANCE
- Upstream refs: WP-CONFORMANCE, VER-CONFORMANCE
- Actual change boundary: isolated fixture
- Verification attempted: node scripts/test-codex-runner-execution-envelope-conformance.mjs
- Evidence references: evidence below
- Handoff state: review pending

Evidence:
- Implementation Contract ref: IMPL-CONFORMANCE
- command: node scripts/test-codex-runner-execution-envelope-conformance.mjs
  result: pass
`,
  },
  {
    prompt: "skill-investigate.md",
    mode: "investigation",
    emission: "sidecar",
    response: `Findings:
- Reproduced the isolated fixture.

Cause:
- Fixture cause.

Changed:
- None.

Evidence:
- command: node scripts/test-codex-runner-execution-envelope-conformance.mjs
  result: pass
- Unknown: external runtime unavailable.
`,
  },
  {
    prompt: "skill-review.md",
    mode: "review",
    emission: "sidecar",
    finalDecision: true,
    gatesObserved: true,
    response: `Baseline review:
- Gate: review-ai-quality
- Status: pass
- Evidence: isolated fixture

Additional required gates:
- none

Missing evidence:
- none

Findings:
- none

Decision:
- approve
`,
  },
  {
    prompt: "skill-verify.md",
    mode: "verification",
    emission: "sidecar",
    response: `Verification Contract:
- Artifact ID: VER-CONFORMANCE
- Behavior to prove: installed runner binds the verification profile.

Evidence:
- Verification Contract ref: VER-CONFORMANCE
- command: node scripts/test-codex-runner-execution-envelope-conformance.mjs
  result: pass
`,
  },
  {
    prompt: "skill-handoff.md",
    mode: "handoff",
    emission: "inline_required",
    response: `Task:
- Continue the bounded fixture.

Context:
- Exact isolated adopting-project state.

Allowed scope:
- Fixture only.

Forbidden scope:
- External effects.

Expected output:
- Bounded continuation artifact.

Verification:
- node scripts/test-codex-runner-execution-envelope-conformance.mjs

Unverified evidence:
- External runtime.
`,
  },
];
const legacyEnvelope = `Execution Envelope:
\`\`\`json
${JSON.stringify({
  schema_version: "1.0.0",
  route: {
    work_mode: "実装",
    operating_mode: "delivery_quality",
    user_facing: "implement and verify the scoped change",
    internal: { primary: "controlled-implementation", secondary: ["test-first-verification"] },
  },
  evidence_status: { checked: ["legacy inline fixture"], missing: [] },
  stop_reason: { status: "completed", details: [], human_decision_required: [], stop_if: [] },
  next_action: "continue the bounded fixture",
}, null, 2)}
\`\`\`
`;

try {
  assertPass("core install", runNode([coreInstaller, "--target", target]));
  assertPass("full Codex adapter install", runNode([codexInstaller, "--target", target, "--profile", "full"]));

  const runner = resolve(target, "scripts/codex-exec-runner.mjs");
  const fakeCodex = resolve(target, "fake-codex");
  writeFileSync(
    fakeCodex,
    `#!/bin/sh
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output-last-message" ]; then output="$2"; shift 2; continue; fi
  shift
done
if [ -n "$ASK_FAKE_INVOCATION_PATH" ]; then printf '%s\n' "invoked" >> "$ASK_FAKE_INVOCATION_PATH"; fi
if [ -z "$ASK_FAKE_RESULT_PATH" ]; then exit 3; fi
cp "$ASK_FAKE_RESULT_PATH" "$output"
`,
  );
  chmodSync(fakeCodex, 0o755);

  for (const fixture of modeCases) {
    const resultPath = resolve(target, `.fixture-${fixture.mode}.json`);
    const outputRelative = `.agents/runs/conformance-${fixture.mode}.md`;
    writeFileSync(resultPath, `${JSON.stringify(structuredResult(fixture.response), null, 2)}\n`);
    const runnerArgs = [
      runner,
      "--target", target,
      "--prompt", fixture.prompt,
      "--mode", fixture.mode,
      "--codex-bin", fakeCodex,
      "--output", outputRelative,
      "--json",
    ];
    if (fixture.gatesObserved) runnerArgs.push("--gates-observed");
    if (fixture.finalDecision) runnerArgs.push("--final-decision");
    const result = runNode(runnerArgs, { cwd: target, env: { ASK_FAKE_RESULT_PATH: resultPath } });
    assertPass(`${fixture.mode} managed runner`, result);
    const report = JSON.parse(result.stdout);
    const output = readFileSync(resolve(target, outputRelative), "utf8");
    const visibleMarkers = output.match(/^[ \t]{0,3}Execution Envelope:/gmu) ?? [];
    assert.equal(report.execution_envelope_record?.binding?.entry_id, fixture.prompt, `${fixture.mode} entry binding`);
    assert.equal(report.execution_envelope_record?.binding?.mode, fixture.mode, `${fixture.mode} mode binding`);
    assert.equal(report.execution_envelope_record?.emission_class, fixture.emission, `${fixture.mode} emission`);
    assert.equal(visibleMarkers.length, fixture.emission === "sidecar" ? 0 : 1, `${fixture.mode} visible marker count`);
    assert.equal(report.execution_envelope_record?.persisted, true, `${fixture.mode} record persistence`);
    const persistedRecordPath = resolve(target, ".agent-spectrum-kernel/runtime/execution-envelopes", `${report.execution_envelope_record.record_id}.json`);
    assert.equal(existsSync(persistedRecordPath), true, `${fixture.mode} persisted record file`);
    assert.equal(JSON.parse(readFileSync(persistedRecordPath, "utf8")).record_id, report.execution_envelope_record.record_id, `${fixture.mode} persisted record identity`);
  }

  const validNonBlockingFinding = findingMarkdown();
  const validBlockingFinding = findingMarkdown({
    findingId: "F-MERGE-BLOCKER",
    severity: "blocker",
    mergeBlocker: "true",
    practicalImpact: "the candidate cannot be merged safely",
    requiredPostFixCondition: "the merge-blocking defect is resolved",
  });
  const exampleFinding = findingMarkdown({
    findingId: "F-EXAMPLE-ONLY",
    severity: "blocker",
    mergeBlocker: "true",
    practicalImpact: "example content must not become an actual finding",
    evidenceLocation: "fixture:fenced-example",
    requiredPostFixCondition: "the example remains ignored",
  });
  const completeFindingFields = [
    "Finding ID",
    "Severity",
    "Merge blocker",
    "Practical impact",
    "Trigger or failure trace",
    "Evidence location",
    "Required post-fix condition",
  ];
  const malformedFindingCases = [
    ...completeFindingFields.map((field) => ({ label: `missing ${field}`, findings: withoutFindingField(validNonBlockingFinding, field) })),
    { label: "unknown severity", findings: findingMarkdown({ severity: "critical" }) },
    { label: "unknown merge blocker", findings: findingMarkdown({ mergeBlocker: "unknown" }) },
    { label: "string merge blocker", findings: findingMarkdown({ mergeBlocker: '"true"' }) },
    { label: "duplicate finding ID", findings: `${findingMarkdown({ findingId: "F-DUPLICATE", mergeBlocker: "true" })}\n${findingMarkdown({ findingId: "F-DUPLICATE" })}` },
    { label: "duplicate field", findings: `${validNonBlockingFinding}\n  Severity: major` },
    { label: "unknown field", findings: `${validNonBlockingFinding}\n  Recommendation: reject this extension` },
    { label: "unindented unknown field", findings: `${validNonBlockingFinding}\nRecommendation: reject this extension` },
    { label: "unindented unknown field after none", findings: "- none\nUnknown field: silently accepted" },
    { label: "empty practical impact", findings: findingMarkdown({ practicalImpact: "" }) },
    { label: "empty trigger or failure trace", findings: findingMarkdown({ triggerOrFailureTrace: "" }) },
    { label: "empty evidence location", findings: findingMarkdown({ evidenceLocation: "" }) },
    { label: "empty required post-fix condition", findings: findingMarkdown({ requiredPostFixCondition: "" }) },
    { label: "empty category", findings: findingMarkdown({ category: "" }) },
    { label: "invalid finding ID", findings: findingMarkdown({ findingId: "finding-lowercase" }) },
    {
      label: "invalid merge-blocker impact order",
      findings: `${findingMarkdown({ findingId: "F-NONBLOCKING" })}\n${findingMarkdown({ findingId: "F-BLOCKING", severity: "blocker", mergeBlocker: "true" })}`,
    },
    {
      label: "invalid severity impact order",
      findings: `${findingMarkdown({ findingId: "F-MINOR", severity: "minor" })}\n${findingMarkdown({ findingId: "F-MAJOR", severity: "major" })}`,
    },
    {
      label: "invalid finding ID impact order",
      findings: `${findingMarkdown({ findingId: "F-ZULU" })}\n${findingMarkdown({ findingId: "F-ALPHA" })}`,
    },
  ];
  const malformedDecisionCoverage = [
    { label: "request changes malformed inventory", baselineStatus: "fail", decision: "request changes" },
    { label: "block malformed inventory", baselineStatus: "fail", decision: "block" },
    {
      label: "insufficient evidence malformed inventory",
      baselineStatus: "insufficient_evidence",
      missingEvidence: "- review-ai-quality: exact target unavailable; inspect it",
      decision: "insufficient evidence",
    },
    { label: "approve malformed inventory", decision: "approve" },
    { label: "approve with comments malformed inventory", decision: "approve with comments" },
  ];
  const blockerWithoutMergeConsequenceCases = [
    { label: "approve rejects blocker without merge consequence", decision: "approve" },
    { label: "approve with comments rejects blocker without merge consequence", decision: "approve with comments" },
    { label: "request changes rejects blocker without merge consequence", baselineStatus: "fail", decision: "request changes" },
    { label: "block rejects blocker without merge consequence", baselineStatus: "fail", decision: "block" },
    {
      label: "insufficient evidence rejects blocker without merge consequence",
      baselineStatus: "insufficient_evidence",
      missingEvidence: "- review-ai-quality: exact target unavailable; inspect it",
      decision: "insufficient evidence",
    },
    { label: "review without final decision rejects blocker without merge consequence", baselineStatus: "fail", finalDecision: false },
  ];
  const cleanNonApprovalCases = [
    { label: "clean review rejects request changes", decision: "request changes" },
    { label: "clean review rejects block", decision: "block" },
    { label: "clean review rejects insufficient evidence", decision: "insufficient evidence" },
    { label: "all-pass additional gate rejects request changes", decision: "request changes", additionalGate: true },
    { label: "all-pass additional gate rejects block", decision: "block", additionalGate: true },
    { label: "all-pass additional gate rejects insufficient evidence", decision: "insufficient evidence", additionalGate: true },
    { label: "comment-only baseline rejects request changes", baselineStatus: "pass_with_comments", decision: "request changes" },
    { label: "comment-only baseline rejects block", baselineStatus: "pass_with_comments", decision: "block" },
    { label: "comment-only baseline rejects insufficient evidence", baselineStatus: "pass_with_comments", decision: "insufficient evidence" },
    { label: "comment-only additional gate rejects block", decision: "block", additionalGate: true, additionalStatus: "pass_with_comments" },
    { label: "unexplained insufficient baseline rejects insufficient evidence", baselineStatus: "insufficient_evidence", decision: "insufficient evidence" },
    { label: "unexplained insufficient additional gate rejects insufficient evidence", decision: "insufficient evidence", additionalGate: true, additionalStatus: "insufficient_evidence" },
  ];
  const mixedMissingEvidenceCases = [
    { label: "approve rejects mixed missing evidence", decision: "approve" },
    { label: "approve with comments rejects mixed missing evidence", decision: "approve with comments", findings: validNonBlockingFinding },
    { label: "request changes rejects mixed missing evidence", decision: "request changes", baselineStatus: "fail" },
    { label: "block rejects mixed missing evidence", decision: "block", baselineStatus: "fail" },
    { label: "insufficient evidence rejects mixed missing evidence", decision: "insufficient evidence", baselineStatus: "insufficient_evidence" },
  ];
  const postFenceCases = [
    {
      label: "approve validates a real finding after a backtick example",
      findings: `${fencedFindingExample({ body: exampleFinding })}\n${validNonBlockingFinding}`,
      decision: "approve",
      expectedPass: true,
    },
    {
      label: "approve validates a real finding after a tilde example",
      findings: `${fencedFindingExample({ opening: "~~~", body: exampleFinding })}\n${validNonBlockingFinding}`,
      decision: "approve",
      expectedPass: true,
    },
    {
      label: "approve validates a real finding after a longer closing fence",
      findings: `${fencedFindingExample({ opening: "`````", closing: "```````", body: exampleFinding })}\n${validNonBlockingFinding}`,
      decision: "approve",
      expectedPass: true,
    },
    {
      label: "approve validates a real finding after multiple examples",
      findings: `${fencedFindingExample({ body: exampleFinding })}\n${fencedFindingExample({ opening: "~~~~", body: exampleFinding })}\n${validNonBlockingFinding}`,
      decision: "approve",
      expectedPass: true,
    },
    {
      label: "approve validates a real finding after a quoted example",
      findings: `${quotedFindingExample(exampleFinding)}\n${validNonBlockingFinding}`,
      decision: "approve",
      expectedPass: true,
    },
    {
      label: "request changes rejects post-fence blocker in invalid impact order",
      baselineStatus: "fail",
      findings: `${validNonBlockingFinding}\n${fencedFindingExample({ body: exampleFinding })}\n${validBlockingFinding}`,
      decision: "request changes",
      expectedPass: false,
    },
    {
      label: "block rejects none mixed with a real post-fence finding",
      baselineStatus: "fail",
      findings: `- none\n${fencedFindingExample({ opening: "~~~", body: exampleFinding })}\n${validNonBlockingFinding}`,
      decision: "block",
      expectedPass: false,
    },
    {
      label: "approve rejects a required field missing after a fence",
      findings: `${validNonBlockingFinding}\n${fencedFindingExample({ opening: "````", body: exampleFinding })}\n${withoutFindingField(findingMarkdown({ findingId: "F-POST-FENCE-MISSING" }), "Evidence location")}`,
      decision: "approve",
      expectedPass: false,
    },
    {
      label: "approve with comments rejects an unknown post-fence field",
      findings: `${validNonBlockingFinding}\n${fencedFindingExample({ opening: "~~~~", body: exampleFinding })}\n${findingMarkdown({ findingId: "F-POST-FENCE-UNKNOWN" })}\n  Owner: adapter-local`,
      decision: "approve with comments",
      expectedPass: false,
    },
    {
      label: "request changes rejects a duplicate post-fence finding ID",
      baselineStatus: "fail",
      findings: `${findingMarkdown({ findingId: "F-POST-FENCE-DUPLICATE" })}\n${fencedFindingExample({ body: exampleFinding })}\n${findingMarkdown({ findingId: "F-POST-FENCE-DUPLICATE" })}`,
      decision: "request changes",
      expectedPass: false,
    },
    {
      label: "insufficient evidence rejects malformed finding after multiple fences",
      baselineStatus: "insufficient_evidence",
      missingEvidence: "- review-ai-quality: exact target unavailable; inspect it",
      findings: `${validNonBlockingFinding}\n${fencedFindingExample({ body: exampleFinding })}\n${fencedFindingExample({ opening: "~~~", body: exampleFinding })}\n${withoutFindingField(findingMarkdown({ findingId: "F-POST-FENCE-INSUFFICIENT" }), "Practical impact")}`,
      decision: "insufficient evidence",
      expectedPass: false,
    },
    {
      label: "review without final decision rejects malformed post-fence finding",
      baselineStatus: "fail",
      findings: `${validNonBlockingFinding}\n${fencedFindingExample({ opening: "``````", body: exampleFinding })}\n${withoutFindingField(findingMarkdown({ findingId: "F-POST-FENCE-NO-DECISION" }), "Required post-fix condition")}`,
      finalDecision: false,
      expectedPass: false,
    },
  ];
  const installedDecisionCases = [
    { label: "clean approve remains valid", response: reviewResponse({ decision: "approve" }), expectedPass: true },
    { label: "review without final decision remains valid", response: reviewResponse({}), finalDecision: false, expectedPass: true },
    { label: "baseline fail plus approve", response: reviewResponse({ baselineStatus: "fail", decision: "approve" }), expectedPass: false },
    { label: "baseline insufficient evidence plus approve", response: reviewResponse({ baselineStatus: "insufficient_evidence", missingEvidence: "- review-ai-quality: exact target unavailable; inspect it", decision: "approve" }), expectedPass: false },
    {
      label: "additional gate fail plus approve",
      response: reviewResponse({ additionalGates: "- review-output-quality: status=fail; evidence=output regression; signals=docs_output_change", decision: "approve" }),
      observedSignal: "docs_output_change",
      expectedPass: false,
    },
    {
      label: "additional gate insufficient evidence plus approve",
      response: reviewResponse({
        additionalGates: "- review-output-quality: status=insufficient_evidence; evidence=render unavailable; signals=docs_output_change",
        missingEvidence: "- review-output-quality: render unavailable; render exact candidate",
        decision: "approve",
      }),
      observedSignal: "docs_output_change",
      expectedPass: false,
    },
    { label: "missing evidence plus approve", response: reviewResponse({ missingEvidence: "- final CI: unavailable; run final CI", decision: "approve" }), expectedPass: false },
    {
      label: "blocking finding plus approve",
      response: reviewResponse({
        findings: `- Finding ID: F-BLOCKING
  Severity: blocker
  Merge blocker: true
  Practical impact: required output is unsafe to merge
  Trigger or failure trace: final gate -> blocking finding
  Evidence location: fixture/blocking
  Required post-fix condition: resolve the finding`,
        decision: "approve",
      }),
      expectedPass: false,
    },
    {
      label: "all required gates pass plus approve",
      response: reviewResponse({ additionalGates: "- review-output-quality: status=pass; evidence=exact rendered output; signals=docs_output_change", findings: validNonBlockingFinding, decision: "approve" }),
      observedSignal: "docs_output_change",
      expectedPass: true,
    },
    { label: "approve with comments remains valid", response: reviewResponse({ findings: validNonBlockingFinding, decision: "approve with comments" }), expectedPass: true },
    {
      label: "approve preserves quoted and fenced legacy prose after an empty inventory",
      response: reviewResponse({
        findings: `- none

The quoted legacy label is "Layer summary:" and is not a Finding field.

\`\`\`text
Layer summary:
- legacy example inside a code fence
\`\`\``,
        decision: "approve",
      }),
      expectedPass: true,
    },
    { label: "approve with comments rejects a failing baseline", response: reviewResponse({ baselineStatus: "fail", decision: "approve with comments" }), expectedPass: false },
    { label: "request changes accepts a complete merge blocker", response: reviewResponse({ baselineStatus: "fail", findings: validBlockingFinding, decision: "request changes" }), expectedPass: true },
    { label: "block accepts a complete merge blocker", response: reviewResponse({ baselineStatus: "fail", findings: validBlockingFinding, decision: "block" }), expectedPass: true },
    { label: "insufficient evidence accepts a complete merge blocker", response: reviewResponse({ baselineStatus: "insufficient_evidence", missingEvidence: "- review-ai-quality: exact target unavailable; inspect it", findings: validBlockingFinding, decision: "insufficient evidence" }), expectedPass: true },
    { label: "request changes accepts an explicit non-blocker merge consequence", response: reviewResponse({ baselineStatus: "fail", findings: findingMarkdown({ findingId: "F-MAJOR-MERGE", mergeBlocker: "true" }), decision: "request changes" }), expectedPass: true },
    { label: "request changes accepts an omitted optional category", response: reviewResponse({ baselineStatus: "fail", findings: findingMarkdown({ mergeBlocker: "true", category: null }), decision: "request changes" }), expectedPass: true },
    {
      label: "request changes keeps none findings for a failing additional gate",
      response: reviewResponse({ additionalGates: "- review-output-quality: status=fail; evidence=output regression; signals=docs_output_change", decision: "request changes" }),
      observedSignal: "docs_output_change",
      expectedPass: true,
    },
    { label: "request changes keeps none finding inventory", response: reviewResponse({ baselineStatus: "fail", decision: "request changes" }), expectedPass: true },
    { label: "block keeps none finding inventory", response: reviewResponse({ baselineStatus: "fail", decision: "block" }), expectedPass: true },
    { label: "insufficient evidence keeps none finding inventory", response: reviewResponse({ baselineStatus: "insufficient_evidence", missingEvidence: "- review-ai-quality: exact target unavailable; inspect it", decision: "insufficient evidence" }), expectedPass: true },
    ...cleanNonApprovalCases.map(({ label, decision, baselineStatus = "pass", additionalGate = false, additionalStatus = "pass" }) => ({
      label,
      response: reviewResponse({
        baselineStatus,
        additionalGates: additionalGate ? `- review-output-quality: status=${additionalStatus}; evidence=exact rendered output; signals=docs_output_change` : "- none",
        decision,
      }),
      observedSignal: additionalGate ? "docs_output_change" : undefined,
      expectedPass: false,
    })),
    ...mixedMissingEvidenceCases.map(({ label, decision, baselineStatus = "pass", findings = "- none" }) => ({
      label,
      response: reviewResponse({
        baselineStatus,
        missingEvidence: "- none\n- final CI: unavailable; run final CI",
        findings,
        decision,
      }),
      expectedPass: false,
    })),
    ...malformedFindingCases.map(({ label, findings }) => ({
      label: `approve rejects ${label}`,
      response: reviewResponse({ findings, decision: "approve" }),
      expectedPass: false,
    })),
    ...malformedDecisionCoverage.map(({ label, baselineStatus = "pass", missingEvidence = "- none", decision }) => ({
      label,
      response: reviewResponse({
        baselineStatus,
        missingEvidence,
        findings: withoutFindingField(validNonBlockingFinding, "Evidence location"),
        decision,
      }),
      expectedPass: false,
    })),
    ...blockerWithoutMergeConsequenceCases.map(({ label, baselineStatus = "pass", missingEvidence = "- none", decision, finalDecision = true }) => ({
      label,
      response: reviewResponse({
        baselineStatus,
        missingEvidence,
        findings: findingMarkdown({ findingId: "F-BLOCKER-FALSE", severity: "blocker", mergeBlocker: "false" }),
        decision,
      }),
      finalDecision,
      expectedPass: false,
    })),
    ...postFenceCases.map(({ label, baselineStatus = "pass", missingEvidence = "- none", findings, decision, finalDecision = true, expectedPass }) => ({
      label,
      response: reviewResponse({ baselineStatus, missingEvidence, findings, decision }),
      finalDecision,
      expectedPass,
    })),
  ];
  for (const [index, fixture] of installedDecisionCases.entries()) {
    const resultPath = resolve(target, `.fixture-review-decision-${index}.json`);
    const outputRelative = `.agents/runs/conformance-review-decision-${index}.md`;
    writeFileSync(resultPath, `${JSON.stringify(structuredResult(fixture.response), null, 2)}\n`);
    const runnerArgs = [
      runner,
      "--target", target,
      "--prompt", "skill-review.md",
      "--mode", "review",
      "--codex-bin", fakeCodex,
      "--output", outputRelative,
      "--json",
    ];
    if (fixture.finalDecision !== false) runnerArgs.push("--final-decision");
    if (fixture.observedSignal) runnerArgs.push("--observed-signal", fixture.observedSignal);
    else runnerArgs.push("--gates-observed");
    const result = runNode(runnerArgs, { cwd: target, env: { ASK_FAKE_RESULT_PATH: resultPath } });
    const report = JSON.parse(result.stdout);
    if (fixture.expectedPass) {
      assertPass(`installed review decision semantics: ${fixture.label}`, result);
      assert.equal(report.status, "executed", `${fixture.label} runner status`);
      assert.equal(report.sensor_status, "pass", `${fixture.label} sensor status`);
      assert.equal(report.execution_envelope_record?.persisted, true, `${fixture.label} record persistence`);
      assert.equal(existsSync(resolve(target, outputRelative)), true, `${fixture.label} output publication`);
    } else {
      assert.notEqual(result.status, 0, `${fixture.label} must fail closed`);
      assert.equal(report.status, "insufficient_evidence", `${fixture.label} runner status`);
      assert.equal(report.sensor_status, "fail", `${fixture.label} sensor status`);
      assert.equal(report.execution_envelope_record?.persisted, false, `${fixture.label} record persistence`);
      assert.equal(existsSync(resolve(target, outputRelative)), false, `${fixture.label} output publication`);
      assert.match(report.failures.join("\n"), /ask-sensors rejected output/u, `${fixture.label} rejection reason`);
    }
  }

  const generatedCommands = readFileSync(resolve(target, ".agents/commands/codex-exec.md"), "utf8");
  const generatedReviewCommand = generatedCommands
    .split("\n")
    .find((line) => line.startsWith("node scripts/codex-exec-runner.mjs --prompt skill-review.md"));
  assert.ok(generatedReviewCommand, "generated Codex command template must include the review command");
  assert.match(generatedReviewCommand, /(?:^|\s)--gates-observed(?:\s|$)/u, "generated review command must record completed gate classification by default");
  assert.match(generatedCommands, /remove `--gates-observed` and replace it with repeated exact `--observed-signal <id>` arguments/u, "generated review guidance must explain how to replace the default observation form");
  assert.match(generatedCommands, /Never combine `--gates-observed` with `--observed-signal`/u, "generated review guidance must preserve observation-form mutual exclusion");

  const generatedReviewTokens = generatedReviewCommand.trim().split(/\s+/u);
  assert.equal(generatedReviewTokens.filter((token) => token === "--gates-observed").length, 1, "generated review command must contain exactly one default observation form");
  assert.equal(generatedReviewTokens.includes("--observed-signal"), false, "generated review command must not combine default and exact-signal observation forms");
  assert.deepEqual(generatedReviewTokens.slice(0, 2), ["node", "scripts/codex-exec-runner.mjs"]);
  assertPass("generated review fixture git init", runGit(["init", "-b", "main"]));
  assertPass("generated review fixture git add", runGit(["add", "."]));
  assertPass("generated review fixture git commit", runGit([
    "-c", "user.name=ASK Fixture",
    "-c", "user.email=ask-fixture@example.invalid",
    "commit", "-m", "fixture baseline",
  ]));
  assertPass("generated review fixture origin main", runGit(["update-ref", "refs/remotes/origin/main", "HEAD"]));

  const generatedReviewResponse = `Baseline review:
- Gate: review-ai-quality
- Status: pass
- Evidence: generated command fixture

Additional required gates:
- none

Missing evidence:
- none

Findings:
- none
`;
  const generatedReviewResultPath = resolve(target, ".fixture-generated-review.json");
  const fakeInvocationPath = resolve(target, ".fixture-codex-invocations");
  writeFileSync(generatedReviewResultPath, `${JSON.stringify(structuredResult(generatedReviewResponse), null, 2)}\n`);
  const generatedReviewResult = runNode([
    generatedReviewTokens[1],
    ...generatedReviewTokens.slice(2),
    "--codex-bin", fakeCodex,
    "--json",
  ], {
    cwd: target,
    env: {
      ASK_FAKE_RESULT_PATH: generatedReviewResultPath,
      ASK_FAKE_INVOCATION_PATH: fakeInvocationPath,
    },
  });
  assertPass("generated review command executes without missing gate observation", generatedReviewResult);
  const generatedReviewReport = JSON.parse(generatedReviewResult.stdout);
  assert.equal(generatedReviewReport.execution_evidence?.required_gates?.missing_evidence?.includes("required_gate_observation"), false);
  assert.equal(readFileSync(fakeInvocationPath, "utf8").trim().split("\n").length, 1, "generated review command must invoke Codex once");

  const infrastructureReviewResponse = `Baseline review:
- Gate: review-ai-quality
- Status: pass
- Evidence: infrastructure review fixture

Additional required gates:
- review-architecture-impact: status=pass; evidence=read-only architecture review; signals=infrastructure_change
- risk-gate: status=pass; evidence=read-only risk review; signals=infrastructure_change

Missing evidence:
- none

Findings:
- none
`;
  const infrastructureReviewResultPath = resolve(target, ".fixture-infrastructure-review.json");
  writeFileSync(infrastructureReviewResultPath, `${JSON.stringify(structuredResult(infrastructureReviewResponse), null, 2)}\n`);
  const infrastructureReviewTokens = generatedReviewTokens.filter((token) => token !== "--gates-observed");
  const outputIndex = infrastructureReviewTokens.indexOf("--output");
  infrastructureReviewTokens[outputIndex + 1] = ".agents/runs/conformance-infrastructure-review.md";
  const infrastructureReviewResult = runNode([
    infrastructureReviewTokens[1],
    ...infrastructureReviewTokens.slice(2),
    "--observed-signal", "infrastructure_change",
    "--codex-bin", fakeCodex,
    "--json",
  ], {
    cwd: target,
    env: {
      ASK_FAKE_RESULT_PATH: infrastructureReviewResultPath,
      ASK_FAKE_INVOCATION_PATH: fakeInvocationPath,
    },
  });
  assertPass("read-only infrastructure review executes risk-gate as an evaluation gate", infrastructureReviewResult);
  const infrastructureReviewReport = JSON.parse(infrastructureReviewResult.stdout);
  assert.equal(infrastructureReviewReport.mode, "review");
  assert.equal(infrastructureReviewReport.sandbox, "read-only");
  assert.deepEqual(infrastructureReviewReport.execution_evidence?.required_gates?.gates, [
    "review-ai-quality",
    "review-architecture-impact",
    "risk-gate",
  ]);
  assert.equal(infrastructureReviewReport.execution_evidence?.required_gates?.missing_evidence?.includes("specific_action_approval"), false);
  assert.equal(infrastructureReviewReport.normalized_adapter_event?.approval?.required, false);
  assert.equal(readFileSync(fakeInvocationPath, "utf8").trim().split("\n").length, 2, "read-only risk review must invoke Codex once");

  const conflictingObservationResult = runNode([
    runner,
    "--target", target,
    "--prompt", "skill-review.md",
    "--mode", "review",
    "--gates-observed",
    "--observed-signal", "infrastructure_change",
    "--dry-run",
  ], { cwd: target });
  assert.notEqual(conflictingObservationResult.status, 0, "review observation forms must remain mutually exclusive");
  assert.match(conflictingObservationResult.stderr, /do not combine it with --observed-signal/u);

  const invocationsBeforeWriteReview = readFileSync(fakeInvocationPath, "utf8");
  const writeReviewResult = runNode([
    runner,
    "--target", target,
    "--prompt", "skill-review.md",
    "--mode", "review",
    "--sandbox", "workspace-write",
    "--gates-observed",
    "--codex-bin", fakeCodex,
    "--output", ".agents/runs/conformance-write-review.md",
    "--json",
  ], {
    cwd: target,
    env: {
      ASK_FAKE_RESULT_PATH: generatedReviewResultPath,
      ASK_FAKE_INVOCATION_PATH: fakeInvocationPath,
    },
  });
  assert.notEqual(writeReviewResult.status, 0, "managed review must reject workspace-write sandbox");
  assert.match(writeReviewResult.stderr, /prompt\/sandbox mismatch/u);
  assert.equal(readFileSync(fakeInvocationPath, "utf8"), invocationsBeforeWriteReview, "rejected workspace-write review must not invoke Codex");

  const invocationsBeforeRiskAction = readFileSync(fakeInvocationPath, "utf8");
  const riskActionResult = runNode([
    runner,
    "--target", target,
    "--prompt", "skill-implement.md",
    "--mode", "implementation",
    "--required-gate", "risk-gate",
    "--codex-bin", fakeCodex,
    "--output", ".agents/runs/conformance-risk-action.md",
    "--json",
  ], {
    cwd: target,
    env: {
      ASK_FAKE_RESULT_PATH: generatedReviewResultPath,
      ASK_FAKE_INVOCATION_PATH: fakeInvocationPath,
    },
  });
  assert.notEqual(riskActionResult.status, 0, "non-review risk-gated action must stop without approval");
  const riskActionReport = JSON.parse(riskActionResult.stdout);
  assert.equal(riskActionReport.normalized_adapter_event?.approval?.required, true);
  assert.equal(riskActionReport.normalized_adapter_event?.approval?.status, "missing");
  assert.equal(riskActionReport.normalized_adapter_event?.stop?.status, "risk_gate");
  assert.equal(readFileSync(fakeInvocationPath, "utf8"), invocationsBeforeRiskAction, "non-review risk-gated action must not invoke Codex");

  const recordDirectory = resolve(target, ".agent-spectrum-kernel/runtime/execution-envelopes");
  const fencedExampleResultPath = resolve(target, ".fixture-fenced-example.json");
  const fencedExampleOutputRelative = ".agents/runs/conformance-fenced-example.md";
  const fencedExampleResponse = `${modeCases[0].response}\n\`\`\`\`markdown\n${legacyEnvelope}\`\`\`\`\n`;
  writeFileSync(fencedExampleResultPath, `${JSON.stringify(structuredResult(fencedExampleResponse), null, 2)}\n`);
  const fencedExampleResult = runNode([
    runner,
    "--target", target,
    "--prompt", "skill-implement.md",
    "--mode", "implementation",
    "--codex-bin", fakeCodex,
    "--output", fencedExampleOutputRelative,
    "--json",
  ], { cwd: target, env: { ASK_FAKE_RESULT_PATH: fencedExampleResultPath } });
  assertPass("fenced legacy example remains domain prose", fencedExampleResult);
  const fencedExampleReport = JSON.parse(fencedExampleResult.stdout);
  assert.equal(fencedExampleReport.execution_envelope_record?.emission_class, "sidecar");
  assert.equal(readFileSync(resolve(target, fencedExampleOutputRelative), "utf8"), fencedExampleResponse);

  const recordNamesBeforeMixed = readdirSync(recordDirectory).sort();
  for (const [shape, indentation] of [["legacy_inline", ""], ["indented_legacy_inline", "  "]]) {
    const mixedResponse = `${modeCases[0].response}\n${legacyEnvelope.split("\n").map((line) => line ? `${indentation}${line}` : line).join("\n")}`;
    const resultPath = resolve(target, `.fixture-${shape}.json`);
    const outputRelative = `.agents/runs/conformance-${shape}.md`;
    writeFileSync(resultPath, `${JSON.stringify(structuredResult(mixedResponse), null, 2)}\n`);
    const result = runNode([
      runner,
      "--target", target,
      "--prompt", "skill-implement.md",
      "--mode", "implementation",
      "--codex-bin", fakeCodex,
      "--output", outputRelative,
      "--json",
    ], { cwd: target, env: { ASK_FAKE_RESULT_PATH: resultPath } });
    assert.notEqual(result.status, 0, `${shape} plus structured control must fail closed`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.execution_envelope_record, null, `${shape} must not produce a runner record`);
    assert.equal(existsSync(resolve(target, outputRelative)), false, `${shape} must not publish output`);
    assert.match(report.failures.join("\n"), /duplicates the runner-owned Execution Envelope/u, `${shape} rejection reason`);
    assert.deepEqual(readdirSync(recordDirectory).sort(), recordNamesBeforeMixed, `${shape} must not persist a record`);
  }

  const dailyTarget = resolve(fixtureRoot, "daily-subset-project");
  const dailySkills = manifest.projection_packs.daily_delivery.skills.join(",");
  assertPass("daily subset core install", runNode([coreInstaller, "--target", dailyTarget, "--skills", dailySkills]));
  assert.equal(existsSync(resolve(dailyTarget, "skills/domain-rule-ledger/SKILL.md")), false, "daily core must not install the unselected conditional knowledge Skill");
  assertPass("daily Codex adapter install", runNode([codexInstaller, "--target", dailyTarget, "--profile", "daily"]));
  const dailyRunner = resolve(dailyTarget, "scripts/codex-exec-runner.mjs");
  const dailyDryRun = runNode([
    dailyRunner,
    "--target", dailyTarget,
    "--prompt", "skill-implement.md",
    "--mode", "implementation",
    "--dry-run",
    "--json",
  ], { cwd: dailyTarget });
  assert.equal(dailyDryRun.status, 2, `daily installed runner dry run must use the runner's non-executing exit contract\nstdout:\n${dailyDryRun.stdout}\nstderr:\n${dailyDryRun.stderr}`);
  const dailyDryRunReport = JSON.parse(dailyDryRun.stdout);
  assert.equal(dailyDryRunReport.status, "ready_to_execute");
  assert.deepEqual(dailyDryRunReport.failures, []);
  assert.match(dailyDryRunReport.command, /^codex exec /u);

  const dailyFakeCodex = resolve(dailyTarget, "fake-codex");
  const dailyInvocationPath = resolve(dailyTarget, ".fixture-codex-invocations");
  const dailyResultPath = resolve(dailyTarget, ".fixture-daily-implementation.json");
  const dailyOutputRelative = ".agents/runs/daily-implementation.md";
  writeFileSync(
    dailyFakeCodex,
    `#!/bin/sh
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output-last-message" ]; then output="$2"; shift 2; continue; fi
  shift
done
if [ -n "$ASK_FAKE_INVOCATION_PATH" ]; then printf '%s\n' "invoked" >> "$ASK_FAKE_INVOCATION_PATH"; fi
if [ -z "$ASK_FAKE_RESULT_PATH" ]; then exit 3; fi
cp "$ASK_FAKE_RESULT_PATH" "$output"
`,
  );
  chmodSync(dailyFakeCodex, 0o755);
  writeFileSync(dailyResultPath, `${JSON.stringify(structuredResult(modeCases[0].response), null, 2)}\n`);
  const dailyExecution = runNode([
    dailyRunner,
    "--target", dailyTarget,
    "--prompt", "skill-implement.md",
    "--mode", "implementation",
    "--codex-bin", dailyFakeCodex,
    "--output", dailyOutputRelative,
    "--json",
  ], { cwd: dailyTarget, env: { ASK_FAKE_RESULT_PATH: dailyResultPath, ASK_FAKE_INVOCATION_PATH: dailyInvocationPath } });
  assertPass("daily installed runner fake Codex execution", dailyExecution);
  const dailyExecutionReport = JSON.parse(dailyExecution.stdout);
  assert.equal(dailyExecutionReport.status, "executed");
  assert.equal(dailyExecutionReport.execution_envelope_record?.persisted, true);
  assert.equal(existsSync(resolve(dailyTarget, dailyOutputRelative)), true);

  const dailyState = JSON.parse(readFileSync(resolve(dailyTarget, ".agent-spectrum-kernel/codex-install-state.json"), "utf8"));
  const knowledgeFixture = dailyState.skill_closure?.routing_fixtures?.find((fixture) => fixture.id === "explicit_knowledge_promotion");
  assert.equal(knowledgeFixture?.outcome, "capability_missing", "daily conditional knowledge route must remain unavailable");
  assert.equal(dailyState.selected_skills.includes("domain-rule-ledger"), false);
  const invocationsBeforeCapabilityStop = readFileSync(dailyInvocationPath, "utf8");
  const capabilityMissing = runNode([
    dailyRunner,
    "--target", dailyTarget,
    "--prompt", "skill-implement.md",
    "--mode", "implementation",
    "--required-gate", "domain-rule-ledger",
    "--codex-bin", dailyFakeCodex,
    "--output", ".agents/runs/daily-knowledge-promotion.md",
    "--json",
  ], { cwd: dailyTarget, env: { ASK_FAKE_RESULT_PATH: dailyResultPath, ASK_FAKE_INVOCATION_PATH: dailyInvocationPath } });
  assert.notEqual(capabilityMissing.status, 0, "daily unavailable conditional Skill must stop");
  const capabilityMissingReport = JSON.parse(capabilityMissing.stdout);
  assert.equal(capabilityMissingReport.status, "insufficient_evidence");
  assert.equal(capabilityMissingReport.execution_envelope_record?.envelope?.stop_reason?.status, "capability_missing");
  assert.equal(capabilityMissingReport.normalized_adapter_event?.stop?.status, "capability_missing");
  assert.equal(readFileSync(dailyInvocationPath, "utf8"), invocationsBeforeCapabilityStop, "capability_missing must stop before Codex invocation");

  const selectedProjectionPath = resolve(dailyTarget, ".agents/skills/controlled-implementation/SKILL.md");
  const selectedProjectionContent = readFileSync(selectedProjectionPath, "utf8");
  rmSync(selectedProjectionPath);
  const missingSelectedSkill = runNode([dailyRunner, "--target", dailyTarget, "--prompt", "skill-implement.md", "--mode", "implementation", "--dry-run", "--json"], { cwd: dailyTarget });
  assert.notEqual(missingSelectedSkill.status, 0, "missing selected Skill projection must fail preflight");
  assert.match(missingSelectedSkill.stdout, /Codex discovery skill missing/u);
  writeFileSync(selectedProjectionPath, selectedProjectionContent);

  const selectedCanonicalPath = resolve(dailyTarget, "skills/controlled-implementation/SKILL.md");
  const selectedCanonicalContent = readFileSync(selectedCanonicalPath, "utf8");
  writeFileSync(selectedCanonicalPath, `${selectedCanonicalContent}\nlocal drift\n`);
  const driftedSelectedSkill = runNode([dailyRunner, "--target", dailyTarget, "--prompt", "skill-implement.md", "--mode", "implementation", "--dry-run", "--json"], { cwd: dailyTarget });
  assert.notEqual(driftedSelectedSkill.status, 0, "drifted selected canonical Skill must fail preflight");
  assert.match(driftedSelectedSkill.stdout, /compact-profile canonical source drift: skills\/controlled-implementation\/SKILL\.md/u);
  writeFileSync(selectedCanonicalPath, selectedCanonicalContent);

  const dailyStatePath = resolve(dailyTarget, ".agent-spectrum-kernel/codex-install-state.json");
  writeFileSync(dailyStatePath, `${JSON.stringify({
    ...dailyState,
    selected_skills: dailyState.selected_skills.filter((skill) => skill !== "controlled-implementation"),
  }, null, 2)}\n`);
  const mismatchedSelectedSkillInventory = runNode([dailyRunner, "--target", dailyTarget, "--prompt", "skill-implement.md", "--mode", "implementation", "--dry-run", "--json"], { cwd: dailyTarget });
  assert.notEqual(mismatchedSelectedSkillInventory.status, 0, "selected Skill state must remain bound to the projected inventory");
  assert.match(mismatchedSelectedSkillInventory.stdout, /compact-profile canonical source selected_skill_inventory_mismatch: selected_skills/u);
  writeFileSync(dailyStatePath, `${JSON.stringify(dailyState, null, 2)}\n`);

  const coordinatedState = JSON.parse(JSON.stringify(dailyState));
  coordinatedState.selected_skills = coordinatedState.selected_skills.filter((skill) => skill !== "controlled-implementation");
  coordinatedState.projection_plan.projected_managed_assets = coordinatedState.projection_plan.projected_managed_assets
    .filter((asset) => asset.path !== ".agents/skills/controlled-implementation/SKILL.md");
  const projection = coordinatedState.projection_plan;
  const coordinatedFingerprint = canonicalValueDigest({
    canonical_source_digest: projection.canonical_source_digest,
    renderer_id: projection.renderer_id,
    renderer_version: projection.renderer_version,
    renderer_profile: projection.renderer_profile,
    plan_shaping_options: projection.plan_shaping_options,
    renderer_inputs_digest: canonicalValueDigest(projection.renderer_inputs),
    managed_inventory_digest: canonicalValueDigest(projection.projected_managed_assets),
  });
  projection.fingerprint = coordinatedFingerprint;
  const dailyPromptPath = resolve(dailyTarget, ".agents/prompts/skill-implement.md");
  const dailyPromptContent = readFileSync(dailyPromptPath, "utf8");
  const coordinatedPromptContent = dailyPromptContent.replace(/^<!-- ASK_CODEX_COMPACT_PROFILE (\{[^\n]+\}) -->/u, (_line, metadata) => {
    const parsed = JSON.parse(metadata);
    parsed.p = coordinatedFingerprint.replace(/^sha256:/u, "");
    return `<!-- ASK_CODEX_COMPACT_PROFILE ${JSON.stringify(parsed)} -->`;
  });
  const promptRecord = coordinatedState.managed_files[".agents/prompts/skill-implement.md"];
  promptRecord.content = coordinatedPromptContent;
  promptRecord.sha256 = hashText(coordinatedPromptContent);
  promptRecord.compact_profile.profile_fingerprint = coordinatedFingerprint;
  promptRecord.compact_profile.rendered_sha256 = `sha256:${hashText(coordinatedPromptContent)}`;
  const selectedCompactProfile = coordinatedState.compact_runtime_profiles.find((profile) => profile.profile_id === promptRecord.compact_profile.profile_id);
  selectedCompactProfile.profile_fingerprint = coordinatedFingerprint;
  selectedCompactProfile.rendered_sha256 = promptRecord.compact_profile.rendered_sha256;
  writeFileSync(dailyPromptPath, coordinatedPromptContent);
  writeFileSync(dailyStatePath, `${JSON.stringify(coordinatedState, null, 2)}\n`);
  const missingMandatoryPromptContract = runNode([dailyRunner, "--target", dailyTarget, "--prompt", "skill-implement.md", "--mode", "implementation", "--dry-run", "--json"], { cwd: dailyTarget });
  assert.notEqual(missingMandatoryPromptContract.status, 0, "mandatory prompt contracts must remain selected and projected");
  assert.match(missingMandatoryPromptContract.stdout, /selected prompt contract required_skill_not_selected: controlled-implementation/u);
  writeFileSync(dailyPromptPath, dailyPromptContent);
  writeFileSync(dailyStatePath, `${JSON.stringify(dailyState, null, 2)}\n`);

  console.log("Codex runner Execution Envelope conformance tests passed");
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
