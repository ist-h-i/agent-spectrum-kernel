# Runtime-successor Prompt comparison: preparation contract

Status: **Draft preparation; not authorized or ready for measured execution.**
Upstream: #289, #235, #234. Baseline: main `596db3d19a1eb76ef2104a6313e6d4ffc1262ce7`.

## Decision and owned boundary

Preserve the completed #234 experiment, rather than restore its old CLI forever or
silently replace its frozen runtime. This additive preparation contract identifies a
successor. The same exact declared runtime/model/config is used for both existing
Prompt roles. Four existing fixtures retain 3/3/3/5 repetitions: 28 Codex cases,
14 paired blocks. Claude is outside this decision scope, not a successful missing
track. The inherited threshold digest retains the old Prompt-lightening criteria;
it is not a universal model-upgrade policy.

This change prepares local testing. It does **not** add an executable measured
runner, finalize #277 selections or #278 experiment authority, or claim that the
candidate CLI, backend, argv or isolation works. The next host verification must
establish those facts before a separately authorized smoke or measured run. No
mutable `latest` fallback is accepted. Provider revision can remain explicitly
unknown; a local version pin is not a deterministic-output guarantee.

## Implementation and exact source identity

- `ask-benchmark-prompt-successor.mjs`: closed input validation, deterministic
  preparation, pre-result source mapping, append-only in-memory resume transitions
  and proposed argv. No child process or result reader.
- `ask-benchmark-prompt-successor-repository.mjs`: actual unchanged #234 loader and
  validators produce the parent reference. A clean Git identity and the loaded
  module bytes bind preparation to the checked-out implementation.
- `ask-benchmark-prompt-successor-bridge.mjs`: explicit scoped reader over existing
  #197 normalized, engineering-result and source-manifest validators; not a second
  raw scorer or a general verification bypass.
- `ask-benchmark-prompt-successor-check.mjs`: Node24 inspect/prepare/validate, JSON
  stdout only. Unknown commands (including run, exec and smoke) fail with exit 2
  before imports/reads/spawn. This entrypoint cannot launch Codex.

The CLI uses no dependency beyond repository modules and Node builtins. No runtime
bundle, old protocol, frozen CAS, private evaluator, workflow or current defaults
are changed. PR #288's documentary correction is independent.

A runtime proposal must explicitly identify CLI version, executable bytes, Node24,
OS/architecture, model, provider revision status, auth class (not credentials),
config digest, direct native executable digest, reasoning, sandbox/approval/network and timeout. These
are declarations that a host test must substantiate, **not attestation from a
matching hash or user-supplied `verified: true`**. Unknown model/auth/config inputs
block preparation rather than being fabricated. The fixture helpers use a clearly
synthetic model name only; it must never be sent to a provider.

## Preparation and historical preservation

Every field inventory is closed by executable validators. A preparation includes
its predecessor's preregistration, binding, source, scorer, thresholds, fixture and
Prompt content identities, plus the successor implementation/runtime and reason.
Balanced deterministic ordering, case identities, scope and all permissions are
rederived on validation. Changing a runtime, seed or parent changes every dependent
identity. A modified inventory/order/permission cannot retain its old digest.

`source_prompt` means historical source content, not that a historical selection or
Evolution experiment applies to a new runtime. New runtime-bound selection and
experiment authorities must be generated/reviewed later without rewriting old
objects. Preparation does not grant admission, activation, execution or efficacy.

## Concrete #197 gap and scoped source adapter

The ordinary `verifyEngineeringResultSet`/collector requires all four native
conditions for each fixture and repetition. Applying it directly to one Prompt
role's fourteen `full_ask` cases fails. Changing its ordinary completeness rule or
fabricating other conditions would weaken historical product validation.

The new adapter therefore explicitly verifies a **scoped source**, not an ordinary
complete four-condition result set. Each Prompt role has a separate native run and
an externally pinned, pre-result map from all fourteen successor cases to native
case/request/environment/command/runtime/materialization identities. Native
`plan_id` and plan content digest are different authorities; they are not equated.
Any other source-plan cases must be unexecuted; hidden attempts/retries are refused.

The adapter calls real `verifyNormalizedPortfolioResults` (exact saved snapshot),
`validateNormalizedPortfolioResult`, `validatePortfolioEngineeringResult`, and
`validateEngineeringResultSourceManifest`. It rereads stable, bounded, disjoint,
non-symlink source files and inventories, binds every raw/normalized field, rejects
missing/extra/duplicate/transplanted data and returns a private WeakMap-backed
reader. Results returned to consumers are detached copies. No injected resolver
can confer verified-reader status by echoing fields.

