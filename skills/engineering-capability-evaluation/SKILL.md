---
name: engineering-capability-evaluation
description: Evaluate evidence-backed reusable engineering capability across requirements, architecture, implementation, verification, review, documentation, and readiness.
---

# Engineering Capability Evaluation

## Goal

Measure how much reusable engineering intelligence the skill set has actually accumulated across layers, based on evidence rather than aspirational maturity.

This skill evaluates capability growth. It does not replace task-level verification, review gates, release readiness, or adoption metrics.

## Use when

- The user asks how full-layer engineering intelligence is growing.
- A project wants to score reusable capability across requirements, domain rules, architecture, implementation patterns, verification, review, documentation knowledge, release readiness, handoff, or rule/check promotion.
- Outputs from ledgers, review gates, effectiveness evaluation, adoption metrics, and stakeholder readiness reports need to be synthesized.
- `docs/ai/engineering-capability-ledger.md` needs an entry added, refreshed, or downgraded.

## Do not use when

- The user asks for a normal implementation, review, or bug fix.
- There is no evidence beyond self-claims or number of entries.
- The result would be used for HR/personnel evaluation.
- A single task retrospective is sufficient; use `skill-effectiveness-evaluation`.
- A period adoption summary is sufficient; use `skill-adoption-metrics`.

## Process

1. Select capability areas.
   - Requirement definition, domain rule application, work package compilation, architecture decision support, implementation pattern reuse, verification/test design, review judgment, documentation knowledge management, release/readiness judgment, next-change candidate discovery, handoff/restart quality, rule/check promotion quality.

2. Gather evidence.
   - Ledger entries and their evidence statuses.
   - Review gate outcomes and final decisions.
   - Verification results and missing evidence.
   - Adoption metrics, skill effectiveness evaluations, stakeholder readiness reports, and explicit human confirmations.

3. Score level using evidence-backed criteria.
   - `0 Unknown`: no usable evidence.
   - `1 One-off assisted`: one task outcome with limited reuse evidence.
   - `2 Repeatable with human supervision`: repeated use with human decisions still central.
   - `3 Evidence-backed reusable pattern`: durable assets repeatedly guide work with current evidence.
   - `4 Mostly autonomous verification/review support`: reusable assets guide task work and gates with limited human correction, but humans still own final decisions.
   - `5 Mature reusable project intelligence`: broad, current, cross-layer evidence with low contradiction and strong verification.

4. Separate dimensions.
   - Breadth, reliability, autonomy, evidence quality, human dependency, stale risk, and failure history.
   - Do not score upward from entry count alone.

5. Decide ledger update.
   - Add, refresh, downgrade, mark stale, or report insufficient evidence.
   - Record next improvement candidate.

## Output

```text
Engineering capability evaluation:
- Decision: add | refresh | downgrade | mark stale | insufficient evidence
- Capability ID:
- Capability area:
- Current level:
- Evidence source:
- Evidence status:
- Observed strengths:
- Observed failures:
- Human dependency:
- Reusable assets involved:
- Reliability signals:
- Staleness trigger:
- Next improvement candidate:
- Owner:

Score rationale:
- Breadth:
- Reliability:
- Autonomy:
- Evidence quality:
- Human dependency:
- Residual risk:
```

## Exit criteria

- Every level claim has evidence and missing evidence.
- Weak or stale areas remain visible.
- The evaluation does not replace current task verification or review.
- The output distinguishes capability, adoption, and task effectiveness.
- Human dependency is explicit.

## Failure modes

| Failure | Correction |
|---|---|
| Scoring from aspiration | Require evidence source and status. |
| Treating number of entries as maturity | Evaluate reuse, reliability, and outcomes instead. |
| Hiding weak areas | Keep Unknown, stale, and failed signals visible. |
| Claiming human-equivalent autonomy | State the bounded capability and human decision points. |
