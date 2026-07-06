# Customization Guide

## Rule of placement

Add a rule to `AGENTS.md` only if it should apply to a one-line typo fix.

Otherwise, put it in a skill or a project-specific file.

Use `docs/ai/improvement-ledger.md` to record evidence before converting repeated findings into durable rules or checks. A prevention proposal should name the finding, repeat pattern, prevention target, proposed rule or check, evidence, scope, and decision.

Default placement:

| Prevention target | Use when |
|---|---|
| `AGENTS.md` | The rule is generic, always-on, and should apply even to one-line typo fixes. |
| `CUSTOM_INSTRUCTIONS.md` | The condensed fallback instructions must mirror an accepted always-on rule. |
| Project overlay | The rule is repository-specific, team-specific, domain-specific, or lower frequency. |
| `SKILL.md` | The rule changes a reusable workflow, gate, review, implementation, or handoff procedure. |
| Review checklist | The finding is review-only and should guide human or AI review without changing implementation behavior. |
| Validation script | The pattern is mechanically detectable inside this repository. |
| Lint/test/check | The prevention belongs in executable tooling, regression tests, or CI. |
| Implementation context | The guidance is evidence-backed local implementation knowledge, not a permanent rule. |
| Review context | The guidance is evidence-backed local review knowledge, accepted risk, or noise-control context. |
| Engineering pattern ledger | The guidance is reusable implementation judgment with source evidence, accepted shape, rejected alternatives, and stale trigger. |
| Verification pattern ledger | The guidance is reusable evidence expectation for recurring change types; it does not prove current task behavior. |
| Review rule ledger | The guidance comes from repeated or high-impact review findings and needs blocker policy, false-positive risk, and suppression rule. |
| Documentation knowledge ledger | The source is docs/ADR/PR/handoff knowledge that needs freshness, conflicts, consumers, and target routing. |
| Architecture decision memory | The decision is reusable boundary or architecture memory below ADR level; promote to ADR when hard to reverse. |
| Engineering capability ledger | The topic is evidence-backed reusable capability growth across layers, not task-level correctness. |

Do not convert hypotheses into durable rules. Use `needs_more_evidence` until the repeated or high-impact pattern and target are clear.

## Recommended layering

```text
Generic kernel        AGENTS.md
Generic workflows     skills/*/SKILL.md
Project rules         project AGENTS.md or equivalent project overlay
Durable context       docs/ai/review-context.md and docs/ai/implementation-context.md
Durable ledgers       docs/ai/*-ledger.md and docs/ai/architecture-decision-memory.md
Stack overlays        skills/angular-implementation-architecture/SKILL.md, etc.
Company workflows     skills/internal-release/SKILL.md, etc.
```

Project overlays hold repository-specific rules. Durable context files hold reusable evidence for review or implementation decisions. Durable ledgers hold evidence-backed reusable memory by layer. They are not task progress and do not replace project overlays, ADRs, current verification, or current review gates.

Stack overlays are optional supplements selected after the generic workflow when matching stack signals exist. The included Angular overlay is the first concrete stack implementation overlay; React, Python, Java, and other overlays should be project-specific or future additions unless implemented.

## How to add project-specific rules

Add a short project appendix:

```md
# Project Appendix

## Stack
- ...

## Commands
- test: ...
- typecheck: ...
- lint: ...

## Conventions
- ...

## Safety gates
- ...
```

Do not copy large internal docs into the kernel. Link to them or create a project-specific skill or overlay.

## When to create a new skill

Create a skill when the workflow:

- is useful more than once,
- has a clear trigger condition,
- contains procedural steps,
- produces a stable output shape,
- would be too heavy as an always-on rule.

## When to delete or merge a skill

Delete or merge a skill when:

- it has no distinct trigger,
- it duplicates another skill’s process rather than specializing it,
- it causes the agent to over-process simple tasks,
- users cannot tell when to invoke it.

## Maintenance audit

Every few weeks of real use, audit:

- Which skills are actually invoked?
- Which rules are repeatedly ignored?
- Which final outputs still contain unsupported claims?
- Which tasks still expand scope unexpectedly?
- Which verification steps are missing or too costly?
- Which handoffs are insufficient for the next agent?
- Which reusable patterns, verification expectations, review findings, documentation knowledge, architecture decisions, or capability claims have evidence and stale triggers?

Improve the system based on observed failures, not theoretical completeness.
