# Model-free Judge host bootstrap

Artifact: `SPEC-313-JUDGE-HOST-BOOTSTRAP`, revision 4.
Upstream: Issue #291; PR #313 at `c24bc0ca`; `SPEC-313-JUDGE-LIVE-HOST-AUTHORITY`
and `FVC-313-JUDGE-LIVE-HOST-AUTHORITY` revision 1. This implements stage A of the
reviewed `host-bootstrap-correction.md`, not an authorization for stages B–E.

## Decision and boundary

A diagnosis must not require its own future session evidence before it starts.
The operator's scoped authorization is a pre-execution input; observations are
outputs. A hash proves byte identity, not the operator's right to authorize.
The trusted controller must independently pin the authorization-file hash only
after obtaining explicit approval. No authorization writer is provided here.

This bootstrap is credential-free and loopback-only. It first tests an **outer
Seatbelt policy applied to the whole child process**, then captures one integrated
Judge request with a rejecting local provider. It never calls a real provider,
reads/links real credentials, evaluates labels, or issues live/measurement
capabilities. Authenticated diagnosis, qualification and measured execution need
separate authorization, controls and evidence; this record cannot substitute for
any of them. The old candidate-binding API remains non-authorizing.

The controller, pinned source/images, OS and private store are trusted. Public
synthetic input and child output are not proof of confinement. Host compromise or
a malicious controller/store writer are not covered. No machine-wide settings,
privilege escalation, credential copying, dependencies or firewall changes occur.

## Selected control

For the target macOS arm64 host, `/usr/bin/sandbox-exec` wraps both the fixed
compiled control probe and pinned `codex-cli 0.157.1`. One reconstructed SBPL
policy allows necessary runtime reads, exact input/image files, disposable
runtime writes, and TCP to one loopback port only. It does not broadly allow
`/System`, the user's home, external IPs, DNS, Unix sockets or arbitrary command
execution. An unavailable runtime read stops the probe; there is no permissive
fallback. The loader exception is still system-only: it mirrors Codex 0.157.1's
minimal executable-map/read roots and separately admits the dyld-cache aliases
needed by macOS, including the target-observed
`/System/Volumes/Preboot/Cryptexes/OS/System/Library/dyld`. It grants
`file-map-executable` only on those fixed roots plus read/existence access
there; it does not admit broad `/System`, `/Library`, Preboot, or user-home
reads. This is a candidate macOS profile until actually tested there.

The control probe has positive read/write/connect controls and negative file
read/write, symlink-write, rename/unlink and off-allowlist connection probes.
All files are public disposable canaries, not evaluator/authentication data.
The parent checks the files are accessible without the policy, and confirms the
negative TCP listener is reachable. Mere ENOENT/ECONNREFUSED/timeout is not a
successful denial. A failed positive control or successful prohibited operation
stops before the Codex image starts. Synthetic fixtures never attest Seatbelt.

A symlink is not read-only. The canary stands in for a future read-only credential
source solely to test the outer write boundary. The real auth path is never an
input. Token refresh remains outside scope; its required writes must fail/stop
under a future reviewed credential design, not trigger writable fallback.

## Formal verification contract

Selected path: `formal_verification_contract`,
`FVC-313-JUDGE-HOST-BOOTSTRAP`, revision 4. Triggers: process/HTTP/persistence and
security-sensitive permission/authorization boundaries. Existing TF/NT/JI/LH
obligations are retained.

| ID | Observable acceptance condition |
|---|---|
| HB1 | Approval binds purpose, plan/source/host/inputs, expiry and fixed process/request budgets before any diagnostic process starts. A result cannot mint permission. |
| HB2 | The fixed outer policy has positive and negative controls; uncontrolled success, missing paths, unreachable listeners and all-denied execution never establish confinement. |
| HB3 | Reuse the integrated Judge builder, trusted instruction, packet and response schema; record only the explicit local-provider difference. Verify the raw request, not tool-event absence. |
| HB4 | Save start, OS process outcome, raw streams, HTTP metadata/body and partial observations without overwrites. Unstarted, ambiguous, failed and verified-local outcomes are distinct. No restart after a claim, including concurrency or failure. |
| HB5 | Reopen rederives request/control conclusions and verifies source/input/image/config/permission/approval bindings. Tamper/transplant failures cannot retry or promote a failed record. |
| HB6 | No real credentials/model/qualification/admission/freeze/trials/scoring; synthetic results, local requests and declarations never grant live authority. |

