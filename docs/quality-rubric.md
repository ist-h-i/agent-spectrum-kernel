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
| Evidence handling | 95+ | Claims are extracted, classified, downgraded, and linked to next checks |
| Handoff utility | 95+ | Next task includes scope, forbidden scope, expected output, verification, and stop condition |
| Personal/internal usability | 95+ | Japanese quickstart, prompt recipes, glossary, usage guide, examples, and simple adoption path exist |

## Current self-assessment

Baseline: current 27-skill system in `manifest.json`.

| Category | Score | Notes |
|---|---:|---|
| Kernel design | 96 | Added safety, routing, truth model, completion contracts without turning kernel into a workflow dump |
| Skill separation | 96 | 27 focused skills; each skill keeps process, output, exit criteria, or failure modes close to one workflow responsibility |
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
- deployment, release, and production-change approval rules,
- branch/PR policy,
- code ownership,
- domain-specific terminology and business invariants,
- security classification rules,
- performance budgets and acceptable tradeoffs.

Use `docs/project-overlay-template.md`, `docs/ai/implementation-context.md`, and `docs/stack-implementation-overlay-contract.md` to add or refresh those per repository.
