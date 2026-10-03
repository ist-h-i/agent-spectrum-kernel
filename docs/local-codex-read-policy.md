# Opt-in declared-denies read policy (Issue #315)

## Implementation Contract

- Artifact ID: issue315-read-policy-implementation; revision: 1.
- Upstream refs: Issue #315; static comparison of #314 and #317; user approval
  `Sentinel_91293770f4fc8191a0ef600051633f67` (2026-10-02 13:34:18 UTC).
- Boundary: adapter plan/command/grant, model-tool session and canary validation,
  owned simulation, documentation. No real CLI/probe/model, OS policy application,
  existing credentials or file modes. Draft #313 and formal #291 remain unchanged.
- Decision: keep v2 closed manifest as default; add a distinct v3 opt-in contract.
  Inherit official `:read-only`, add only trial workspace write and declared
  denies. Do not inherit `:workspace` and its temporary-directory writes.

## Verification Contract

- Artifact ID: issue315-read-policy-verification; revision: 1.
- Selected path: `formal_verification_contract` under
  `ask.verification-proof-policy@1.0.0`; protected permission, cross-module
  session, lifecycle/persistence and regression obligations require formal proof.
- Upstream refs: issue315-read-policy-implementation, Issue #315.
- O1: default closed contract unchanged; opt-in requires exact risk/inventory
  acknowledgement, canonical protected roots, and a separate plan kind.
- O2: source/image/host/command/plan/policy/grant binding rejects old grants,
  changed declarations, extra writes/reads, and policy substitution.
- O3: candidate canary expects declared material denied, unrelated synthetic
  material readable but not writable, workspace writable, loopback denied.
  Failure/unknown stops both trials; no retry or synthetic promotion.
- O4: candidate and legacy evidence reopen without runtime/source/credential
  reads or new calls; sealed policy/report tampering is rejected.
- Checks: focused local-codex/local-eval/pilot suites, shared usage/execution
  regressions, repository validation, diff check, independent final review,
  submitted-head CI (macOS and Ubuntu owned simulation).
- Missing real evidence: actual CLI profile resolution, host sandbox enforcement,
  startup abort fix, Windows/WSL and real OS evaluation remain Unknown. Mock
  canaries and CI do not discharge those obligations. This approval is for
  implementation and mock verification only; no runtime grant is supplied.

## Risk and operator contract

Root read means all host files the current UID and OS can read except declared
denies, including personal documents, other repositories, mounted volumes,
`.ssh`, `.aws`, and `.env` outside the denied CODEX_HOME. Owner-only 0600 files
are readable by the same UID. TCC/OS permissions are not bypassed. Read tool
outputs may enter model requests and be transmitted to OpenAI even though tool
network is denied. Read-only does not mean workspace-only or no transmission.

Grader/answers, controller, private evidence, all other trial workspaces, entire
CODEX_HOME and external runtime stay explicitly denied. The controlled workspace
and pinned CLI helper are narrow existing exceptions. An operator must declare
all known old grader/evidence/result copies and acknowledge inventory completion;
this is an assertion, not automatic discovery or proof that no unlisted copy or
hardlink exists. Unknown copies and general personal-file confidentiality are
not guaranteed. Do not select this candidate on a host with an incomplete known
protected-root inventory. Both conditions use the same policy/model/settings,
fresh sessions/workspaces, no retries, existing timeout/usage limits, private
results and offline replay. #291's formal acceptance criteria are not relaxed.

Official source pinned to
[`36650394`](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/core/src/config/permissions.rs)
and [root read / workspace writes](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/protocol/src/permissions.rs).
This design does not claim broader reads resolve exit134.

## Selection and compatibility

Omit `readPolicy` to retain the v2 closed manifest. To select v3 explicitly,
add this field to the existing preparation descriptor (paths are examples,
not an executable plan):

```json
{
  "readPolicy": {
    "kind": "declared_denies_read_only_v1",
    "riskAcknowledged": true,
    "protectedRootsComplete": true,
    "protectedRoots": ["/absolute/canonical/old-evidence", "/absolute/canonical/old-grader"]
  }
}
```

An empty additional list asserts there are no known copies outside the managed
denies; it does not discover or guarantee their absence. Roots must exist,
be canonical, unique regular files or directories, and be disjoint from current
controlled roots and executable images. Only metadata is inspected, with no
content read, chmod, credential copying or directory traversal. The plan seals
sorted paths and inode/device/owner/type identity; current execution rechecks
identity and refuses drift. Replay does not reopen those paths.

V3 has a separate plan kind, command marker, risk record and
`ask_local_codex_declared_read_permission_v1` envelope. The grant binds the exact
plan/source/image/command/runtime and full trusted CLI/read policy; old v2,
strict or experiment permissions cannot authorize it. The pure permission
builder is a review artifact, never an approval. No execution permission is
created in this implementation task. `live_ready` stays false.

Candidate sessions require exactly root-special read, all declared denies,
one workspace write and the pinned optional helper read. Extra tmp write,
missing root/deny, or additional entries stop identity verification. Native
resolution of this strict expected shape remains unverified; unexpected real
CLI entries fail closed rather than silently expanding the contract.

Canary v2 separates denied material from an unrelated synthetic file which
must be readable but not writable. It also tests reads of declared protected
root paths (no content reads) and workspace writes/IPv4+IPv6 loopback denial.
It is a spot check, not proof that every descendant/copy is protected. Synthetic
fixtures return synthetic-only results and do not apply a real policy. V1
canary results cannot satisfy the candidate. V1/v2 historical saved evidence
and new v3 evidence retain offline replay without source/runtime/auth access.

See [ordinary admission](local-codex-admission.md) for unchanged trusted CLI,
usage, timeout and persistence limits. The candidate currently has only static
source and mock evidence; no new real OS smoke/evaluation was run.