## Implementation contract

Artifact type: implementation. Boundary: shared request/capture utilities,
bootstrap policy/probe/producer/reopener, tests and this specification. Fixed
catalog, Judge rubric, A/B ledger, trial launcher, scorer and budgets are not
changed. Verification commands/results and exact source/tree are recorded in the
PR and the accompanying execution logs. Self-review is not independent review.

## Interfaces for the later, separately authorized target-host check

Preparation compiles the fixed public probe with `/usr/bin/cc`, pins its source
and output image, and snapshots the target image. It starts neither the probe
nor Codex. There is no command to auto-approve the resulting plan.

```sh
node scripts/ask-benchmark-judge-host-bootstrap.mjs prepare \
  --codex-bin <canonical-pinned-native-image> \
  --evidence-root <new-canonical-private-root>
```

The output's `plan_digest` identifies the exact plan. A trusted operator must
provide an external JSON approval with these fields, then independently pass its
raw SHA-256 to `run`: `schema_version="1.0.0"`,
`kind="judge_host_bootstrap_permission"`, `purpose="model_free_host_bootstrap"`,
`operator_reference`, `plan_digest`, `code_digest` from the plan, ISO timestamps
`not_before` and `expires_at` in UTC `YYYY-MM-DDTHH:mm:ss[.sss]Z` form (seconds or exactly three fractional digits), `input_scope="public_synthetic_only"`,
`credential_source="none"`, `network_scope="loopback_only"`,
`max_control_starts=1`, `max_codex_starts=1`, `provider_calls=0`,
`automatic_retries=0`. This document is not that approval. The controller is
responsible for authenticating the operator's authority out of band; the hash
is never treated as a signature or a grant of user consent.

```sh
node scripts/ask-benchmark-judge-host-bootstrap.mjs run \
  --evidence-root <prepared-private-root> --plan-digest <pinned-plan-digest> \
  --permission <external-approval.json> --permission-digest <independently-pinned-raw-sha256>
node scripts/ask-benchmark-judge-host-bootstrap.mjs reopen \
  --evidence-root <prepared-private-root> --plan-digest <pinned-plan-digest> \
  --permission-digest <same-raw-sha256>
```

The permission allows **at most one probe process and one Codex start**, not two
Judge slots or a qualification run. A failing probe consumes the probe allowance
and blocks the Codex start. The filesystem namespace is exclusively reserved
before either process, including across concurrent controller processes. A
claimed namespace without a complete terminal record is `ambiguous`; replay
cannot fill it by starting a replacement process. Replay checks approval validity
at each child's saved pre-spawn request and parent-observed spawn event, not
merely the earlier namespace reservation or today's time. Completion may be after
expiry: the window limits starts, not an already authorized child's lifetime.

`verified_local` means the saved control outcomes and local request met this
bootstrap contract. A `synthetic` record never establishes target confinement.
Even a target `verified_local` record leaves credential supply, authenticated
session origin, provider-only networking, live qualification and measurement
unverified/unpermitted. Loopback allowlisting is not a provider-domain allowlist.
The policy allows only metadata inspection within its stated runtime/evidence
scope and platform metadata ancestors; it does not assert whole-host secrecy.

The integrated capture reuses the production argv builder with an explicit
`capture` provider substitution, HTTP retry counts zero, and WebSockets disabled.
The environment additionally fixes `TMPDIR` to the disposable scratch path. It
retains Judge instructions/schema and the public synthetic packet rather than
the old TF3 `OK` instruction. The historical TF3 bytes/digest and reopening format
are unchanged and are not promoted into this new proof.

The endpoint returns HTTP 400 without forwarding. Nonzero CLI exit is expected;
missing/multiple/incomplete requests, tool inventory, wrong instruction/schema,
stream errors, timeout, signal or residual processes still fail. Raw request
prefixes from aborted/oversized HTTP input are retained and labeled incomplete.
Only header names and Host are saved, not authorization/header secrets. Optional
session/response bytes are retained privately when produced; session presence
remains `captured_unverified`, not authenticated origin. A nonempty final answer
from the rejecting capture is treated as unexpected, not a Judge result.

