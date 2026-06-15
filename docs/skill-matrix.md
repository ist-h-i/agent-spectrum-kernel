# Skill Matrix

| Situation | Primary skill | Secondary skill | Expected output |
|---|---|---|---|
| Unsure which workflow applies | `skill-router` | — | Selected workflow and skipped workflows |
| First task in unfamiliar repo | `repository-orientation` | `scope-control` | Repo map, commands, conventions, risks |
| User says “grill me” or plan is under-specified | `grill-design` | `grill-with-docs` | Design decision summary and acceptance criteria |
| Plan must fit docs/domain/ADRs | `grill-with-docs` | `adr-review` | Term/doc conflict review and documentation decision |
| New feature or user-visible behavior | `spec-driven-development` | `test-first-verification` | Spec, plan, reviewable tasks, verification path |
| Clear non-trivial implementation | `controlled-implementation` | `test-first-verification` | Minimal scoped implementation summary |
| Multi-step task likely to span sessions | `planning-with-files` | `handoff-generation` | Durable planning state and next task |
| Risk of scope creep/refactor sprawl | `scope-control` | `code-review-quality` | Scope contract and scope audit |
| Bug, regression, or unknown root cause | `doubt-driven-development` | `test-first-verification` | Hypothesis, falsification checks, evidence |
| Destructive/external/production/security-sensitive action | `risk-gate` | `handoff-generation` | Risk classification, approval requirement, safe alternative |
| Architecture or hard-to-reverse decision | `adr-review` | `grill-with-docs` | ADR action and decision record |
| PR/diff/commit review | `code-review-quality` | `evidence-ledger` | Merge decision and actionable findings |
| Performance/security/reliability/readiness claim | `evidence-ledger` | `doubt-driven-development` | Claim/evidence/status table |
| End of work or passing to another agent | `handoff-generation` | `evidence-ledger` | Executable next task and residual risk |

## Routing rule

Use the smallest workflow that reduces real risk. Do not invoke a skill because its name matches a keyword. Invoke it because the task has the corresponding uncertainty, evidence gap, or failure mode.

## Common chains

```text
New feature:
spec-driven-development -> controlled-implementation -> test-first-verification

Bug:
doubt-driven-development -> controlled-implementation -> test-first-verification

Design:
grill-design -> grill-with-docs -> adr-review when needed

Review:
code-review-quality -> evidence-ledger

Risky operation:
risk-gate -> handoff-generation
```
