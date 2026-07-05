# Stakeholder Readiness Report Templates

These templates translate internal workflow evidence into stakeholder-specific readiness views. They do not prove client value by themselves.

Use three separate readiness concepts:

| Concept | Meaning | Evidence needed |
|---|---|---|
| Internal workflow quality | Whether agents followed routing, scope, verification, review, and evidence rules. | Skill routes, gate coverage, validation reports, review output, improvement ledger. |
| Release readiness | Whether a specific release package has validation, rollback, approval, migration, monitoring, and residual-risk evidence. | `release-readiness-gate`, CI, manual checks, owner approvals, rollback plan. |
| Client-value readiness | Whether delivery evidence supports client-visible value, risk reduction, reduced rework, or improved confidence. | Project outcome data, defect/rework trends, release outcomes, stakeholder acceptance, client-facing evidence. |

## Senior Engineer Report

```text
Senior engineer readiness:
- Scope:
- Period:
- Evidence reviewed:

Operational friction:
- Missing commands or context:
- Workflow overhead:
- Repeated manual steps:
- Tool/adaptor gaps:

Review usefulness:
- Required gates:
- Executed gates:
- Skipped gates and reasons:
- Findings that changed implementation:
- False positives or low-value checks:

Verification:
- Commands run:
- Manual checks:
- Insufficient evidence:

Residual risk:
- ...
```

## Development Manager Report

```text
Development manager readiness:
- Scope:
- Period:
- Evidence reviewed:

Gate coverage:
- Required gates:
- Executed gates:
- Required gate coverage:
- Missing evidence layers:

Quality signals:
- Validation passed / failed:
- Required fixes found before merge:
- Rework count:
- Debt items recorded:
- Debt items resolved or converted to checks:

Release confidence:
- Release-readiness evidence:
- Known blockers:
- Residual risks:
```

## Business Unit Leader Report

```text
Business unit client-value readiness:
- Scope:
- Period:
- Evidence reviewed:

Client-visible value:
- Delivery outcome:
- Evidence of reduced risk:
- Evidence of reduced rework:
- Evidence of release confidence:
- Evidence not yet available:

Decision:
- ready for client-facing use | ready with caveats | not ready | insufficient evidence

Residual risk:
- ...
```

## AI Promotion Leader Report

```text
AI promotion readiness:
- Scope:
- Period:
- Evidence reviewed:

Governance:
- Risk-gate coverage:
- Privacy boundary:
- Metrics boundary:
- Personnel-evaluation boundary:

Portability:
- Adapter conformance state:
- Tool capability status:
- Unsupported or unknown capabilities:
- Claim downgrades required:

Rollout risks:
- Required owner decisions:
- Training or prompt recipe gaps:
- Validation or automation gaps:
- Residual risks:
```

## Evidence Rules

- Mark each important claim as Verified, Supported, Hypothesis, Unknown, or Falsified.
- Do not convert internal quality scores into client-value claims without outcome evidence.
- Do not use adoption metrics for HR, compensation, promotion, or personnel evaluation.
- Do not store raw prompts, secrets, customer data, personal data, full file contents, or full command output in readiness reports.
