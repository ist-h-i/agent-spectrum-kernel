# Native Judge transport — candidate execution and evidence

## Scope and decision

Artifact: `SPEC-313-NATIVE-TRANSPORT`, revision 1.
Upstream: Issue #291, PR #313 at `7a081c4e`, and
`FVC-313-JUDGE-PREPARATION-20260928`.

The next useful boundary is an actual child process, not a callback asserting
its own PID/session/output. Implement the native process path and attach its
captured evidence to synthetic qualification. This revision must not enable a
live Judge or admit measured results. The target native binary, credential
boundary and effective all-tools-disabled mechanism are not yet verified.

In particular, read-only sandboxing, approval=never, no tool events and an
unchanged workspace do not establish that tools or file reads were disabled.
Individual CLI toggles are not a verified all-tools policy. The transport
therefore has a synthetic-native capability only; passing `live_native` fails
before credential access, process creation or a Judge ledger claim.

## Behavior and verification contract

Selected proof: **formal_verification_contract**,
`FVC-313-NATIVE-TRANSPORT`, revision 1. Triggers: external process execution,
persistence boundary, cross-module contract and security-sensitive evidence.

| Obligation | Required evidence |
|---|---|
| NT1 | Execute a pinned native image directly, with fixed argv/config and an explicit empty credential-free HOME/environment. No shell launcher, resume, inherited user HOME/environment or caller callback. Machine-managed configuration remains a live-activation check. |
| NT2 | Write an immutable pre-call record. Preserve exact stdin, stdout, stderr, response and session bytes with digests and observed PID/status. Re-open without executing. Do not expose private request bindings or qualification labels to the child. |
| NT3 | Each A/B slot has a new process/workspace/HOME. Timeout, output overflow, tool/unknown events, bad response/session identity, changed workspace/config and residual processes fail closed. Interrupted claims cannot retry. |
| NT4 | Bind the observed capture to the existing two-slot ledger and qualification report without turning synthetic evidence into live qualification or admission. Reject missing/swapped/tampered capture evidence. |
| NT5 | Regress ordinary failure, unknown tokens, fixed A/B agreement and qualification freeze; keep the full 28-trial synthetic scoring path and all live gates unchanged. |

Tests use a compiled native fake. Its output is scripted, not model-generated.
Observed subprocess execution is not provider execution, model qualification,
label approval or proof of OS confinement. Self-review is not independent review.

## External capability research

The official configuration reference documents `features.shell_tool`,
`features.unified_exec`, `web_search`, `tools.view_image` and MCP-specific
allow/deny lists. These are candidate controls, not an all-tools certificate.
See https://developers.openai.com/codex/config-reference/ and
https://developers.openai.com/codex/security/ (checked 2026-09-29).

The inspected official source at `openai/codex@7e049b3eaa17cf01f726ee8ff70da4dcf7557f87`
has an internal extension `ToolPolicy.allowed_tools` and tests for filtering
registered/model-visible tools. Its availability as a user-facing CLI control
for the target binary was not established. No invented CLI flag is used here.

## Activation boundary

Before live activation, an exact target-host profile must establish the tool
inventory and dispatch restrictions, permitted provider connectivity, credential
isolation, parent process configuration and session format. Review and test that
profile before adding a live capability. Do not change `synthetic_only` metadata
to `live_native`, remove a gate, or submit a fake capture as qualification.
No real model call, auth-file copy or billing action is part of this revision.

The [0.157.1 tool-free candidate](prompt-successor-judge-tool-free-profile.md)
provides fixed model metadata, closed launch overrides and a local outbound
request capture probe. The separately authorized third local capture saved one
`POST /v1/responses` with `tools=[]`, verifying zero model-visible tools for
that exact model-free probe. Authenticated live Judge transport, qualification,
and formal admission remain unverified.


## Implementation API

`nativeJudgeLaunchProfile(cliVersion)` returns the fixed launch-profile identity.
A synthetic protocol binds its canonical digest as `runtime_config_digest` and
binds the native image's raw SHA-256 as `native_identity_digest`.
`createSyntheticNativeJudgeAdapter({protocol, executable, cliVersion, captureRoot})`
returns an opaque capability, not an injectable callback. It validates the native
image and its model-free version/help interface. `runJudgeSlots` and
`runJudgeQualification` accept that capability through the existing once-only
claim and budget path. The native entry point consumes a single-use opaque permit
minted only after the ledger starts that slot; callers cannot create a permit
by copying an object.

The transport records an immutable pre-call envelope, creates a fresh process
and directories per slot, and writes bounded raw artifacts and a result record
under `captureRoot`. It detects disallowed stdout events as they arrive and
terminates its process group on failure/timeout/overflow. It does not claim that
this detection prevents the tool action from occurring before the event, or
that a process-group check detects descendants that escape their group. Output
limit failures record stream truncation explicitly. If termination cannot be
confirmed, the evidence remains failed and no later Judge call is authorized.
A failed stdin write, including `EPIPE`, rejects the capture even if the child
returns zero and emits a complete-looking response. Saved `stdin.bin` records
intended bytes, not proof that the child read them; a successful pipe write is
not provider-side receipt attestation. The failed capture remains replayable,
and neither B nor a later sample may execute under either unknown-token policy.
A captured native execution failure stops subsequent calls under either unknown-
token policy; it is not charged as a recoverable ordinary callback failure.
Successful capture usage is rederived from saved stdout when reopened.

`reopenNativeJudgeCapture` revalidates the pinned command, environment, config,
input, saved streams and one-turn session without a subprocess. This verifies
closure in a trusted controller/private-store threat model, not cryptographic
attestation against a malicious writer of that store or host compromise.
Native receipt references include the saved capture digest. A fake caller cannot
impersonate the opaque native adapter by copying its public properties.

The report distinguishes direct capture from effective confinement:
`capture_origin = controller_spawn_and_private_store`,
`tool_isolation_verified = false`, `live_qualification_established = false`.
The native receipt's unknown confinement fields remain null; its desired
protocol settings are not substituted for observed facts. No credentials are
copied or inherited. Because there is no verified live launch profile, this
revision is intentionally not a credential-capable production adapter.

Qualification reports retain native capture digests and private locations.
Bindings require a complete native inventory when any native capture is used,
and the measured-authority path checks those locations against every source's
private deny root. The resulting synthetic freeze requires native captures in
later provenance rather than accepting a callback-only downgrade. This does not
create independent label approval or formal private evaluator admission.

## Tool-free integration consumer

The `0.157.1` execution template now consumes the pinned tool-free catalog and
shared override builder through the existing native A/B pipeline. It uses the
trusted Judge instruction, not the capture-only `OK` instruction. Native image
and catalog snapshots are reverified when captured evidence reopens. The
compiled-fake integration and remaining authenticated-host activation boundary
are specified in [tool-free integration](prompt-successor-judge-tool-free-integration.md).
This is not live activation; `synthetic_only`, unknown observed isolation and
all measured authority gates remain in force.