## Verification and source basis

```sh
node --test scripts/test-ask-benchmark-judge-host-bootstrap.mjs
node --test scripts/test-ask-benchmark-judge-tool-free-profile.mjs \
  scripts/test-ask-benchmark-judge-tool-free-integration.mjs \
  scripts/test-ask-benchmark-judge-native-transport.mjs \
  scripts/test-ask-benchmark-judge-live-host-authority.mjs
node scripts/validate-repo.mjs
node scripts/adapter-runtime-bundle.mjs --check
```

The synthetic mode compiles only checked-in C fixtures. It cannot take a caller's
executable, real credential path or provider URL. Positive file/TCP controls and
HTTP capture execute locally. Negative-denial results are explicitly scripted in
the synthetic success fixture; the unconfined fixture instead performs the real
prohibited syscalls and must fail before any CLI simulation. Neither is evidence
for macOS Seatbelt. Normal development-test repetitions do not consume or revive
any separately granted target-host one-shot permission.

Reviewed primary references (exact tag, not a moving source):
- `openai/codex@rust-v0.157.1/codex-rs/sandboxing/src/seatbelt.rs`,
  `MACOS_PATH_TO_SEATBELT_EXECUTABLE` and `dynamic_network_policy_for_network`:
  https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/sandboxing/src/seatbelt.rs
- Base Seatbelt primitives and child inheritance:
  https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/sandboxing/src/seatbelt_base_policy.sbpl
- Authentication and token-refresh boundary:
  https://developers.openai.com/codex/auth
- Model-command sandbox versus outer CLI-process control:
  https://developers.openai.com/codex/agent-approvals-security

This work executes no target CLI, real provider, new target TF3 capture, credential
operation, real diagnostic/qualification, formal admission/freeze or measured
trial. The next target execution needs its own explicit approval after review;
no prior one-shot allowance is reused. Failure of the macOS policy or required
runtime reads means stop and inspect saved evidence, not weaken the controls.

## Final-event framing correction (F313-HB-01)

Revision 2 tightens HB4/HB5 without changing the outer policy, input, permission
budget or evidence schema. Every nonempty stdout stream must end at a complete
JSONL frame. The shared process observer rejects an unterminated tail, including
a tool event or malformed JSON that follows a valid captured HTTP request.
Bootstrap reopening uses the same event whitelist and framing check on saved
raw stdout; a rehashed process summary cannot hide that tail or promote it to
`verified_local`. Empty stdout remains inspectable for a request-only failure;
it does not independently prove a completed Codex turn.

Regression tests use compiled synthetic HTTP children with a valid one-request
capture followed by an invalid/tool tail without LF. Both must remain failed,
retain the request and raw process evidence, and replay without another start.
The unchanged normal LF-terminated capture must still pass. Historical records
whose success relied on an unchecked tail are rejected on rederivation rather
than rewritten, reexecuted or treated as target-host evidence.


## Independent review corrections (F313-HB-02 / HB-03 / HB-04)

Revision 3 addresses review 5361045447 on `28781878` and supplements HB1, HB2,
HB4 and HB5. It does not grant target-host permission or enable credentials,
authenticated diagnosis, qualification or measured execution.

**HB-02: permission at each launch.** The shared process observer accepts an
optional numeric launch window derived from the independently pinned approval.
After setup, code/artifact checks and input reads, it samples the wall clock and
checks the window immediately before `spawn`, with no intervening I/O or await.
An expired window returns a saved failed observation with null PID and starts no
child. It also timestamps the parent-observed `spawn` event: if OS spawning or
parent scheduling crosses expiry, the child is stopped and the result fails.
This is not a claim of real-time scheduling guarantees or kernel exec timestamps.

Each bootstrap process record now has `launch.requested_at`, `observed_at` and
`completed_at` (UTC milliseconds). Missing spawn observations remain null, never
fabricated. Reopening requires a valid requested/observed time within the saved
approval, chronological request/spawn/completion order, and control completion
before capture launch. It rederives these checks even if the process cause or
result summary is rehashed. `started_at` remains a namespace reservation, not a
substitute for either child launch. Permission expiry during setup or revalidation
consumes the claimed namespace as a failed diagnostic, not a retry opportunity.

