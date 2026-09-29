import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNoSymlinkPathSegments, canonicalDigest, parseJsonRejectDuplicateKeys,
  readStableBytes, stableCanonicalJson,
} from "./content-addressed-store.mjs";
import { JudgeAuthorityError, verifyJudgeProtocol } from "./ask-benchmark-llm-judge.mjs";
import { prepareToolFreeNativeJudgeLaunch } from "./ask-benchmark-judge-native-transport.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MAX_AUTHORITY_BYTES = 512 * 1024;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const handles = new WeakMap();

function check(ok, code) {
  if (!ok) throw new JudgeAuthorityError(`live_host_authority_${code}`);
}
function closed(value, keys, code) {
  check(value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0"), code);
}
function digest(value, code) { check(typeof value === "string" && DIGEST.test(value), code); }
function same(actual, expected, code) {
  check(stableCanonicalJson(actual) === stableCanonicalJson(expected), code);
}
function authorityPath(path) {
  check(typeof path === "string" && isAbsolute(path) && resolve(path) === path, "path");
  assertNoSymlinkPathSegments(path, "Judge live-host authority");
  const canonical = realpathSync(path);
  const stat = lstatSync(canonical);
  check(stat.isFile() && !stat.isSymbolicLink(), "regular_file");
  return canonical;
}
function readAuthority(path) {
  const canonical = authorityPath(path);
  const value = parseJsonRejectDuplicateKeys(
    readStableBytes(canonical, "Judge live-host authority", MAX_AUTHORITY_BYTES),
    "Judge live-host authority",
  );
  closed(value, [
    "schema_version", "kind", "protocol_digest", "launch_profile_digest",
    "launch_template_digest", "host", "native_identity_digest", "catalog_digest",
    "model", "provider", "reasoning_effort", "credential_supply", "tool_dispatch",
    "network", "filesystem", "capture_origin", "invocation_authorization",
    "satisfied_requirements", "measurement_authorized", "record_digest",
  ], "record_shape");
  const { record_digest: recordDigest, ...body } = value;
  digest(recordDigest, "record_digest");
  same(recordDigest, canonicalDigest(body), "record_digest_mismatch");
  return { path: canonical, value };
}
function validateEvidence(value, protocol, plan) {
  verifyJudgeProtocol(protocol);
  check(protocol.runtime_profile.authority_profile === "live_native", "live_protocol_required");
  check(plan.live_execution_authorized === false, "preparation_must_be_unprivileged");
  same(value.schema_version, "1.0.0", "version");
  same(value.kind, "llm_judge_live_host_authority", "kind");
  same(value.protocol_digest, protocol.protocol_digest, "protocol");
  same(value.launch_profile_digest, canonicalDigest(plan.profile), "launch_profile");
  same(value.launch_template_digest, plan.profile.launch_template_digest, "launch_template");
  same(value.native_identity_digest, protocol.runtime_profile.native_identity_digest, "native_image");
  same(value.catalog_digest, plan.profile.catalog_digest, "catalog");
  same(value.model, protocol.runtime_profile.model, "model");
  same(value.provider, protocol.runtime_profile.provider, "provider");
  same(value.reasoning_effort, "medium", "reasoning_effort");
  closed(value.host, ["os", "arch", "node_version"], "host_shape");
  same(value.host, { os: plan.profile.os, arch: plan.profile.arch, node_version: plan.profile.node }, "host");

  closed(value.credential_supply, [
    "authentication_mode", "source_kind", "material_copied",
    "secret_material_persisted", "evidence_digest",
  ], "credential_shape");
  same(value.credential_supply.authentication_mode, "chatgpt_subscription", "authentication_mode");
  same(value.credential_supply.source_kind, "read_only_existing_codex_auth_link", "credential_source");
  same(value.credential_supply.material_copied, false, "credential_copy");
  same(value.credential_supply.secret_material_persisted, false, "credential_persistence");
  digest(value.credential_supply.evidence_digest, "credential_evidence");

  closed(value.tool_dispatch, [
    "evidence_digest", "exact_launch_template_observed", "request_count",
    "tool_count", "model", "reasoning_effort",
  ], "tool_dispatch_shape");
  digest(value.tool_dispatch.evidence_digest, "tool_dispatch_evidence");
  same(value.tool_dispatch.exact_launch_template_observed, true, "tool_launch_observation");
  same(value.tool_dispatch.request_count, 1, "tool_request_count");
  same(value.tool_dispatch.tool_count, 0, "tool_count");
  same(value.tool_dispatch.model, protocol.runtime_profile.model, "tool_model");
  same(value.tool_dispatch.reasoning_effort, "medium", "tool_reasoning");

  closed(value.network, ["evidence_digest", "agent_network", "provider_network"], "network_shape");
  digest(value.network.evidence_digest, "network_evidence");
  same(value.network.agent_network, "disabled", "agent_network");
  same(value.network.provider_network, "provider_only", "provider_network");

  closed(value.filesystem, [
    "evidence_digest", "fresh_home", "fresh_codex_home", "empty_workspace",
    "additional_file_access_restricted",
  ], "filesystem_shape");
  digest(value.filesystem.evidence_digest, "filesystem_evidence");
  same(value.filesystem.fresh_home, true, "fresh_home");
  same(value.filesystem.fresh_codex_home, true, "fresh_codex_home");
  same(value.filesystem.empty_workspace, true, "empty_workspace");
  same(value.filesystem.additional_file_access_restricted, true, "additional_file_access");

  closed(value.capture_origin, [
    "evidence_digest", "controller_spawned", "private_store", "session_origin_verified",
  ], "capture_origin_shape");
  digest(value.capture_origin.evidence_digest, "capture_origin_evidence");
  same(value.capture_origin.controller_spawned, true, "controller_spawn");
  same(value.capture_origin.private_store, true, "private_store");
  same(value.capture_origin.session_origin_verified, true, "session_origin");

  closed(value.invocation_authorization, [
    "evidence_digest", "scope", "max_calls", "automatic_retries", "result_blind",
  ], "invocation_authorization_shape");
  digest(value.invocation_authorization.evidence_digest, "invocation_authorization_evidence");
  same(value.invocation_authorization.scope, "live_qualification_only", "authorization_scope");
  same(value.invocation_authorization.max_calls, protocol.limits.max_calls, "authorization_call_budget");
  same(value.invocation_authorization.automatic_retries, 0, "authorization_retry");
  same(value.invocation_authorization.result_blind, true, "authorization_result_blind");

  same(value.satisfied_requirements, plan.profile.required_host_evidence, "requirement_inventory");
  same(value.measurement_authorized, false, "measurement_boundary");
  return value;
}

/**
 * Reopen only. This module intentionally has no writer/sealer for host evidence:
 * target-host evidence must be produced by a separately reviewed host workflow.
 */
export function openJudgeLiveHostAuthority({ evidencePath, protocol, invocationRoot }) {
  const plan = prepareToolFreeNativeJudgeLaunch({ protocol, invocationRoot });
  const { path, value } = readAuthority(evidencePath);
  validateEvidence(value, protocol, plan);
  const handle = Object.freeze({ kind: "llm_judge_live_host_authority_handle" });
  handles.set(handle, {
    evidencePath: path,
    recordDigest: value.record_digest,
    protocolDigest: protocol.protocol_digest,
    launchProfileDigest: canonicalDigest(plan.profile),
    launchTemplateDigest: plan.profile.launch_template_digest,
  });
  return handle;
}

export function inspectJudgeLiveHostAuthority(handle, { protocol, invocationRoot }) {
  const state = handles.get(handle);
  check(state !== undefined, "opaque_handle_required");
  const plan = prepareToolFreeNativeJudgeLaunch({ protocol, invocationRoot });
  same(state.protocolDigest, protocol.protocol_digest, "handle_protocol");
  same(state.launchProfileDigest, canonicalDigest(plan.profile), "handle_profile");
  same(state.launchTemplateDigest, plan.profile.launch_template_digest, "handle_template");
  const { path, value } = readAuthority(state.evidencePath);
  same(path, state.evidencePath, "authority_path");
  validateEvidence(value, protocol, plan);
  same(value.record_digest, state.recordDigest, "authority_record_changed");
  return {
    kind: "llm_judge_live_host_authority_summary",
    protocol_digest: value.protocol_digest,
    launch_profile_digest: value.launch_profile_digest,
    launch_template_digest: value.launch_template_digest,
    authority_record_digest: value.record_digest,
    evidence_path_digest: canonicalDigest({ path }),
    authorization_scope: value.invocation_authorization.scope,
    max_calls: value.invocation_authorization.max_calls,
    automatic_retries: value.invocation_authorization.automatic_retries,
    measurement_authorized: false,
  };
}

/**
 * Bind a candidate host-evidence record to the launch plan without granting
 * execution. The evidence producer/reopener for the observed host controls is
 * intentionally still missing and must be supplied by the target-host workflow.
 */
export function bindToolFreeNativeJudgeHostEvidence({ protocol, invocationRoot, hostAuthority }) {
  const plan = prepareToolFreeNativeJudgeLaunch({ protocol, invocationRoot });
  const authority = inspectJudgeLiveHostAuthority(hostAuthority, { protocol, invocationRoot });
  return {
    ...plan,
    host_evidence_candidate_bound: true,
    live_execution_authorized: false,
    missing_host_evidence: [...plan.profile.required_host_evidence],
    live_host_authority_record_digest: authority.authority_record_digest,
    authorization_scope_candidate: authority.authorization_scope,
    qualification_call_budget_candidate: authority.max_calls,
    automatic_retries_candidate: authority.automatic_retries,
    measurement_authorized: false,
  };
}
