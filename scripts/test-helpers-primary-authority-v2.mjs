// Answer-neutral static fixture for the existing loader contract. The inert
// loader is never executed; this grants no native execution authority.
import { createHash } from 'node:crypto';
export function syntheticFocusedScope(loader) {
  const mutation_execution_contract = {
  "revision": "authenticated-generic-loader.v2",
  "runtime": "node-v24.19.0",
  "generic_loader": {
    "path": "authenticated-generic-loader.mjs",
    "bytes": null,
    "sha256": null,
    "answer_neutrality": "identical bytes for every baseline, trial, and variant; no trial-specific authority"
  },
  "authority_transport": {
    "channel": "duplex-pipe-request-fd3-response-fd4",
    "request_descriptor": 3,
    "response_descriptor": 4,
    "stdin_connected": false,
    "argv_env_cwd_marker_disclosure": false,
    "raw_authority_present_in_candidate_process": false
  },
  "isolation_provider": {
    "operating_system": "darwin",
    "provider": "sandbox-exec-default-deny+node-permission-v24",
    "provider_unavailable": "fail-closed",
    "node_permission_flag": "--permission",
    "inspector_signal_disabled": true
  },
  "candidate_workspace": {
    "closed_inventory": [
      "src/session-key.mjs",
      "test/session-key.test.mjs"
    ],
    "implementation_proxy_answer_neutral": true,
    "trusted_implementation_present": false,
    "mutation_source_present": false
  },
  "trusted_api_mediation": {
    "operation_allowlist": [
      "sessionCacheKey"
    ],
    "implementation_location": "trusted-parent-outside-candidate-sandbox",
    "candidate_inputs_only": true,
    "variant_authority_disclosed": false,
    "malformed_or_unknown_request": "fail-closed"
  },
  "authenticated_observation": {
    "scheme": "hmac-sha256",
    "descriptor": 4,
    "schema": "authenticated-boundary-observation.v1",
    "candidate_originated_records_authoritative": false,
    "required_sequence": 1,
    "fail_closed_on": [
      "unsigned",
      "invalid-mac",
      "replay",
      "wrong-nonce",
      "wrong-sequence",
      "malformed-line",
      "duplicate-or-extra-record"
    ]
  },
  "variant_execution": {
    "order": [
      "control",
      "mutant",
      "mutant",
      "control"
    ],
    "fresh_process_per_run": true,
    "fresh_workspace_per_run": true,
    "shared_writable_state": false
  },
  "environment": {
    "policy": "platform-minimal-allowlist.v1",
    "inherited_parent_environment": false,
    "fixed_locale": "C",
    "fixed_timezone": "UTC"
  },
  "candidate_capabilities": {
    "filesystem_read": "isolated-candidate-workspace-only",
    "filesystem_write": "denied",
    "child_process": "denied",
    "worker": "denied",
    "native_addon": "denied",
    "inspector": "denied",
    "network": "denied-before-candidate-module-evaluation",
    "wasi": "denied",
    "permission_model": "required-native-enforcement"
  },
  "failure_mode": "fail-closed"
};
  Object.assign(mutation_execution_contract.generic_loader, { bytes: loader.length, sha256: 'sha256:' + createHash('sha256').update(loader).digest('hex') });
  return { mutation_execution_contract };
}