**HB-03: the symlink inode is a separate negative control.** The probe directly
attempts `rename` over `home/.codex/auth-canary-link` and `unlink` of the independent
`home/.codex/auth-canary-unlink-link`. A distinct link ensures unexpected rename
success cannot turn the unlink test into a mere missing-file error. Both paths
have explicit write exclusions under `seatbelt-loopback-bootstrap-v3`. Each rename
creates its own disposable source first; source-preparation failure exits the
probe rather than masquerading as a denied destination syscall. Only EPERM/EACCES
for the actual negative operations passes, alongside unchanged positive controls.

Both link targets (or null for a removed/non-link path) are saved as partial
observations. Unexpected mutation produces a failed record instead of discarding
the evidence. Reopening also detects subsequent link-target drift. Scripted
negative outcomes are still explicitly synthetic; the unconfined fixture really
performs both symlink mutations and is rejected before any fake CLI start.

**HB-04: precise timestamps.** Permission dates require the documented UTC format
and a round trip through ISO serialization. Non-ISO text, missing timezone,
impossible dates, normalized 24:00, leap seconds and unsupported fractional or
offset forms are rejected. Real leap dates and inclusive-start/exclusive-end
boundaries have positive tests. Parsing a date is not evidence of its validity.

Bootstrap plans are version 1.1.0 for the per-child launch/link observation
contract. Earlier plans/control traces cannot be promoted to revision-3 success;
they remain historical artifacts to inspect with their corresponding source.
This does not rewrite them, repeat a target attempt, or revive prior permissions.
A new target plan and explicit bounded authorization are required after review.
Native A/B capture callers that do not use a launch window retain their existing
process-record shape; measured-trial launcher, fixed CLI/catalog, scorer and
budgets are unchanged.


## Stage B loader-startup correction (F313-HB-05)

Revision 4 follows the single authorized target-host Stage B attempt recorded in
PR comment `5908824443`. The exact revision-3 plan started the fixed control
process once, which terminated by `SIGABRT` before producing any of the twelve
control rows. The Codex capture did not start and the rejecting HTTP endpoint saw
zero requests. Read-only reopening preserved the same failed result. That
consumed attempt remains historical evidence and is not retryable.

The private crash report places the abort during dyld cache discovery. On the
target macOS 26.6.2 host the shared cache is physically present below
`/System/Volumes/Preboot/Cryptexes/OS/System/Library/dyld`, while the revision-3
policy admitted only `/System/Library/dyld`. The same policy also omitted the
`file-map-executable` operation entirely. Codex 0.157.1's own minimal macOS
platform defaults separately allow executable mapping for fixed system
framework/dylib roots, so denying that operation was an avoidable bootstrap
mismatch even before any Judge request.

Revision 4 therefore changes **only the outer loader policy**:

- policy identity becomes `seatbelt-loopback-bootstrap-v3`;
- executable mapping is allowed on the fixed system framework/dylib roots used
  by the pinned Codex platform defaults, plus fixed dyld-cache roots;
- loader read/existence access is restricted to corresponding system roots;
- metadata traversal is added for the three known Cryptex dyld-cache aliases;
- no broad `/System`, `/Library`, `/System/Volumes/Preboot`,
  `/private/preboot` or user-home subpath allowance is introduced.

The control inventory, public canaries, network allowlist, permission timing,
once-only claim, no-retry behavior, request inspection and all live/measurement
authority boundaries are unchanged. Linux synthetic tests can verify only the
generated policy shape and existing fail-closed behavior; they cannot establish
that macOS accepts the new loader rules or that AMFI/dyld has no additional
requirements.

A new target-host attempt, if pursued, requires: an independently reviewed
revision-4 source, a newly prepared plan/template digest, and a **new explicit
bounded operator permission**. The consumed revision-3 plan/permission may not be
reopened into success, repaired, or reused. Failure of the next control process
must again stop before any Codex capture and must not trigger policy widening or
a second attempt.
