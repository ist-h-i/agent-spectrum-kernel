#!/usr/bin/env node
import assert from "node:assert/strict";
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

  console.log("Codex runner Execution Envelope conformance tests passed");
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
