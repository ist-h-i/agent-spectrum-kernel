import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { canonicalDigest, stableCanonicalJson } from "./content-addressed-store.mjs";
import { buildJudgePacket, createJudgeProtocol, createJudgeRequest, runJudgeSlots, reopenJudgeResolution } from "./ask-benchmark-llm-judge.mjs";
import { createSyntheticNativeJudgeAdapter, nativeJudgeLaunchProfile, prepareToolFreeNativeJudgeLaunch,
  reopenNativeJudgeCapture, invokeNativeJudgeAdapter, toolFreeNativeJudgeInstruction } from "./ask-benchmark-judge-native-transport.mjs";
import { JUDGE_TOOL_FREE_CATALOG_SHA256, JUDGE_TOOL_FREE_CLI_SHA256, JUDGE_TOOL_FREE_MODEL,
  JUDGE_TOOL_FREE_BASE_INSTRUCTIONS, buildJudgeToolFreeExecutionArgv } from "./ask-benchmark-judge-tool-free-profile.mjs";
import { JUDGE_QUALIFICATION_CLASSES, sealJudgeQualification, runJudgeQualification,
  reopenJudgeQualification, bindJudgeQualificationForFreeze } from "./ask-benchmark-judge-qualification.mjs";

const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const d = value => canonicalDigest({ value });
const source = resolve(import.meta.dirname, "test-fixtures/judge-native-capture-fake.c");
const instruction = readFileSync(resolve(import.meta.dirname, "../docs/prompt-successor-llm-judge.md"), "utf8")
  .match(/```text\n([\s\S]*?)```/u)[1];
function context(t, { scenario = "success", count = 1, timeout = 3000, unknownTokenPolicy = "stop_remaining" } = {}) {
  const root = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-tool-free-integration-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const executable = resolve(root, "fake-codex");
  const compile = spawnSync("cc", ["-std=c11", "-Wall", "-Wextra", "-Werror",
    '-DFAKE_CLI_VERSION="0.157.1"', "-DTOOL_FREE_PROFILE_TEST", source, "-o", executable], { encoding: "utf8" });
  assert.equal(compile.status, 0, compile.stderr ?? String(compile.error));
  const protocol = createJudgeProtocol({ criteria: [{ criterion_id: "lease", rubric: "Use a lease once." }],
    instructionText: instruction, sourceDigest: d("source"), targetManifestDigest: d("target"),
    runtimeProfile: { authority_profile: "synthetic_only", provider: "fake", model: "scripted",
      observed_revision: "synthetic-native-tool-free-test", native_identity_digest: hash(readFileSync(executable)),
      runtime_config_digest: canonicalDigest(nativeJudgeLaunchProfile("0.157.1")), transport_kind: "fake_adapter",
      tools_disabled: true, fresh_process_per_slot: true, workspace_isolated: true, response_format_json: true },
    limits: { max_packet_bytes: 65536, max_response_bytes: 65536, timeout_ms: timeout,
      max_input_tokens_per_call: 100, max_output_tokens_per_call: 100, max_total_tokens: 10000,
      max_samples: count, max_calls: count * 2, unknown_token_policy: unknownTokenPolicy } });
  const samples = Array.from({ length: count }, (_, index) => {
    const packet = buildJudgePacket({ protocol, sampleId: `sample-${index.toString(16).padStart(32, "0")}`,
      task: `Review native test case:${scenario}.`, documents: [{ kind: "source", text: "The lease is used once." }],
      originalOutputBytes: Buffer.from("The lease is used once.") });
    const request = createJudgeRequest({ protocol, packet: packet.packet, originalOutputDigest: packet.original_output_digest,
      privateBinding: { fixture_id: "cal-session-refresh", prompt_role: "current_prompt", run_id: "private-run-123",
        case_id: `private-case-${index}`, sample_index: index, attempt: "0001", normalized_result_digest: d("normalized"),
        source_snapshot_digest: d("snapshot"), original_evaluation_digest: d("evaluation"),
        original_output_digest: packet.original_output_digest, freeze_digest: d("freeze") } });
    return { packet: packet.packet, request };
  });
  const storeRoot = resolve(root, "ledger"), captureRoot = resolve(root, "captures");
  const adapter = createSyntheticNativeJudgeAdapter({ protocol, executable, cliVersion: "0.157.1", captureRoot });
  return { root, executable, protocol, samples, storeRoot, captureRoot, adapter };
}
function changedProtocol(protocol, runtime = {}, instructionText = protocol.instruction_text) {
  return createJudgeProtocol({ criteria: protocol.criteria, instructionText, sourceDigest: protocol.source_digest,
    targetManifestDigest: protocol.target_manifest_digest, runtimeProfile: { ...protocol.runtime_profile, ...runtime }, limits: protocol.limits });
}

