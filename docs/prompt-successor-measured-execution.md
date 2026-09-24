# Measured Prompt successor execution bridge

Progresses #291. This document defines the measured bridge's formal verification
contract, not evidence of implementation. Exact delivery and verification evidence
is recorded in the PR. The old #291 source
(`756c72b3fba158fbbc33642128bf5ab87097914b`) and the #234/#235 artifacts remain immutable.

## Delivery status and merge gate

This change now contains the measured bridge implementation required before a
real #291 run: issue-bound host/runtime authority, one-at-a-time measured launch,
a durable global claim/journal, crash reconciliation without retry, measured
result/provenance access, and a measured report gate over the existing #197
evaluator/admission/scorer path. The authority is an in-process opaque handle
created only after the exact native runs and current host/runtime are reopened
and checked against Issue #291's frozen source and authentication contract.
Serializable flags or copied digests cannot create it.

This implementation does **not** execute the real experiment. A new result-blind
freeze against the eventual merged source, target-host preflight and the 28 real
Codex calls remain separate operator actions after merge/review. Portfolio
mutation remains forbidden.

A green `Check measured successor preparation` run proves only its named
synthetic compatibility, source packaging and deterministic fake-process checks. The source archive is an input for
reproduction, not proof that tests passed or authority to execute a trial.
`identity.txt` records the tested checkout commit/tree (normally the PR merge
commit); `pr-context.txt` separately records the event's exact base/head
commit/tree and the preparation-only evidence scope. Whitespace validation uses
those pinned PR commits, not a moving `origin/main` reference.

The packaging regression suite is committed at
`scripts/test-ask-benchmark-prompt-successor-workflow.mjs` and is run by the same
workflow. It executes the actual workflow shell against disposable local Git
repositories: exact bundle restoration, event identities, exclusion of unrelated
refs, missing/mismatched inputs, a non-main base, moving refs and whitespace
rejection. A missing runner temporary directory variable is rejected before any
artifact directory is created. These tests do not invoke a model or evaluator.

```sh
node --test scripts/test-ask-benchmark-prompt-successor-workflow.mjs
```

Before this PR is ready to merge, deterministic fake-process verification must
cover the measured entrypoint, actual runner/evaluator/admission/scoring linkage,
ordered no-retry execution, stop/resume rules, provider-limit stopping and the
measured-only result gate. Real trials and the new result-blind experiment freeze
remain separate work after a suitable source is merged.

## Implemented collection prerequisites

`ask-benchmark-prompt-successor-usage.mjs` captures token usage at the existing
#197 native runner boundary, before raw stdout is reduced to a digest. Successor
attempt result version `1.3.0` binds the receipt to the same stdout byte count and
SHA-256; the existing terminal commit binds the whole result. Ordinary execution
and historical attempt result `1.2.0` stay supported without inventing usage.
The existing normalizer carries verified counts into its typed telemetry.

The contained process boundary retains stdout and stderr as bytes. Hashes and
byte counts therefore identify the original process output, not text silently
repaired by UTF-8 replacement. Malformed UTF-8 cannot become known usage; valid
non-ASCII output remains supported. No raw stream is made durable by this change.

The parser recognizes one complete Codex exec JSONL turn and safe nonnegative
integer input/output counts. Cached input is a subset, not an extra cost;
reasoning output is not added a second time. Missing cached counts remain
unknown. Malformed or duplicate-key JSON, incomplete/multiple turns, overflow,
process timeout, truncation, signals and residual descendants cannot supply a
known total. A nonzero exit does not erase usage from an otherwise complete turn.
Only bounded usage fields and the stream identity are persisted, not raw model
text, thread IDs, credentials or provider error messages. This is runtime
observation, not provider billing or host-isolation attestation.

