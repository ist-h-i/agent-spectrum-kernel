# CH08 UI-first semantic assessment v2

Version 2.0.0; input version ui-functional-v2. Same CH08 task identity, not a ninth challenge.

## Why 40 functional / 60 UX

This is a design choice for evaluating UI creation, not an empirically optimal weighting.
The 40 existing functional checks remain (each old functional weight scaled by 40/70).
The guide's complete 40 bullets are retained as source_text, each paired with an observable
acceptance. UX domains: human-centred 8, information/cognitive load 10, language 6,
affordance 6, consistency 7, accessibility 8, reversibility/safety 8, resilience 7.
Information, accessibility and safe decisions matter more than cosmetic preference.
Do not award points for a framework, visual imitation, animation quantity or raw JSON use.
JSON transfer is required; readable decision support is independently assessed.

## Collection and calculation

Copy **only these three files** (rubric.json, score.mjs, README.md) to the external
assessor root used by the existing challenge handoff. Never give this private runtime
directory to submission code. Public workspace/brief/rubric.json has identical criteria.
No runner changes are needed. Existing evaluator/ files remain immutable v1 replay assets.

Assessment kind ch08_assessor_decisions_v2; meta requires candidate_id,
assessment_mode (prospective or retrospective), rubric_version (2.0.0).
Every requirement/check/blocker occurs exactly once.

- pass: observed acceptance achieved; evidence [{artifact, observation}] required.
- partial: UX only, 0.5; both observed benefit and concrete shortcoming, plus nonempty
  limitation. Uninspected behavior cannot be represented as partial.
- fail: observed counterexample, 0.
- unknown: missing and next_check, no assigned quality score for that weight.
- na: reason and evidence; allowed only for task-level rubric.task_na IDs, identically
  for every candidate. The current task has **no excluded IDs**. An unimplemented or
  untested feature is not NA. Non-gesture controls still need equivalent keyboard access;
  no animation is acceptable when transitions preserve orientation. These are not NA.

Equal check weights within each domain. Task-level NA weights redistribute within the
same domain only; all-NA domain remains unavailable with its full weight missing.
Do not compare different task_na configurations. Canonical rubric SHA256 binds this.
Unknowns retain weight; only when no weight is missing is quality_score numeric.
known_points is a confirmed subtotal, NOT a complete quality rating. Do not report
its complement as a failure rate. Calculate without intermediate rounding.

The calculator checks shape/arithmetic, not truth or authenticity of observations.
Screenshots support visual claims; interactive claims need real operation evidence.
For process-worded guide bullets assess the observable outcome, not hidden author reasoning.
Each criterion's acceptance states its operational scope; no demand for exhaustive
all-user testing is implied. Enumerate tested and untested states in evidence.
New accessibility measurement thresholds are prospective v2 requirements; old answers
without measurements receive unknown, not a fabricated pass/fail.

## Safety and resources

Six separately reported blockers: successful-save data loss, unapproved/current stale
judgment, external service dependency, unsafe export, silent unrecoverable unsaved-input
loss, and consequential misleading state. Unknown is not clear. Ambiguous wording alone
does not automatically establish the misleading-state blocker.
blocker_gate_passed=false for any observed blocker; null when evidence/score is incomplete.
true means only the configured blockers are clear in observed cases and scoring complete;
it is NOT human approval, a quality threshold or a production guarantee.

Keep functional, UX/domain scores, blockers, elapsed time, input/output/cached tokens and
assessment overhead separate. Cached input is a subset. No resource-to-quality conversion.
A faster or cheaper broken result is not automatically preferable.

## Historical reassessment

Existing initial answers generated under v1 may be diagnosed with v2, labelled
retrospective. Preserve their original scores, receipts and files. They did not receive
v2 criteria, so do not compare them as prospectively v2-instructed trials or infer a general
causal skill effect from one answer each. Missing evidence remains unknown; no solver rerun
is needed for rescoring. UI report percentages previously based on 10 questions are not
this 40-item version.

## Verification contract

CH08-UX-V2-VERIFY, formal_verification_contract under ask.verification-proof-policy@1.0.0
(public scoring contract, stable merge trace). Baseline main 4772e5c6.
Obligations: exact 40 source bullets / 80 total checks; version isolation; observable
anchors; unknown/partial/NA separation; same applicability; blocker non-offset; standard
handoff and npm inclusion. Evidence: score-v2.test.mjs, public-package.test.mjs,
manifest.mjs, shared challenge/worker regressions, independent review and exact-head CI.
Synthetic tests verify calculator/transport only, not UI quality. Failed or missing tests
are not completion. No dependency/security setting changes or live model calls.