test("0.157.1 native Judge requires the pinned tool-free profile instead of the legacy toggles", () => {
  const profile = nativeJudgeLaunchProfile("0.157.1");
  assert.equal(profile.adapter_revision, "native-capture-tool-free-v1");
  assert.equal(profile.catalog_digest, JUDGE_TOOL_FREE_CATALOG_SHA256);
  assert.equal(profile.requested_model, JUDGE_TOOL_FREE_MODEL);
  assert.equal(profile.all_tools_disabled_verified, false);
});

test("preparation is read-only, pins real Judge inputs and names unresolved live host requirements", t => {
  const c = context(t), invocationRoot = resolve(c.root, "not-created");
  const prepared = prepareToolFreeNativeJudgeLaunch({ protocol: c.protocol, invocationRoot });
  assert.equal(existsSync(invocationRoot), false);
  assert.equal(toolFreeNativeJudgeInstruction(), instruction);
  assert.equal(prepared.instruction_digest, hash(Buffer.from(instruction)));
  assert.equal(prepared.live_execution_authorized, false);
  assert.equal(prepared.missing_host_evidence.length, 6);
  assert.ok(prepared.missing_host_evidence.includes("reviewed_credential_supply"));
  assert.ok(prepared.missing_host_evidence.includes("additional_file_access_restriction"));
  assert.ok(prepared.missing_host_evidence.includes("authenticated_tool_dispatch_restriction"));
  assert.ok(prepared.missing_host_evidence.includes("separate_live_invocation_authorization"));
  assert.deepEqual(prepared.argv, buildJudgeToolFreeExecutionArgv(prepared.paths));
  assert.ok(prepared.argv.includes('model_provider="openai"'));
  assert.ok(prepared.argv.includes("model_providers.openai.request_max_retries=0"));
  assert.ok(prepared.argv.includes("model_providers.openai.stream_max_retries=0"));
  assert.ok(prepared.argv.includes("--output-schema"));
  assert.equal(prepared.argv.includes("--ephemeral"), false);
  assert.equal(prepared.argv.some(value => value.startsWith("tools.view_image=")), false);
  assert.equal(prepared.argv.includes(JUDGE_TOOL_FREE_BASE_INSTRUCTIONS), false);
  assert.throws(() => prepareToolFreeNativeJudgeLaunch({ protocol: changedProtocol(c.protocol, {}, JUDGE_TOOL_FREE_BASE_INSTRUCTIONS), invocationRoot }), /capture_instruction_not_judge/);
  assert.throws(() => prepareToolFreeNativeJudgeLaunch({ protocol: changedProtocol(c.protocol, {}, "Return only OK."), invocationRoot }), /judge_instruction_binding/);
});

