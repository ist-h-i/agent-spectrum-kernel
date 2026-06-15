# Quality Rubric

Target: every category should be 95+ for personal development and internal introduction.

## Scoring scale

| Score | Meaning |
|---:|---|
| 60 | Useful idea, inconsistent execution |
| 70 | Usable with expert supervision |
| 80 | Strong baseline, visible gaps |
| 90 | Reliable in most real workflows |
| 95 | Strong default with explicit failure controls |
| 100 | Near-perfect for the stated scope; no meaningful improvement without project-specific context |

## Categories

| Category | Target | Required properties |
|---|---:|---|
| Kernel design | 95+ | Small, always-on, non-procedural, includes truth/scope/safety/verification/completion contracts |
| Skill separation | 95+ | Heavy workflows are modular; each has use cases, exit criteria, output, failure modes |
| Repository awareness | 95+ | Agents inspect actual repo conventions and commands before non-trivial edits |
| Scope control | 95+ | Allowed/forbidden scope, diff budget, and escalation are explicit |
| Safety / external effects | 95+ | Destructive, irreversible, production, auth, secrets, billing, infra, and global-state actions require risk gate |
| Verification discipline | 95+ | Claims require evidence; verification commands/results/limitations are recorded |
| Design review | 95+ | Grill workflow asks one gating question at a time and answers from repo/docs when possible |
| Spec quality | 95+ | Behavior, non-goals, edge cases, acceptance criteria, and verification are observable |
| Review quality | 95+ | Findings are evidence-backed, actionable, severity-tagged, and merge decision is clear |
| Evidence handling | 95+ | Claims are extracted, classified, downgraded, and linked to next checks |
| Handoff utility | 95+ | Next task includes scope, forbidden scope, expected output, verification, and stop condition |
| Personal/internal usability | 95+ | Japanese usage guide, examples, and simple adoption path exist |

## v2 self-assessment

| Category | Score | Notes |
|---|---:|---|
| Kernel design | 96 | Added safety, routing, truth model, completion contracts without turning kernel into a workflow dump |
| Skill separation | 96 | 15 focused workflows; each has process, output, exit criteria or failure modes |
| Repository awareness | 95 | Dedicated orientation skill plus kernel repository-first rules |
| Scope control | 96 | Kernel scope rules plus dedicated scope-control skill and diff audit |
| Safety / external effects | 97 | Kernel gate plus `risk-gate` skill for high-risk operations |
| Verification discipline | 96 | Kernel verification contract plus test-first and evidence-ledger |
| Design review | 95 | Grill skill includes falsifiable outcome, decision tree, one-question rule |
| Spec quality | 95 | Spec skill includes non-goals, edge cases, acceptance, verification, risks |
| Review quality | 95 | Review skill includes severity, evidence, impact, required fix, residual risk |
| Evidence handling | 97 | Evidence ledger is explicit and reusable across review/handoff/completion |
| Handoff utility | 96 | Handoff has executable next-task format and stop conditions |
| Personal/internal usability | 95 | Japanese usage guide, workflow examples, and project overlay template included |

## Remaining limits

The following cannot be solved generically without a project overlay:

- exact framework conventions,
- test commands,
- deployment rules,
- branch/PR policy,
- code ownership,
- domain-specific terminology,
- security classification rules,
- performance budgets.

Use `docs/project-overlay-template.md` to add those per repository.
