import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalDigest } from "./content-addressed-store.mjs";
import { renderSuccessorStdin, consumeSuccessorPromptInput, assertSuccessorInputRun } from "./ask-benchmark-prompt-successor-delivery.mjs";
import { assertSuccessorAttemptProvenance, verifySuccessorSourceProvenance, inspectSuccessorProvenance } from "./ask-benchmark-prompt-successor-provenance.mjs";
import { buildSuccessorSourceScope } from "./ask-benchmark-prompt-successor.mjs";
import { syntheticPreparation, syntheticScope, syntheticBindingRows, syntheticDigest as d, SYNTHETIC_RUN } from "./test-prompt-successor-fixtures.mjs";
const bytes = (value) => Buffer.from(value, "utf8");

test("stdin substitutes the task literally exactly once", () => {
  const template = bytes("control\n$ARGUMENTS\nend");
  const task = bytes("task $& $` $' $ARGUMENTS 日本語\r\n");
  const before = Buffer.from(template);
  const result = renderSuccessorStdin(template, task);
  assert.equal(result.toString("utf8"), "control\n" + task.toString("utf8") + "\nend");
  assert.deepEqual(template, before);
});
test("transport does not silently remove a UTF-8 BOM", () => {
  assert.deepEqual(renderSuccessorStdin(bytes("\ufeff$ARGUMENTS"), bytes("task")), bytes("\ufefftask"));
});
test("missing or repeated argument markers are rejected", () => {
  for (const t of ["no marker", "$ARGUMENTS/$ARGUMENTS"]) assert.throws(() => renderSuccessorStdin(bytes(t), bytes("task")), { code: "SUCCESSOR_ARGUMENT_MARKER" });
});
test("invalid UTF-8 and oversized stdin fail closed", () => {
  assert.throws(() => renderSuccessorStdin(Buffer.from([0xff]), bytes("task")), { code: "SUCCESSOR_INPUT_ENCODING" });
  assert.throws(() => renderSuccessorStdin(bytes("$ARGUMENTS"), Buffer.alloc(1024 * 1024 + 1, 0x61)), { code: "SUCCESSOR_INPUT_SIZE" });
});
test("matching-looking objects do not create delivery or provenance capabilities", () => {
  for (const handle of [undefined, {}, { kind: "successor_prompt_source_handle" }]) {
    assert.throws(() => consumeSuccessorPromptInput(handle, { caseId: "fake", taskBytes: bytes("task"), expectedTaskDigest: d("task") }));
    assert.throws(() => assertSuccessorInputRun(handle, { adapter: "codex", caseId: "fake", retryFailed: false, maxCases: 1 }));
    assert.throws(() => inspectSuccessorProvenance(handle));
  }
});
test("pre-result source mapping does not require a future claim-dependent request hash", () => {
  const preparation = syntheticPreparation();
  const scope = syntheticScope(preparation);
  assert.equal(scope.source.bindings.some((entry) => Object.hasOwn(entry, "request_digest")), false);
  const source = structuredClone(scope.source);
  source.bindings[0].request_digest = d("future-request");
  assert.throws(() => buildSuccessorSourceScope({ preparation, promptRole: scope.prompt_role, runInstanceId: SYNTHETIC_RUN, source }));
});
function attemptFixture() {
  const prep = syntheticPreparation(); const scope = syntheticScope(prep);
  const { normalized, engineering } = syntheticBindingRows(prep, scope);
  Object.assign(normalized.lineage, {
    raw_result_digest: d("result"), terminal_commit_digest: d("commit"),
    final_output_digest: null, final_output_bytes: null,
    terminal_workspace_authority_digest: null, terminal_workspace_tree_digest: null,
    terminal_workspace_authority_bytes: null, terminal_workspace_authority_availability: "unavailable",
    terminal_workspace_authority_support: "supported",
  });
  const l = normalized.lineage;
  const attempt = {
    attempt: "0001", result: { status: normalized.outcome },
    request: { case_id: l.case_id, adapter: l.adapter_track, condition: l.condition,
      agent: { runtime_identity_digest: l.runtime_identity_digest, effective_command_digest: l.effective_command_digest, environment_snapshot_digest: l.environment_snapshot_digest } },
    evidence: { request_digest: l.request_digest, result_digest: l.raw_result_digest,
      commit_digest: l.terminal_commit_digest,
      ...Object.fromEntries(["final_output_digest", "final_output_bytes", "terminal_workspace_authority_digest", "terminal_workspace_tree_digest", "terminal_workspace_authority_bytes", "terminal_workspace_authority_availability", "terminal_workspace_authority_support"].map((k) => [k, l[k]])) },
  };
  return { normalized, engineering, attempt, runIdentity: { run_instance_id: l.run_instance_id } };
}
test("post-run matching binds the observed request hash, not just its format", () => {
  const fixture = attemptFixture();
  assertSuccessorAttemptProvenance(fixture);
  const bad = structuredClone(fixture); bad.normalized.lineage.request_digest = canonicalDigest({ substituted: true });
  assert.throws(() => assertSuccessorAttemptProvenance(bad));
});
test("result and terminal-workspace substitution is rejected independently", () => {
  for (const field of ["raw_result_digest", "terminal_commit_digest", "final_output_digest", "terminal_workspace_authority_digest"]) {
    const fixture = attemptFixture(); fixture.normalized.lineage[field] = d(`bad:${field}`);
    assert.throws(() => assertSuccessorAttemptProvenance(fixture));
  }
});
test("provenance entrypoint refuses measured data access before importing a verifier", async () => {
  for (const mode of [undefined, "measured", "approved", true]) await assert.rejects(() => verifySuccessorSourceProvenance({ accessMode: mode }), { code: "SUCCESSOR_RESULT_ACCESS_NOT_AUTHORIZED" });
});