test("tool-free command reaches A/B, native capture, receipt and read-only replay without relabeling the fake", async t => {
  const c = context(t), input = { ...c, ...c.samples[0] };
  const result = await runJudgeSlots(input);
  assert.equal(result.resolution.overall_status, "resolved");
  assert.notEqual(result.receipts.A.runtime.process_id, result.receipts.B.runtime.process_id);
  assert.notEqual(result.receipts.A.runtime.session_id, result.receipts.B.runtime.session_id);
  for (const slot of ["A", "B"]) {
    const ref = result.receipts[slot].native_capture;
    const saved = reopenNativeJudgeCapture({ reference: ref, ...input, slot });
    const prepared = prepareToolFreeNativeJudgeLaunch({ protocol: c.protocol, invocationRoot: ref.invocation_root });
    assert.deepEqual(saved.precall.argv, prepared.argv);
    assert.deepEqual(saved.precall.environment, prepared.environment);
    assert.equal(saved.precall.source_executable, c.executable);
    assert.equal(saved.precall.executable, prepared.paths.executablePath);
    assert.equal(hash(readFileSync(prepared.paths.executablePath)), c.protocol.runtime_profile.native_identity_digest);
    assert.equal(hash(readFileSync(prepared.paths.catalogPath)), JUDGE_TOOL_FREE_CATALOG_SHA256);
    assert.equal(readFileSync(prepared.paths.instructionPath, "utf8"), instruction);
    assert.equal(readFileSync(prepared.paths.schemaPath, "utf8"), stableCanonicalJson(input.packet.response_schema) + "\n");
    const stdin = readFileSync(resolve(ref.invocation_root, "stdin.bin"), "utf8");
    assert.equal(stdin, stableCanonicalJson(input.packet) + "\n");
    for (const hidden of ["private_binding", "current_prompt", "expected_verdict", "case_class"]) assert.equal(stdin.includes(hidden), false);
    assert.equal(result.receipts[slot].runtime.provider, "fake");
    assert.equal(result.receipts[slot].runtime.model, "scripted");
    assert.equal(result.receipts[slot].runtime.tools_disabled, null);
    assert.equal(result.receipts[slot].runtime.workspace_isolated, null);
    assert.equal(saved.result.tool_isolation_verified, false);
    assert.equal(saved.result.measurement_authorized, false);
    assert.equal(saved.result.usage.metrics.total_tokens.value, 22);
    assert.equal(saved.result.authority_profile, "synthetic_only");
  }
  // A package update must not invalidate reopening the captured image or spawn again.
  writeFileSync(c.executable, "changed source image");
  assert.deepEqual(reopenJudgeResolution(input), result);
  assert.deepEqual(await runJudgeSlots(input), result);
});

for (const policy of ["stop_remaining", "charge_maximum"]) {
  for (const scenario of ["tool", "timeout", "exit", "runtime", "workspace", "multiple-sessions", "residual"]) {
    test(`tool-free native ${scenario} stops A/B and later samples under ${policy}`, async t => {
      const c = context(t, { scenario, count: 2, timeout: scenario === "timeout" ? 100 : 3000, unknownTokenPolicy: policy });
      const input = { ...c, ...c.samples[0] }, result = await runJudgeSlots(input);
      assert.equal(result.receipts.A.status, "transport_error");
      assert.equal(result.receipts.B, null);
      assert.equal(result.resolution.overall_status, "unresolved");
      assert.notEqual(reopenNativeJudgeCapture({ reference: result.receipts.A.native_capture, ...input, slot: "A" }).result.rejection, null);
      assert.deepEqual(await runJudgeSlots(input), result);
      const next = await runJudgeSlots({ ...c, ...c.samples[1] });
      assert.equal(next.receipts.A, null);
      assert.equal(next.receipts.B, null);
      assert.equal(next.slot_states.A, "budget_blocked");
    });
  }
}

test("tool-free invalid JSON and unknown usage remain unresolved without a third call", async t => {
  for (const scenario of ["invalid", "unknown-usage", "reuse"]) {
    const c = context(t, { scenario }), input = { ...c, ...c.samples[0] }, result = await runJudgeSlots(input);
    assert.equal(result.resolution.overall_status, "unresolved");
    if (scenario === "unknown-usage") {
      assert.equal(result.receipts.A.tokens.total, null);
      assert.equal(result.receipts.B, null);
    }
    assert.deepEqual(await runJudgeSlots(input), result);
  }
});

