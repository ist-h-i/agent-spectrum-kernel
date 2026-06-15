# Customization Guide

## Rule of placement

Add a rule to `AGENTS.md` only if it should apply to a one-line typo fix.

Otherwise, put it in a skill or a project-specific file.

## Recommended layering

```text
Generic kernel        AGENTS.md
Generic workflows     skills/*/SKILL.md
Project rules         project AGENTS.md or docs/ai/*.md
Framework rules       skills/angular-enterprise/SKILL.md, etc.
Company workflows     skills/internal-release/SKILL.md, etc.
```

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

Do not copy large internal docs into the kernel. Link to them or create a project-specific skill.

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

Improve the system based on observed failures, not theoretical completeness.