test("successor profile denies private reads and network without modifying ordinary command", async () => {
  const { successorEffectiveCommand, assertSuccessorProfileCommand } = await import("./ask-benchmark-prompt-successor-delivery.mjs");
  const privateEvaluatorRoot = "/private/tmp/synthetic-private-evaluator";
  const native = { argv: ["exec", "--model", "synthetic-model", "--sandbox", "workspace-write", "-"], task_transport: "stdin", output_transport: "file", output_schema_digest: null };
  const before = structuredClone(native);
  const proposed = successorEffectiveCommand(native, { privateEvaluatorRoot });
  assert.deepEqual(native, before);
  assert.equal(proposed.argv.includes("--sandbox"), false);
  assert.equal(assertSuccessorProfileCommand(proposed, privateEvaluatorRoot), privateEvaluatorRoot);
  assert.deepEqual(proposed.argv.slice(-3), ["-c", "permissions.ask_issue291.network.enabled=false", "-"]);
  assert.throws(() => successorEffectiveCommand(proposed, { privateEvaluatorRoot }));
  assert.throws(() => successorEffectiveCommand({ ...native, task_transport: "file" }, { privateEvaluatorRoot }));
  assert.throws(() => successorEffectiveCommand(native));
  for (const value of ["permissions.ask_issue291.network.enabled=true", "default_permissions=\"other\""]) {
    const forged = structuredClone(proposed);
    forged.argv.splice(-1, 0, "-c", value);
    assert.throws(() => assertSuccessorProfileCommand(forged));
  }
});

test("declared runtime cannot be replaced by a different valid-looking native digest", async () => {
  const { assertSuccessorAdapterFacts, successorEffectiveCommand } = await import("./ask-benchmark-prompt-successor-delivery.mjs");
  const runtime = syntheticPreparation().runtime;
  const command = successorEffectiveCommand({ argv: ["exec", "--sandbox", "workspace-write", "-"], task_transport: "stdin", output_transport: "file", output_schema_digest: null }, { privateEvaluatorRoot: "/private/tmp/synthetic-private-evaluator" });
  const identity = {
    adapter: "codex", availability: "available", model: runtime.model,
    reasoning_effort: "medium", sandbox_policy: "workspace-write", permission_policy: "never", case_timeout_ms: 900000,
    executable: { executable_basename: "codex", observed_version: runtime.cli_version, executable_sha256: runtime.executable_digest.slice(7) },
    runtime_config_sha256: runtime.configuration_digest.slice(7), effective_command: command,
    effective_command_digest: canonicalDigest(command),
  };
  assert.doesNotThrow(() => assertSuccessorAdapterFacts(runtime, identity));
  for (const field of ["model", "reasoning_effort", "sandbox_policy", "permission_policy", "availability", "runtime_config_sha256"]) {
    assert.throws(() => assertSuccessorAdapterFacts(runtime, { ...identity, [field]: "different" }));
  }
  assert.throws(() => assertSuccessorAdapterFacts(runtime, { ...identity, executable: { ...identity.executable, observed_version: "0.147.0" } }));
  assert.throws(() => assertSuccessorAdapterFacts(runtime, { ...identity, executable: { ...identity.executable, executable_basename: "codex.js" } }));
  assert.throws(() => assertSuccessorAdapterFacts(runtime, { ...identity, executable: { ...identity.executable, executable_sha256: d("substituted-native").slice(7) } }));
});


test("CLI identity does not accept a longer version sharing the expected prefix", async () => {
  const { assertSuccessorVersionOutput } = await import("./ask-benchmark-prompt-successor-delivery.mjs");
  assert.doesNotThrow(() => assertSuccessorVersionOutput("0.153.4", "codex-cli 0.153.4\n"));
  for (const actual of ["codex-cli 0.153.40\n", "codex-cli 10.153.4\n", "codex-cli 0.153.4-beta\n", ""])
    assert.throws(() => assertSuccessorVersionOutput("0.153.4", actual));
});
