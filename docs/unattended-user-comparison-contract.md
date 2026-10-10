# Unattended user comparison reliability contract

Spec `SPEC-USER-UNATTENDED-1` revision 1 references the 2026-10-11 user request,
PR #334 and `SPEC-USER-COMPARE-1` revision 1. This extends the existing exploratory
P/K/F entry; historical fixed experiments and release/admission grants are unchanged.

Acceptance IDs and observable delta:

- A1: preserve verification stdout/stderr as separately bounded artifacts and a
  bounded combined review view. Record capture/view truncation, exact available
  process exit and structured test result independently. Complete source streams
  may support grading even if the combined view is truncated; incomplete capture
  cannot claim complete verification evidence. All saved/read/display limits agree.
- A2: `resume OUTPUT --confirm DIGEST` continues only never-requested conditions.
  Completed or attempted conditions are never rerun. Immutable execution events
  and exclusive owner generations bind the plan and zero-retry policy. Live or
  unidentifiable owners/children block continuation without killing any process.
  A known-ended but receipt-missing attempt remains execution_unknown, not pending.
  Torn/corrupt state is detected and stops continuation. Existing legacy one-shot
  histories without recovery ownership evidence cannot be silently upgraded.
- A3: the confirmed plan includes an overall elapsed deadline from first start
  (including downtime), with admission reservation for a model and its declared
  verification checks. Remaining time clips local process limits and prevents
  later condition starts. Cleanup, synchronous evidence I/O and report persistence
  can finish after the deadline; provider cancellation/billing caps are not proven.
  Optional input+output token budget uses known reported usage as a lower bound
  before model admission. Unknown usage remains unknown and does not alone stop.
- A4: one noninteractive invocation executes independent conditions, verification,
  aggregation and durable machine/human/exit-code receipts. Task-test failure and
  non-launched K capability absence continue independent conditions. Auth/permission,
  launcher failure, scope violation, timeout, interruption, corrupt state or unsafe
  ownership stop. No interactive input/fallback/authentication repair is attempted.
- A5: readonly inspect/report detects incomplete/blocked/corrupt ownership/history;
  reports retain all conditions, usage unknowns and partial evidence. Each invocation
  has a new report identity, without overwriting historical execution receipts.
- A6: exact Japanese scheduler invocation examples use a human-confirmed fixed
  digest and existing start; document codes, paths, duplicate starts, resume,
  operator decisions and a fresh output/run ID for another comparison.

Compatibility delta: `SPEC-USER-COMPARE-1@1` A4's no-resume rule becomes resume of
unrequested conditions only; retries remain zero, sessions sequential and refusal
fallback forbidden. A5/A6 gain execution status and unattended documentation.
Decision evidence: the user's 2026-10-11 explicit bounded follow-up request.

Implementation `IMP-USER-UNATTENDED-1` revision 1 references this Spec and the
existing `IMP-USER-COMPARE-1` revision 1. Allowed change boundary: exploratory
prepare/controller, narrowly reused runner seams if required, execution persistence,
bounded log helpers, fake regressions, guide and fake-only CI. No dependencies,
real evaluation CLI/model, old rejected diagnostics/special Git probes, OS scheduler
registration, external notifications, auth/security/global-setting mutation or
historic experiment rewrite.

Formal Verification Contract `FVC-USER-UNATTENDED-1` revision 1 references A1–A6.
Policy `ask.verification-proof-policy@1.0.0`, selection
`formal_verification_contract`: exact trigger IDs
`bug_reproduction_or_regression`,
`public_api_schema_or_compatibility`,
`state_concurrency_persistence_lifecycle_or_cross_module`,
`performance_or_reliability`, `multi_session_multi_agent_or_handoff`,
`merge_release_or_stable_trace`, and `compact_eligibility_incomplete`.
Evidence: A1 regression, A2 durable recovery, A3 reliability limits, A4/A5 CLI contract,
independent reviewers and the user-requested PR merge. Compact eligibility is not established. Obligations:

- O1 → A1: red/green regression for original 16–20 MiB combined verification logs;
  before/exact/above bounds, both streams large, UTF-8 and redaction expansion;
  test exit and complete/partial evidence remain distinct.
- O2 → A2/A5: temporary real Git repos plus fake runner; graceful interruption,
  dead/live/unknown ownership, incomplete attempt, same/different configuration,
  duplicate/concurrent starts, torn writes/corrupt history; zero duplicate attempts
  and no unrelated process termination.
- O3 → A3: overall deadline admission and active timeout, partial persistence,
  resume never resets deadline; known/unknown usage budget handling and no false
  provider/cost/token guarantee.
- O4 → A4/A5: one noninteractive fake invocation reaches three conditions and
  all reports/codes; error-class continuation/stop matrix, bounded auth/input wait,
  launcher/verification/persistence failures; every slot retained.
- O5 → A6: executable exact CLI/scheduler examples and reopening specified output;
  new IDs, immutable approved digest, human intervention boundaries.
- O6: existing preparation/runner/report/recovery/release regressions, repository
  validators/full fixture tests, generated runtime checks where changed, syntax,
  whitespace, final-target fake Mac/Linux CI, fresh independent review and merged
  remote-main identity/content confirmation.

Evidence E1: new log and unattended suites; E2: existing user comparison and related
model-free regressions; E3: validators/generated freshness/syntax/whitespace;
E4: exact-base/head independent review; E5: final-target CI and merge identity.
Failed required checks, missing ownership or stale/corrupt evidence cannot support
completion. Native CLI/provider/sandbox acceptance and real model comparisons stay
NOT_RUN; this proof supports development reliability only, not operational success,
ASK utility or v1 completion. Executed results belong in bound PR/private receipts.
