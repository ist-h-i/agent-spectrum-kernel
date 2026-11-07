# Practical grader observations

Spec `practical-quality-observations@1` extends the existing synchronous pinned
grader port. It does not add a task runner, private benchmark dependency, host
claim type, automatic provider or human approval.

A grader's normal exit is not necessarily a full-quality pass: a source-only
assessment may have partial points or unresolved runtime acceptance. The optional
`provider_observation_v1.quality` is a closed
`practical_quality_observation_v1` with `scope`, `outcome`, `evidence_refs` and
nullable `fixed_reference`. Scope is `caller_criteria`, `source_reference` or
`runtime_observation`; outcome is pass/fail/unknown. Evidence references must be
nonempty for pass/fail and match already digest-verified provider artifacts.
`fixed_reference` reuses `fixed_point_reference_summary_v1`, not a new score.
Source-only summaries cannot claim runtime acceptance, and an observed critical
violation or failed mandatory compliance cannot coexist with a pass outcome.

Formal Verification Contract:

- Q01: Absent quality observations retain legacy grader exit semantics.
- Q02: Valid typed quality overrides exit-based interpretation only for a closed,
  normally completed grade. Positive source-only quality remains overall Unknown
  for runtime acceptance. Its usable partial/scoped evidence does not by itself
  trigger a missing-quality task retry. The full statement and scope remain visible.
- Q03: Invalid optional quality becomes Unknown with an incident and AI recovery
  context. Valid execution, provider usage and original artifacts survive. An
  optional scoring problem must not invent a pass or erase useful task evidence.
  A well-formed empty Unknown statement is retained but is not available quality
  evidence. Fixed summaries require a bound evidence artifact even when partial.
- Q04: All-attempt reports retain each quality observation and grading usage;
  costs remain separate from task/assessment metrics. Missing components stay
  Unknown, cached input stays a subset, and no complete hierarchy/price is inferred.
  Assessment duration/reported root calls and provider-supplied usage are likewise
  summarized without inferring missing values or a billed monetary total.
- Q05: A selected fixed summary survives bounded next-cycle feedback without
  answers, grading body or logs. Excluded attempts remain in the original ledger.
- Q06: Existing trial/case retries and limits are reused. A grading-only incident
  does not itself require another task run; the AI can reference/exclude retained
  evidence. This feature does not add grade-only retry or replay an uncertain grade.

Implementation Contract:

- Artifact: `practical-quality-observations-implementation@1`.
- Upstream: requested executable quality-preserving Eval plan; Q01..Q06;
  ADR-0016/0018/0019; existing practical grader/provider receipts and retry ledger.
- Boundary: typed optional observations, worker interpretation, report/feedback,
  recovery diagnostics and affected source pins. No owner/provider permission.
- Verification: worker-level synthetic grading, invalid artifacts/summary and
  incomplete grade cases; all-attempt cost and next-feedback regressions; existing
  practical/component/native compatibility and repository validation.
- Evidence: fixed source and actual command results in delivery handoff.
- Proof: Formal Q01..Q06; no efficacy, authentication, anonymity or runtime truth
  inferred from these model-free software tests.
- Handoff: caller-owned grader can automate its own checks/rubric/calculator.
  Host preparation and model identities/budgets are fixed before human case
  approval. Actual Eval/application remains behind the existing human judgments.

ADR review: no separate ADR is required. The extension is additive and reversible,
uses the existing caller-reported provider/artifact boundary and fixed-summary
type, and grants no new score, source authenticity or execution authority.
Revisit before certifying source evidence as runtime acceptance, accepting
unbound quality, pooling different scales or inferring full cost from partial
usage. Arbitrary grading content stays in retained artifacts, not next-cycle input.
