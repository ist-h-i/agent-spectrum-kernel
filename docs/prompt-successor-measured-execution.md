# Measured Prompt successor execution bridge

Progresses #291. This document defines the measured bridge's formal verification
contract, not evidence of implementation. Exact delivery and verification evidence
is recorded in the PR. The old #291 source
(`756c72b3fba158fbbc33642128bf5ab87097914b`) and the #234/#235 artifacts remain immutable.

## Delivery status and merge gate

This is a **partial implementation**, not a merge-ready measured bridge. It
adds native usage capture, collection stop-policy calculation and read-only
native collection inspection to the preparation contract and workflow. It does
not yet implement a measured launcher, durable global execution journal/resume,
measured provenance access, or the measured report gate. The existing result/provenance
entrypoints still reject any access mode other than `synthetic_only`; do not
remove that guard to make the draft appear executable.

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

Before this PR is ready to merge, the implementation and verification must cover
all invariants below, including the separately authorized measured entrypoint,
actual runner/evaluator/admission/scoring linkage, ordered no-retry execution,
stop/resume rules, and measured-only report provenance. Deterministic fake-process
proof is required here; real trials and the new result-blind experiment freeze
remain separate work after a suitable source is merged. Keeping this status
explicit does not satisfy any of those implementation requirements.

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
The parser revision is `codex-exec-jsonl-usage-v1`; unsupported output remains
unknown rather than being guessed compatible.

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
This conservative process boundary does not diagnose subscription exhaustion or
implement the still-missing provider classifier, measured launcher or journal.
The native integration fixture exercises a complete usage turn plus exit 7,
reopens both role runs, and checks that exactly one terminal trial is retained
while the other 27 remain unclaimed. No provider or evaluator is called.

`inspectSuccessorCollectionControl` obtains those records by reopening the
actual #197 run/adapter/request/result/commit/workspace evidence, matching the
pre-result role scopes and frozen Prompt delivery, and checking the closure
again after the read. It rejects excluded-case execution and multiple attempts.
It does not trust an editable progress counter or total. This entrypoint still
requires `synthetic_only`; measured access is rejected before reading inputs.
Its result explicitly denies execution, measured-decision and mutation authority.

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

**Remaining boundary:** a terminal prefix is not proof of global execution
order, durable crash recovery, independent operator approval, or host/provider
readiness. `durable_global_sequence_verified` remains false. The missing measured
launcher must enforce this policy before an atomic next claim and implement the
durable cross-role journal/lock; these read-only helpers do not do so. A real
provider usage-limit classification and the private evaluator/admission/report
integration are also still required. `PR303-M1` therefore remains unresolved.

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

These local cleanup checks do not prove global cross-role ordering or authorize
measured execution. The separately reviewed measured launcher/journal and
actual evaluator/admission/report integration remain required by PR303-M1.

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
- Open private evaluation only after collection under the existing protected
  evaluator contract. An envelope or matching evaluator digest is not formal
  evaluator execution. Pending admission cannot become scoring-ready.
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
