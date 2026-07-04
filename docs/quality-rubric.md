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
| Implementation control | 95+ | Implementation Contract fixes goal, non-goals, allowed/forbidden scope, context, verification, and stop conditions before edits |
| Implementation context reuse | 95+ | Durable implementation context records stack, commands, patterns, boundaries, overlay hooks, and update triggers without storing task progress |
| Verification discipline | 95+ | Verification Contract is defined before or alongside implementation; claims require evidence; insufficient evidence is reported explicitly |
| Stack overlay extensibility | 95+ | Generic workflows stay stack-agnostic while stack overlays can add framework-specific constraints and verification supplements |
| Safety / external effects | 95+ | Destructive, irreversible, production, auth, secrets, billing, infra, and global-state actions require risk gate |
| Design review | 95+ | Grill workflow asks one gating question at a time and answers from repo/docs when possible |
| Spec quality | 95+ | Behavior, non-goals, edge cases, acceptance criteria, and verification are observable |
| Review quality | 95+ | Review router determines layer applicability; required gates cover `review-architecture-impact`, `review-output-quality`, `review-adversarial-risk`, context generation, and final layer summary |
| Code health review | 95+ | `review-code-health` finds evidence-backed debt, smells, refactor candidates, maintainability/testability/performance/dependency risk, and security weakness signals without replacing specialized gates |
| Technical debt lifecycle | 95+ | Findings can move from review to separate PR, backlog, accepted risk, stale review, rule feedback, executable check, or safe refactor without hiding blockers |
| Improvement ledger quality | 95+ | Ledger rows require source, evidence, impact, severity, urgency, decision, owner/status, refresh date, and close condition |
| Prevention-rule / check feedback | 95+ | Repeated or high-leverage findings are routed to the narrowest durable rule, context, validation script, lint, test, or CI check only when evidence supports conversion |
| Refactor safety | 95+ | `refactor-implementation` requires an approved objective, behavior-preservation contract, allowed/forbidden scope, boundary decision, and regression proof |
| Review-to-improvement feedback loop | 95+ | Review output can hand non-blocking items into the loop `review-code-health -> review-final-merge-gate -> improvement-ledger -> prevention-rule feedback -> refactor-implementation` |
| Evidence handling | 95+ | Claims are extracted, classified, downgraded, and linked to next checks |
| Handoff utility | 95+ | Next task includes scope, forbidden scope, expected output, verification, and stop condition |
| Personal/internal usability | 95+ | Japanese quickstart, prompt recipes, glossary, usage guide, examples, and simple adoption path exist |

## Current self-assessment

Baseline: current 30-skill system in `manifest.json`.

| Category | Score | Notes |
|---|---:|---|
| Kernel design | 96 | Added safety, routing, truth model, completion contracts without turning kernel into a workflow dump |
| Skill separation | 96 | 30 focused skills; each skill keeps process, output, exit criteria, or failure modes close to one workflow responsibility |
| Repository awareness | 95 | Dedicated orientation skill plus kernel repository-first rules |
| Scope control | 96 | Kernel scope rules plus dedicated scope-control skill and diff audit |
| Implementation control | 96 | `controlled-implementation` requires an Implementation Contract before edits, including goal, non-goals, boundaries, context, verification, and stop conditions |
| Implementation context reuse | 95 | `implementation-context-generation` and `docs/ai/implementation-context.md` provide reusable implementation facts without becoming task progress |
| Verification discipline | 96 | Kernel verification rules plus `test-first-verification`; Verification Contract is defined before or alongside implementation and insufficient evidence is an explicit outcome |
| Stack overlay extensibility | 95 | `docs/stack-implementation-overlay-contract.md` keeps generic routing stack-agnostic while `angular-implementation-architecture` demonstrates a concrete stack overlay |
| Safety / external effects | 97 | Kernel gate plus `risk-gate` skill for high-risk operations |
| Design review | 95 | Grill skill includes falsifiable outcome, decision tree, one-question rule |
| Spec quality | 95 | Spec skill includes non-goals, edge cases, acceptance, verification, risks |
| Review quality | 96 | `review-router` records layer applicability; review gates include `review-architecture-impact`, `review-output-quality`, `review-adversarial-risk`, `review-context-generation`, and `review-final-merge-gate` layer summary |
| Code health review | 95 | `review-code-health` now provides a dedicated debt/smell/refactor/maintainability review gate with scope guidance and rule/check feedback |
| Technical debt lifecycle | 95 | `improvement-ledger` separates blockers from non-blocking debt and gives each tracked item owner/status, refresh, close, and prevention routing fields |
| Improvement ledger quality | 95 | The ledger template defines required fields, lifecycle states, evidence key, conversion tables, stale review rules, and executable validation coverage |
| Prevention-rule / check feedback | 95 | Repeated findings can be routed to `AGENTS.md`, `CUSTOM_INSTRUCTIONS.md`, project overlay, `SKILL.md`, review checklist, validation script, lint/test/check, implementation context, or review context without dumping every observation into always-on rules |
| Refactor safety | 95 | `refactor-implementation` keeps approved structural cleanup separate from behavior change and requires behavior-preservation plus regression evidence |
| Review-to-improvement feedback loop | 95 | The loop `review-code-health -> review-final-merge-gate -> improvement-ledger -> prevention-rule feedback -> refactor-implementation` is represented in routing, prompt recipes, examples, and validation expectations |
| Evidence handling | 97 | Evidence ledger is explicit and reusable across review/handoff/completion |
| Handoff utility | 96 | Handoff has executable next-task format and stop conditions |
| Personal/internal usability | 96 | `docs/quickstart-ja.md`, `docs/prompt-recipes-ja.md`, `docs/glossary-ja.md`, Japanese usage guide, workflow examples, and project overlay template are included |

## Remaining limits

The current system splits local knowledge across three extension points:

- Project overlays handle repository policy, ownership, deployment rules, domain terminology, and local safety classifications.
- Implementation context handles reusable observed facts such as commands, workspace shape, implementation patterns, generated-file boundaries, and stop conditions.
- Stack overlays handle framework-specific implementation constraints and verification supplements while keeping generic workflows stack-agnostic.

The following still require project-specific human judgment:

- final choice of exact framework conventions when no stack overlay exists,
- confirmation that recorded commands and implementation context remain current,
- confirmation that improvement-ledger entries reflect real project ownership and current evidence,
- judgment on whether a repeated finding should become a durable rule, executable check, accepted risk, or separate refactor,
- deployment, release, and production-change approval rules,
- branch/PR policy,
- code ownership,
- domain-specific terminology and business invariants,
- security classification rules and dedicated security audit processes,
- performance budgets and acceptable tradeoffs.

The debt-management loop improves follow-through, but it does not remove the need for project owners to decide priority, ownership, security classification, and whether a refactor is worth a separate change.

Use `docs/project-overlay-template.md`, `docs/ai/implementation-context.md`, `docs/ai/improvement-ledger.md`, and `docs/stack-implementation-overlay-contract.md` to add or refresh those per repository.
