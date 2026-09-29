import assert from "node:assert/strict";
import {
  existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { canonicalDigest } from "./content-addressed-store.mjs";
import { createJudgeProtocol } from "./ask-benchmark-llm-judge.mjs";
import {
  nativeJudgeLaunchProfile, prepareToolFreeNativeJudgeLaunch, toolFreeNativeJudgeInstruction,
} from "./ask-benchmark-judge-native-transport.mjs";
import {
  JUDGE_TOOL_FREE_CLI_SHA256, JUDGE_TOOL_FREE_MODEL,
} from "./ask-benchmark-judge-tool-free-profile.mjs";
import {
  bindToolFreeNativeJudgeHostEvidence, inspectJudgeLiveHostAuthority, openJudgeLiveHostAuthority,
} from "./ask-benchmark-judge-live-host-authority.mjs";

const d = value => canonicalDigest({ value });

function liveProtocol() {
  const profile = nativeJudgeLaunchProfile("0.157.1");
  return createJudgeProtocol({
    criteria: [{ criterion_id: "lease", rubric: "Use a lease once." }],
    instructionText: toolFreeNativeJudgeInstruction(),
    sourceDigest: d("source"),
    targetManifestDigest: d("target"),
    runtimeProfile: {
      authority_profile: "live_native",
      provider: "openai",
      model: JUDGE_TOOL_FREE_MODEL,
      native_identity_digest: JUDGE_TOOL_FREE_CLI_SHA256,
      runtime_config_digest: canonicalDigest(profile),
      observed_revision: "target-host-candidate",
      transport_kind: "native_cli",
      tools_disabled: true,
      fresh_process_per_slot: true,
      workspace_isolated: true,
      response_format_json: true,
    },
    limits: {
      max_packet_bytes: 65536,
      max_response_bytes: 65536,
      timeout_ms: 3000,
      max_input_tokens_per_call: 1000,
      max_output_tokens_per_call: 1000,
      max_total_tokens: 10000,
      max_samples: 6,
      max_calls: 12,
      unknown_token_policy: "stop_remaining",
    },
  });
}

function authorityBody(protocol, plan) {
  return {
    schema_version: "1.0.0",
    kind: "llm_judge_live_host_authority",
    protocol_digest: protocol.protocol_digest,
    launch_profile_digest: canonicalDigest(plan.profile),
    launch_template_digest: plan.profile.launch_template_digest,
    host: { os: plan.profile.os, arch: plan.profile.arch, node_version: plan.profile.node },
    native_identity_digest: protocol.runtime_profile.native_identity_digest,
    catalog_digest: plan.profile.catalog_digest,
    model: protocol.runtime_profile.model,
    provider: protocol.runtime_profile.provider,
    reasoning_effort: "medium",
    credential_supply: {
      authentication_mode: "chatgpt_subscription",
      source_kind: "read_only_existing_codex_auth_link",
      material_copied: false,
      secret_material_persisted: false,
      evidence_digest: d("credential-supply"),
    },
    tool_dispatch: {
      evidence_digest: d("exact-request-capture"),
      exact_launch_template_observed: true,
      request_count: 1,
      tool_count: 0,
      model: protocol.runtime_profile.model,
      reasoning_effort: "medium",
    },
    network: {
      evidence_digest: d("network"),
      agent_network: "disabled",
      provider_network: "provider_only",
    },
    filesystem: {
      evidence_digest: d("filesystem"),
      fresh_home: true,
      fresh_codex_home: true,
      empty_workspace: true,
      additional_file_access_restricted: true,
    },
    capture_origin: {
      evidence_digest: d("capture-origin"),
      controller_spawned: true,
      private_store: true,
      session_origin_verified: true,
    },
    invocation_authorization: {
      evidence_digest: d("invocation-authorization"),
      scope: "live_qualification_only",
      max_calls: protocol.limits.max_calls,
      automatic_retries: 0,
      result_blind: true,
    },
    satisfied_requirements: [...plan.profile.required_host_evidence],
    measurement_authorized: false,
  };
}

function writeAuthority(path, body) {
  const record = { ...body, record_digest: canonicalDigest(body) };
  writeFileSync(path, JSON.stringify(record) + "\n", { mode: 0o600 });
  return record;
}

function context(t) {
  const root = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-judge-live-authority-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const invocationParent = resolve(root, "invocations");
  mkdirSync(invocationParent, { mode: 0o700 });
  const invocationRoot = resolve(invocationParent, "slot-A");
  const evidencePath = resolve(root, "authority.json");
  const protocol = liveProtocol();
  const plan = prepareToolFreeNativeJudgeLaunch({ protocol, invocationRoot });
  const body = authorityBody(protocol, plan);
  const record = writeAuthority(evidencePath, body);
  return { root, invocationRoot, evidencePath, protocol, plan, body, record };
}

test("candidate host evidence binds opaquely but cannot authorize live execution", t => {
  const c = context(t);
  assert.equal(existsSync(c.invocationRoot), false);
  const authority = openJudgeLiveHostAuthority({
    evidencePath: c.evidencePath, protocol: c.protocol, invocationRoot: c.invocationRoot,
  });
  const summary = inspectJudgeLiveHostAuthority(authority, {
    protocol: c.protocol, invocationRoot: c.invocationRoot,
  });
  assert.equal(summary.authority_record_digest, c.record.record_digest);
  assert.equal(summary.authorization_scope, "live_qualification_only");
  assert.equal(summary.max_calls, 12);
  assert.equal(summary.automatic_retries, 0);
  assert.equal(summary.measurement_authorized, false);

  const bound = bindToolFreeNativeJudgeHostEvidence({
    protocol: c.protocol, invocationRoot: c.invocationRoot, hostAuthority: authority,
  });
  assert.equal(bound.host_evidence_candidate_bound, true);
  assert.equal(bound.live_execution_authorized, false);
  assert.deepEqual(bound.missing_host_evidence, bound.profile.required_host_evidence);
  assert.equal(bound.live_host_authority_record_digest, c.record.record_digest);
  assert.equal(bound.authorization_scope_candidate, "live_qualification_only");
  assert.equal(bound.qualification_call_budget_candidate, 12);
  assert.equal(bound.automatic_retries_candidate, 0);
  assert.equal(bound.measurement_authorized, false);
  assert.equal(existsSync(c.invocationRoot), false);

  assert.throws(() => inspectJudgeLiveHostAuthority({ ...authority }, {
    protocol: c.protocol, invocationRoot: c.invocationRoot,
  }), /opaque_handle_required/);
});

test("repository-controlled files cannot be treated as live-host authority", t => {
  const c = context(t);
  assert.throws(() => openJudgeLiveHostAuthority({
    evidencePath: resolve(import.meta.dirname, "../package.json"),
    protocol: c.protocol,
    invocationRoot: c.invocationRoot,
  }), /external_evidence/);
});

test("host authority reopens exact bytes and rejects post-open mutation", t => {
  const c = context(t);
  const authority = openJudgeLiveHostAuthority({
    evidencePath: c.evidencePath, protocol: c.protocol, invocationRoot: c.invocationRoot,
  });
  const changed = structuredClone(c.body);
  changed.tool_dispatch.tool_count = 1;
  writeAuthority(c.evidencePath, changed);
  assert.throws(() => inspectJudgeLiveHostAuthority(authority, {
    protocol: c.protocol, invocationRoot: c.invocationRoot,
  }), /tool_count/);
});

test("every live-host evidence class stays fail-closed", t => {
  const c = context(t);
  const cases = [
    body => { body.credential_supply.material_copied = true; },
    body => { body.tool_dispatch.exact_launch_template_observed = false; },
    body => { body.network.provider_network = "unrestricted"; },
    body => { body.filesystem.additional_file_access_restricted = false; },
    body => { body.capture_origin.session_origin_verified = false; },
    body => { body.invocation_authorization.scope = "measured_trials"; },
    body => { body.invocation_authorization.max_calls += 2; },
    body => { body.invocation_authorization.automatic_retries = 1; },
    body => { body.invocation_authorization.result_blind = false; },
    body => { body.satisfied_requirements = body.satisfied_requirements.slice(1); },
    body => { body.measurement_authorized = true; },
  ];
  for (const mutate of cases) {
    const body = structuredClone(c.body);
    mutate(body);
    writeAuthority(c.evidencePath, body);
    assert.throws(() => openJudgeLiveHostAuthority({
      evidencePath: c.evidencePath, protocol: c.protocol, invocationRoot: c.invocationRoot,
    }));
  }
});

test("synthetic metadata and profile drift cannot consume live-host authority", t => {
  const c = context(t);
  writeAuthority(c.evidencePath, c.body);
  const syntheticProfile = nativeJudgeLaunchProfile("0.157.1");
  const synthetic = createJudgeProtocol({
    criteria: c.protocol.criteria,
    instructionText: c.protocol.instruction_text,
    sourceDigest: c.protocol.source_digest,
    targetManifestDigest: c.protocol.target_manifest_digest,
    runtimeProfile: {
      authority_profile: "synthetic_only",
      provider: "fake",
      model: "scripted",
      native_identity_digest: d("fake-native"),
      runtime_config_digest: canonicalDigest(syntheticProfile),
      observed_revision: "synthetic",
      transport_kind: "fake_adapter",
      tools_disabled: true,
      fresh_process_per_slot: true,
      workspace_isolated: true,
      response_format_json: true,
    },
    limits: c.protocol.limits,
  });
  assert.throws(() => openJudgeLiveHostAuthority({
    evidencePath: c.evidencePath, protocol: synthetic, invocationRoot: c.invocationRoot,
  }), /live_protocol_required/);

  const body = structuredClone(c.body);
  body.launch_template_digest = d("different-template");
  writeAuthority(c.evidencePath, body);
  assert.throws(() => openJudgeLiveHostAuthority({
    evidencePath: c.evidencePath, protocol: c.protocol, invocationRoot: c.invocationRoot,
  }), /launch_template/);
});
