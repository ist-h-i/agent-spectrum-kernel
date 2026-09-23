# Measured Prompt successor execution bridge

Progresses #291. This document defines the measured bridge's formal verification
contract, not evidence of implementation. Exact delivery and verification evidence
is recorded in the PR. The old #291 source
(`756c72b3fba158fbbc33642128bf5ab87097914b`) and the #234/#235 artifacts remain immutable.

## Delivery status and merge gate

This change is **preparation only**: the contract and a compatibility workflow.
It does not yet implement a measured launcher, execution journal/resume, measured
provenance access, or the measured report gate. The existing result/provenance
entrypoints still reject any access mode other than `synthetic_only`; do not
remove that guard to make the draft appear executable.

A green `Check measured successor preparation` run proves only its named
existing synthetic compatibility checks. The source archive is an input for
reproduction, not proof that tests passed or authority to execute a trial.
`identity.txt` records the tested checkout commit/tree (normally the PR merge
commit); `pr-context.txt` separately records the event's exact base/head
commit/tree and the preparation-only evidence scope. Whitespace validation uses
those pinned PR commits, not a moving `origin/main` reference.

Before this PR is ready to merge, the implementation and verification must cover
all invariants below, including the separately authorized measured entrypoint,
actual runner/evaluator/admission/scoring linkage, ordered no-retry execution,
stop/resume rules, and measured-only report provenance. Deterministic fake-process
proof is required here; real trials and the new result-blind experiment freeze
remain separate work after a suitable source is merged. Keeping this status
explicit does not satisfy any of those implementation requirements.

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
