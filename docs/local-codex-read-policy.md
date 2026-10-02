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