Important trust limits:

- These APIs verify the saved artifact closure against explicit trusted digests;
  they do not authenticate the host/operator who selected those digests.
- Snapshot freshness is `not_checked`. Raw execution attestation and evaluator
  authority are **not reverified** by this scoped reader. Those must be established
  by the existing runner/evaluator authority path before a real result is admitted.
- `synthetic_only` is an intended-use restriction, not a classifier that can prove
  arbitrary files are synthetic. Only generated disposable fixtures are used by
  the provided tests; there is no measured-results CLI or permission bypass.
- Existing raw correctness observations include categorical states, not all the
  eleven old Prompt-wrapper count metrics. This reader preserves the original
  observations and unknowns; it does not invent a 0/1 conversion or claim a final
  comparison report. The actual measured wrapper projection remains a separate
  integration check before #235 launch.

Thus a successful synthetic integration test proves scoped artifact reading and
rejection, not live driver-to-scorer execution or a model/Prompt adoption decision.

## Resume and proposed invocation

In-memory state transitions preserve ordered inventory and exact preparation/run
identity. A case must start before it can become terminal. Terminal results cannot
be replaced. An in-flight case blocks another start and cannot be replayed after
an uncertain interruption; explicit reconciliation evidence is required. Failed,
invalid, interrupted and unavailable are never relabeled completed. This module
is not persistent scheduler/timeout infrastructure; native runner durability and
cancellation must still be checked on the host.

Proposed invocation is `exec --json --ephemeral`, explicit model, `workspace-write`,
approval never, agent command network disabled, medium reasoning and stdin input.
It is a proposal only. Confirm the exact CLI's `--help` and actual input/config
loading. Provider API transport and command-execution network policy are separate.
No local config string proves effective isolation or backend usability. Timeout is
900000ms in the declared plan; effective child termination is a host test gate.

## Verification contract (Formal)

Artifact: `VERIFICATION-289-PREPARATION@1`.
Implementation: `IMPLEMENTATION-289-PREPARATION@1`.
Requirement: Issue #289; no measurement or new permission is implied.

1. Focused Node-only suite: 28-case completeness/order; runtime and parent drift;
   explicit scope; malformed/missing inputs; source-role/case/runtime transplants;
   in-flight/duplicate/resume handling; forbidden model commands and sentinel
   non-execution. The unchanged shared CAS module is a real dependency, not a stub.
2. Real-library Node24 integration: historical parent reconstruction plus synthetic
   normalized/raw manifests through complete existing validators, both roles,
   failure/unavailable records, artifact mutation and extra/missing files, symlink
   boundaries and preservation of the ordinary four-condition rejection. This is
   not a fake callback and not a private-evaluator/model run.
3. Host checks: exact clean HEAD; candidate CLI version/hash/help; real non-secret
   auth class and argv/config; no-model sandbox and timeout/child-control probes;
   independent review of the exact diff and returned logs. Do not infer completion
   of these checks from tests 1 or 2.
4. Existing unchanged-suite evidence may be reused only with matching source scope.
   Do not manually launch Actions or rerun the long full suite automatically.

No-model commands from an isolated clean checkout (save logs outside checkout):

```sh
node --test scripts/test-ask-benchmark-prompt-successor.mjs
node --test scripts/test-ask-benchmark-prompt-successor-integration.mjs
node scripts/ask-benchmark-prompt-successor-check.mjs inspect
node scripts/test-ask-benchmark-prompt-v2.mjs
node scripts/prompt-v2-preregistration-samples.mjs --check
node scripts/validate-repo.mjs
node scripts/adapter-runtime-bundle.mjs --check
git diff --check 596db3d19a1eb76ef2104a6313e6d4ffc1262ce7 HEAD
```

Node24 is mandatory for integration and the CLI. A failure is an actual failed
check, not a skip; retain output and exact SHA. Do not hand-edit the generated
report or frozen samples to make validation pass. Return issues to ChatGPT for
product fixes. Old fixture source-fingerprint checks may run Git reads; model
launch and prior measured-output reads remain forbidden.

## Completion boundary

Draft until Node24 real-library integration and the requested independent review
are available. Host/runtime proof, model smoke, measured scoring/results and
#277/#278 authority publication are later distinct stages. A current source
preparation can be complete while M3 launch remains blocked. Test handoff readiness
must never be reported as M3 execution readiness or #289 full acceptance.
