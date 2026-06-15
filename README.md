# AI Coding Kernel + Skills v1

This set is a portable base for AI coding tools that support project instructions and reusable skills.

Design intent:

- Keep the always-on kernel small.
- Put procedural workflows into skills.
- Make every non-trivial output verifiable.
- Prevent scope creep, rationalization, and unsupported claims.
- Make handoff to another agent or human reviewer cheap.

## File layout

```text
AGENTS.md
skills/
  skill-router/SKILL.md
  repository-orientation/SKILL.md
  grill-design/SKILL.md
  grill-with-docs/SKILL.md
  spec-driven-development/SKILL.md
  planning-with-files/SKILL.md
  scope-control/SKILL.md
  test-first-verification/SKILL.md
  code-review-quality/SKILL.md
  adr-review/SKILL.md
  doubt-driven-development/SKILL.md
  evidence-ledger/SKILL.md
  handoff-generation/SKILL.md
docs/
  skill-matrix.md
```

## How to use

Use `AGENTS.md` as the project-level custom instruction file.

For tools that support skills, install each directory under `skills/` as an agent skill. For tools that do not support skills, paste the relevant `SKILL.md` into the prompt only when that workflow is needed.

Recommended baseline:

1. Put `AGENTS.md` at the repository root.
2. Install the skill directories in your AI coding tool.
3. For simple tasks, let the kernel run alone.
4. For non-trivial tasks, invoke `skill-router` first.
5. For review/handoff workflows, invoke the relevant skill explicitly.

## Boundary

This is intentionally generic. It does not encode framework-specific rules for Angular, React, Python, finance research, infra, or internal company conventions. Add those as project-specific skills rather than bloating the kernel.

## Source influences

This set is adapted from the following patterns, not copied verbatim:

- Andrej Karpathy-style AI coding guardrails: repository-first, minimal changes, skepticism toward bloated abstractions, verification discipline.
- Matt Pocock-style grill workflows: interrogate a plan before implementation; answer from the codebase when possible; ask one question at a time.
- Grill-with-docs pattern: challenge plans against existing domain language, CONTEXT files, and ADRs.
- Addy Osmani-style agent skills: process over prose, anti-rationalization, verification as exit criterion, progressive disclosure, scope discipline.
- Spec-driven development: move vague prompts into specs, plans, and tasks before implementation.
- Agentic handoff patterns: preserve state, evidence, risks, and next actions for the next agent or reviewer.