## Implementation evidence and limits

### Inline control bootstrap correction after the approved r2 observation

The approved Mac r2 control at head `ee1e1d00` stopped with exit1 after252ms.
Saved target Node stderr identifies `resolveMainPath` / `realpath` / `lstat`
EPERM at the denied controller root. The canary body was not observed; both
trials remained not_started. Its sealed evidence and consumed grant stay frozen.

An explicit read of a helper file under the controller did not permit Node's
ancestor lookup. Moving it under the denied external runtime would retain the
same ancestor problem. The minimal correction keeps the trusted outer worker
at its source path, but launches the sandbox target as `node --input-type=module
--eval <source-bound module> <canary-json>`. The inline module imports only Node
filesystem/network builtins and uses the same canary/denial functions. It needs
no controller helper entrypoint or relative module dependencies. Control-only
worker/boundary/content-store file-read exceptions are removed; controller,
runtime, evidence, authentication, declared old copies and other-trial denies
and workspace writes remain unchanged. The CLI's separate narrow runtime
session-helper validation is unchanged.

Implementation ID `issue315-inline-control-implementation`, revision1; upstream
Issue315, r2 sealed failure and `issue315-read-policy-implementation`.
Formal Verification ID `issue315-inline-control-verification`, revision1, under
`ask.verification-proof-policy@1.0.0`: O5 proves the mocked denied-ancestor
entrypoint failure, builtin-only inline bootstrap/argument transport, unchanged
deny policy, in-memory canary semantics and existing lifecycle/grant/replay
regressions. Development bootstrap tests never execute a canary body; complete
canary behavior uses mocked filesystem/socket functions only. No real CLI,
sandbox/canary/model/auth or chmod operation is part of this correction.
Mock results cannot establish real startup improvement or host enforcement;
those remain Unknown until separately approved new-head/image/plan/grant checks.

### Bounded new-session selection after the approved r3 observation

At unchanged head `3a9dbc35`, the separately approved Mac r3 inline control
passed (244ms, exit0). One plain trial exited0 with machine grade pass and
stdout-known usage22944, then stopped at `session_identity_failure`: saved
reason `session inventory limit`. Kernel was not started, retry0. This is
not a validated comparison pair. R2/r3 evidence and spent grants remain frozen.

The old selector had the exact stdout `thread.started` ID but recursively
listed the entire existing session tree, stopping after4096 entries. The
correction uses the single canonical UUID from stdout and the persisted
process start/completion window. The existing launch fixes `TZ=UTC`; the
pinned CLI0.157.1 records new ordinary rollouts under
`sessions/YYYY/MM/DD/rollout-YYYY-MM-DDTHH-MM-SS-<thread-id>.jsonl`.
This naming rule comes from the official pinned
[recorder](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/rollout/src/recorder.rs)
(`precompute_new_rollout_path`) and
[filename renderer](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/rollout/src/rollout_file_name.rs).
The selector directly checks at most121 exact per-second candidates within
the120-second trial budget, including a UTC date boundary. It never lists
session directories or reads historical bodies/index/database contents.

Candidate ancestors must be canonical owned non-writable directories without
ACLs; the one selected file must be regular, single-link, owned0600 without
ACLs, modified inside the observed process window, and read through the existing
stable bounded reader. Missing/multiple candidates, malformed/duplicate IDs,
invalid/backward time, links, unsafe metadata or unsupported filename layout
fail closed without a fallback scan. Completion beyond the launch timeout
does not widen the candidate creation window. The existing parser still checks
session/model/provider/workspace/permission identity before the next trial.
File metadata and an exact filename are not substitutes for that parser.

The fake CLI now emits UUIDs and the pinned dated layout. Historical sealed
replay is unchanged: it uses saved session/report bytes, not this live selector.
No runtime/auth permission changes, dependencies, extra CLI/model calls or new
runtime grants are part of this correction. Mock passing evidence does not
establish that the new selector works on this user's actual host.

Implementation ID `issue315-session-selection-implementation`, revision1;
upstream `issue315-inline-control-implementation@1` and r3 sealed observation.
Change C1 replaces global discovery with bounded exact-path selection; C2
updates owned fake fixtures/tests and this explanation. Formal Verification ID
`issue315-session-selection-verification`, revision1, selected under
`ask.verification-proof-policy@1.0.0` (privacy/identity boundary and failed
runtime observation retain formal verification). O6 proves selection independent
of accumulated history, UTC rollover and fixed budget, unique/fresh/private
candidate rejection and unchanged lifecycle/session parser/replay checks.
O1–O5 remain retained upstream obligations; none is relaxed. E6 is the12-test
focused selection regression; final-head lifecycle/shared tests, independent
review and equivalent-tree CI are recorded in Draft317 and Issue315. Real
new-selector admission remains Unknown and requires fresh approval/grant.

- E1 (O1–O4): focused local-codex/local-eval/pilot regression suite passed
  185/185 on the candidate source before commit. Post-commit exact-source
  results and submitted-head CI are recorded in Draft #317's update.
- E2 (O1–O4): independent review checked default preservation, grant/session
  binding, candidate canary, privacy disclosure and offline replay. Baseline,
  architecture, output and adversarial gates passed with no code findings;
  automated gate requires the final submitted-head checks.
- E3: repository validation, adapter runtime bundle freshness and diff check
  passed. Shared usage/delivery passed 47/47; the execution suite's dirty-tree
  precondition required rerunning after commit, not bypassing its guard.
- Supported completion: implementation and mock wiring only. No fresh runtime
  grant, model consumption, actual host policy application, credential change,
  OS support verification, startup repair, merge or formal #291 result.