Protocol reference: [Codex non-interactive JSONL output](https://developers.openai.com/codex/noninteractive).
New captures use parser revision `codex-exec-jsonl-usage-v2`; verified v1
receipts remain readable. v2 also records a bounded `provider_stop`
classification. Only top-level terminal error events are inspected: a typed or
narrowly recognized subscription usage-limit/rate-limit signal becomes
`detected`; unrelated or unsupported terminal errors remain `unknown`.
Agent-message content is never scanned for this classification and raw provider
error text is not persisted.

`evaluateSuccessorCollection` validates the exact ordered 28-case inventory,
single attempts and a terminal prefix. It calculates the fixed 250,000-token
trial warning, 3,000,000 cumulative warning and 5,000,000 escalation boundary.
The just-completed trial is retained, including an overshoot. Unknown usage,
active/interrupted/invalid execution, unavailable runtime/workspace evidence,
missing duration or a duration at/above 900,000 ms stops the next proposed claim.
A later attempt after a stop is a protocol violation, not a replacement trial.
The observed-token lower bound is separate from an unknown cumulative total.

Collection control and native inspection version `1.1.0` require a bounded
`process_outcome` rederived from the verified native result's `exit_code` and
`failure_kind`. A complete usage turn followed by a nonzero process exit must
retain the result and observed tokens but stop with `native_process_failed`.
An unproven exit or unrecognized failure kind stops as `native_process_uncertain`;
a native timeout stops even when the measured duration alone is below 900,000 ms.
A zero-exit deliverable failure remains an ordinary terminal result, not a retry.
Pending/active cases cannot carry terminal process facts. Older projections must
be recomputed from native evidence, not defaulted to a successful process.
The process boundary remains conservative: every nonzero/timeout/uncertain
outcome stops, and v2 additionally records `provider_usage_limit` only when a
bounded top-level Codex terminal error identifies subscription/rate limiting.
An unrecognized provider failure remains stopped as a generic native failure
rather than being guessed into a provider category. The native integration
fixture exercises a complete usage turn plus exit 7,
reopens both role runs, and checks that exactly one terminal trial is retained
while the other 27 remain unclaimed. No provider or evaluator is called.

`inspectSuccessorCollectionControl` obtains those records by reopening the
actual #197 run/adapter/request/result/commit/workspace evidence, matching the
pre-result role scopes and frozen Prompt delivery, and checking the closure
again after the read. It rejects excluded-case execution and multiple attempts.
It does not trust an editable progress counter or total. Synthetic access remains the default. Measured collection access additionally
requires the opaque Issue #291 authority handle; copied serialized evidence is
insufficient. The collection inspector itself never launches a trial and never
authorizes Portfolio mutation.

Native collection inspection version `1.2.0` separately records
`terminal_request_bindings`. A request durably bound to the frozen Prompt remains
`verified`, which proves the request binding, not provider receipt. If the
existing runner recovers an interruption before a durable request exists, its
exact empty `recovered_interruption` projection is `unavailable`. That exception
requires the existing `1.2.0` interrupted/stale-recovery result with no exit,
duration, final output or successor usage. Any partial, substituted or
contradictory projection still fails closed. Completed results cannot use this
exception.

A recovered trial stays in the 28-case inventory as one `interrupted` terminal
case with unknown telemetry and no next claim. Inspection must not fail merely
because the durable request binding is unavailable, nor infer that the trial
was never started. It does not recreate a Prompt binding, rewrite terminal
evidence or retry the trial. Control output remains version `1.1.0`; the added
binding evidence belongs to the native inspection, not execution authorization.
The native tests crash the existing runner immediately before and after request
publication, invoke its real recovery, and verify both binding states and the
unchanged no-retry and synthetic-only boundaries.

## Measured authority, launcher and durable global sequence

`openSuccessorMeasuredAuthority` reopens both native role runs on the current
Node 24 host, checks the exact implementation, the preregistered Prompt authority source,
ChatGPT-subscription authentication class, runtime, command, materialization and
paired source identities, then returns an opaque in-process capability. The
original Issue #291 source revision remains historical experiment provenance; it
is not substituted for the preregistration source or the implementation revision
needed to run this bridge. The capability cannot be reconstructed from JSON.

`executeNextMeasuredSuccessorCase` derives one canonical journal path from the
two native run roots; callers cannot choose a second journal path to bypass the
global lock. It acquires one durable claim before opening Prompt bytes or calling
the existing #197 runner, launches only the exact next preregistered case with
`maxCases=1` and `retryFailed=false`, then reopens terminal evidence.
The fsync-backed journal records the ordered terminal prefix, each claim's
pre/post collection-control digests, and request/result/commit digests. Each
subsequent claim must match that journal and the reverified native prefix before
execution. Cross-role order is therefore prevented concurrently and durably
reverified after every terminal case.

If the process dies or an exception occurs after the global claim, the claim is
left in place. `recoverMeasuredSuccessorSession` reopens the native case; a
pre-spawn failure is released only after proving the case is still pending, and
an active stale native claim is passed to the existing committed recovery path.
Recovered interruptions remain terminal and stopped; recovery never launches or
retries the case.

Measured result/provenance access requires two opaque capabilities: the
pre-result measured authority and a collection-completion handle produced only
after the canonical journal and native evidence agree on all 28 terminal cases,
zero pending cases, no stop reasons, and verified request bindings. Authority
alone cannot open measured results. The existing #197 normalized-result,
evaluator authority, frozen admission and raw engineering score validators are
still the only result path. A measured comparison report can be built only from
two opaque measured provenance handles carrying that completion proof; it
authorizes one bounded Prompt outcome, never Portfolio mutation.

The committed C fake now emits synthetic 100-input/20-output/80-cached usage.
The native execution/normalization and 28-case scoring integration tests check
that these values traverse the existing runner and scorer. Pending admission
must still yield `insufficient_evidence`, never synthetic adoption. No production
measurement or effective-model/provider claim follows from those numbers.

```sh
node --test scripts/test-ask-benchmark-prompt-successor-usage.mjs scripts/test-ask-benchmark-prompt-successor-control.mjs
node --test scripts/test-ask-benchmark-prompt-successor-execution.mjs
node --test scripts/test-ask-benchmark-prompt-successor-scoring.mjs
```

## Terminal cleanup barrier

New native run identities use schema `1.1.0` and bind the canonical temporary
root's path, device and inode through one digest. Recovery rejects a different
`TMPDIR` or directory replacement instead of searching a new root and calling
that absence a successful cleanup. The root digest is also carried in the
existing workspace parent name, so the request/terminal-commit chain binds it;
editing only the run header cannot redirect cleanup. Device/inode values use
exact integer metadata. No absolute private path is persisted.
The `1.0.0` schema remains readable, but an old unbound identity cannot authorize
automatic cleanup or be silently upgraded; it requires separately established
root evidence. Original artifacts remain unchanged.

The shared #197 runner retains the existing claim until the owned temporary
workspace root has been removed. A cleanup failure or an interruption after
terminal publication leaves a recovery barrier; it does not rewrite the completed
result as a different outcome. Explicit committed recovery validates the same
request/result/commit and workspace ownership before cleanup, then releases the
claim. Recovery never starts another trial.

Normal execution inspection also rejects an older terminal attempt whose claim
was already released but whose private root remains. Explicit recovery can close
that legacy gap without changing terminal evidence. A dangling symlink or a
filesystem error is not evidence that the workspace is absent. Foreign or
mismatched ownership remains a hard stop; recovery must not delete it.

These local cleanup checks are consumed by the measured global launcher. A
global claim is not released until the native attempt is terminal/reconciled and
the measured journal snapshot is durable.

## Goal and authority boundary

Provide a separately authorized, exact-source launcher over the existing #197
native execution, normalization, private evaluator, admission and raw-scoring
APIs. Preserve the existing synthetic entrypoints and their refusal of measured
access. A serializable flag, matching hash, synthetic fixture, or pure comparison
calculation must not mint measured execution or decision authority.

Use the existing #276/#277/#278 identities and CAS. An execution journal is not
another Asset/Portfolio/Evolution lifecycle. The report never authorizes mutation.
A new result-blind successor freeze against the eventual merge SHA is required;
this implementation task does not create that freeze or execute model calls.

## Invariants to verify

- Bind exact source commit/tree, experiment, selected Prompt bytes, runtime,
  executable, model, reasoning, config, authentication class, policy and roots.
- Represent the 28 preregistered cases in order, with no retry, duplicate,
  replacement, historical transplant or unexecuted four-condition completion.
- Use the existing native runner and its actual request/result/workspace proofs.
  Uncertain execution or residual cleanup stops the next claim.
- Preserve terminal failures and interruptions. Resume rederives evidence and
  stop state rather than trusting a caller-edited progress file.
- Enforce the 900,000 ms timeout; warn at 250,000 tokens/trial and 3,000,000
  cumulative; retain a completed trial at or above 5,000,000 and stop before the
  next trial. Unknown telemetry is not zero.
- Open private evaluation only after the durable global journal and native
  collection agree on all 28 terminal cases under the existing protected
  evaluator contract. An authority handle without the opaque completion proof,
  an envelope or a matching evaluator digest is insufficient. Pending admission
  cannot become scoring-ready.
- Use frozen thresholds and the existing comparison arithmetic. Only verified
  measured provenance may enter the measured report gate; all other calculations
  remain diagnostics. Missing evidence yields `insufficient_evidence`.

## Verification contract

Formal verification is required: this change crosses execution, persistence,
security and evidence-authority boundaries. Use deterministic local/native fake
processes, never a model service or an actual private evaluator package.

Required evidence includes focused positive and negative tests, unchanged
synthetic-successor compatibility, native #197 execution/normalization/evaluator
and admission regressions, schema/repository validation and `git diff --check`.
Run under Node 24. Record exact commands, exit codes and source tree separately
from unexecuted host/provider/evaluator checks. Tests must not weaken existing
assertions or relabel synthetic validation as measured product evidence.

## Non-goals

No real trials, model calls, measured historical result access, Prompt tuning,
threshold/evaluator changes, second scorer/CAS/lifecycle, automatic activation,
#198 execution, C4 work, merge or issue closure.