for (const file of ["model-catalog.json", "codex-native", "instruction.txt", "response-schema.json", "home/.codex/config.toml"]) {
  test(`tool-free ${file} drift rejects saved evidence instead of rerunning`, async t => {
    const c = context(t), input = { ...c, ...c.samples[0] }, result = await runJudgeSlots(input);
    const path = resolve(result.receipts.A.native_capture.invocation_root, file), original = readFileSync(path);
    if (file === "codex-native") chmodSync(path, 0o700);
    writeFileSync(path, "changed");
    assert.throws(() => reopenJudgeResolution(input));
    await assert.rejects(runJudgeSlots(input));
    writeFileSync(path, original);
    if (file === "codex-native") chmodSync(path, 0o500);
    assert.deepEqual(reopenJudgeResolution(input), result);
  });
}

test("live metadata, target image and copied launch plans cannot open a synthetic executable path", async t => {
  const c = context(t), root = resolve(c.root, "never-created");
  const live = changedProtocol(c.protocol, { authority_profile: "live_native", provider: "openai", model: "gpt-6-sol",
    transport_kind: "native_cli", native_identity_digest: JUDGE_TOOL_FREE_CLI_SHA256 });
  assert.equal(prepareToolFreeNativeJudgeLaunch({ protocol: live, invocationRoot: root }).live_execution_authorized, false);
  assert.throws(() => createSyntheticNativeJudgeAdapter({ protocol: live, executable: "/never-read", cliVersion: "0.157.1", captureRoot: root }), /live_profile_unverified/);
  const realImage = changedProtocol(c.protocol, { native_identity_digest: JUDGE_TOOL_FREE_CLI_SHA256 });
  assert.throws(() => createSyntheticNativeJudgeAdapter({ protocol: realImage, executable: "/never-read", cliVersion: "0.157.1", captureRoot: root }), /target_image_requires_live_host_evidence/);
  await assert.rejects(runJudgeSlots({ ...c, ...c.samples[0], adapter: { ...c.adapter } }), /opaque_adapter_required/);
  await assert.rejects(invokeNativeJudgeAdapter(c.adapter, { ...c, ...c.samples[0], slot: "A", permit: {} }), /native_invocation_permit_required/);
  assert.equal(existsSync(c.storeRoot), false);
  assert.equal(existsSync(root), false);
  const drift = changedProtocol(c.protocol, { runtime_config_digest: canonicalDigest(nativeJudgeLaunchProfile("0.153.4")) });
  assert.throws(() => createSyntheticNativeJudgeAdapter({ protocol: drift, executable: "/never-read", cliVersion: "0.157.1", captureRoot: root }), /profile_digest/);
});

test("tool-free native qualification retains captures and never becomes live admission", async t => {
  const c = context(t, { count: 6 });
  const samples = c.samples.map(({ packet }, index) => ({ fixture_id: "cal-session-refresh",
    case_class: JUDGE_QUALIFICATION_CLASSES[index], packet, expected: [{ criterion_id: "lease", verdict: "pass" }] }));
  const plan = sealJudgeQualification({ storeRoot: c.storeRoot, protocol: c.protocol, samples,
    labelSource: { kind: "synthetic", source_digest: d("labels"), review_digest: null } });
  const report = await runJudgeQualification({ storeRoot: c.storeRoot, planDigest: plan.plan_digest, adapter: c.adapter });
  assert.equal(report.all_expected_matched, true);
  assert.equal(report.live_qualification_established, false);
  assert.equal(new Set(report.rows.flatMap(row => Object.values(row.native_captures))).size, 12);
  assert.deepEqual(reopenJudgeQualification({ storeRoot: c.storeRoot, planDigest: plan.plan_digest }), report);
  const args = { storeRoot: c.storeRoot, planDigest: plan.plan_digest, reportDigest: report.report_digest,
    protocolDigest: c.protocol.protocol_digest, sourceDigest: c.protocol.source_digest,
    runtimeProfileDigest: canonicalDigest(c.protocol.runtime_profile), targetManifestDigest: c.protocol.target_manifest_digest };
  assert.equal(bindJudgeQualificationForFreeze({ ...args, requireLive: false }).authority_profile, "synthetic_only");
  assert.throws(() => bindJudgeQualificationForFreeze(args), /live_authority_missing/);
});

