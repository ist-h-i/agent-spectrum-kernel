# Measured Prompt successor execution bridge

Progresses #291. This is the formal verification contract for the measured bridge.
Implementation and verification status are recorded in the PR, not inferred from
this document. The old #291 source (`756c72b3fba158fbbc33642128bf5ab87097914b`)
and the #234/#235 artifacts remain immutable.

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
