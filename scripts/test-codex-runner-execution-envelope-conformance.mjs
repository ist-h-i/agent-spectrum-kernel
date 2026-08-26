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
    response: `Change signals:
- signal: isolated fixture
Required gates:
- review-final-merge-gate: fixture
Skipped heavy gates:
- none
Missing evidence:
- none
Decision:
- approve
Blocking evidence:
- none
Passed required gates:
- review-final-merge-gate: fixture
Insufficient evidence:
- none
Non-blocking follow-ups:
- none
Residual risk:
- none
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
if [ -z "$ASK_FAKE_RESULT_PATH" ]; then exit 3; fi
cp "$ASK_FAKE_RESULT_PATH" "$output"
`,
  );
  chmodSync(fakeCodex, 0o755);

  for (const fixture of modeCases) {
    const resultPath = resolve(target, `.fixture-${fixture.mode}.json`);
    const outputRelative = `.agents/runs/conformance-${fixture.mode}.md`;
    writeFileSync(resultPath, `${JSON.stringify(structuredResult(fixture.response), null, 2)}\n`);
    const result = runNode([
      runner,
      "--target", target,
      "--prompt", fixture.prompt,
      "--mode", fixture.mode,
      "--codex-bin", fakeCodex,
      "--output", outputRelative,
      "--json",
    ], { cwd: target, env: { ASK_FAKE_RESULT_PATH: resultPath } });
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