for (const field of ["argv", "environment", "launch_profile"]) {
  test(`rehashed tool-free ${field} cannot substitute a different launch`, async t => {
    const c = context(t), input = { ...c, ...c.samples[0] }, outcome = await runJudgeSlots(input);
    const ref = outcome.receipts.A.native_capture;
    const precallPath = resolve(ref.invocation_root, "precall.json"), resultPath = resolve(ref.invocation_root, "result.json");
    const precall = JSON.parse(readFileSync(precallPath)), result = JSON.parse(readFileSync(resultPath));
    if (field === "argv") precall.argv = precall.argv.filter(value => value !== "--ignore-user-config");
    else if (field === "environment") precall.environment.CUSTOM_SECRET = "synthetic-sentinel";
    else precall.launch_profile = nativeJudgeLaunchProfile("0.153.4");
    const { record_digest: previousPrecall, ...precallBody } = precall;
    precall.record_digest = canonicalDigest(precallBody);
    result.precall_digest = precall.record_digest;
    const { record_digest: previousResult, ...resultBody } = result;
    result.record_digest = canonicalDigest(resultBody);
    writeFileSync(precallPath, JSON.stringify(precall)); writeFileSync(resultPath, JSON.stringify(result));
    assert.throws(() => reopenNativeJudgeCapture({ ...input, slot: "A", reference: { ...ref, capture_digest: result.record_digest } }));
  });
}

test("source-image drift before invocation leaves a non-retryable claim, not a fabricated capture", async t => {
  const c = context(t), input = { ...c, ...c.samples[0] };
  writeFileSync(c.executable, "changed before start");
  await assert.rejects(runJudgeSlots(input), /binary_drift/);
  const saved = reopenJudgeResolution(input);
  assert.equal(saved.slot_states.A, "ambiguous");
  assert.equal(saved.receipts.A, null);
  assert.equal(saved.receipts.B, null);
  assert.deepEqual(await runJudgeSlots(input), saved);
});

test("concurrent tool-free controllers preserve one two-slot native execution", async t => {
  const c = context(t), input = { ...c, ...c.samples[0] };
  await Promise.all(Array.from({ length: 4 }, () => runJudgeSlots(input)));
  const saved = reopenJudgeResolution(input);
  assert.equal(saved.resolution.overall_status, "resolved");
  assert.notEqual(saved.receipts.A.runtime.process_id, saved.receipts.B.runtime.process_id);
  assert.deepEqual(await runJudgeSlots(input), saved);
});

test("missing 0.157.1 ignore/strict flags stop the interface check before a capture or claim", t => {
  const c = context(t), executable = resolve(c.root, "old-interface"), captureRoot = resolve(c.root, "never-created");
  const compile = spawnSync("cc", ["-std=c11", "-Wall", "-Wextra", "-Werror",
    '-DFAKE_CLI_VERSION="0.157.1"', source, "-o", executable], { encoding: "utf8" });
  assert.equal(compile.status, 0, compile.stderr);
  const protocol = changedProtocol(c.protocol, { native_identity_digest: hash(readFileSync(executable)) });
  assert.throws(() => createSyntheticNativeJudgeAdapter({ protocol, executable, cliVersion: "0.157.1", captureRoot }), /cli_flags_missing/);
  assert.equal(existsSync(captureRoot), false);
  assert.equal(existsSync(c.storeRoot), false);
});
