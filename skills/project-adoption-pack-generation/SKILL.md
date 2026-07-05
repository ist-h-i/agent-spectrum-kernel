---
name: project-adoption-pack-generation
description: Generate a first-time project adoption pack containing project overlay, implementation context, review context, local commands, policies, risks, and first workflow recipes.
---

# Project Adoption Pack Generation

## Goal

Generate the minimum project-specific adoption pack needed to use the generic kernel and skills safely in a new repository, project, team, or client context.

This skill separates generic workflow rules from project-specific overlay rules. It does not mutate the target project unless the user explicitly asks for file changes.

## Use when

- Introducing this skill set into a new repository, project, team, or client site.
- The user asks how to apply the skills to an existing project.
- A project lacks a project overlay, implementation context, review context, or local workflow recipes.
- A team wants a lightweight rollout package for internal adoption.
- The assistant must distinguish generic skills from repository-specific rules before making implementation or review claims.

## Do not use when

- The task is a normal one-off implementation, review, refactor, or investigation.
- A project adoption pack already exists and only needs a small targeted update.
- There is no repository, documentation, or project context to inspect.
- The user wants a PR review or implementation result rather than rollout material.
- The output would invent branch, release, security, ownership, or deployment policies without evidence.

## Required inputs

- Repository structure and README.
- Package, build, test, lint, typecheck, and CI commands.
- Branch, PR, review, deployment, or release conventions if present.
- Docs, ADRs, schemas, coding rules, generated-file boundaries, and local conventions.
- Known risks: auth, data, production, migrations, billing, external effects, security classification, performance budgets, and reliability constraints.

## Process

1. Orient on repository evidence.
   - Read README or equivalent entry points.
   - Inspect dependency, build, test, CI, docs, and existing local instructions.
   - Use `repository-orientation` when repo shape is unfamiliar or context is thin.

2. Separate evidence from gaps.
   - Mark each important claim as Verified, Supported, Hypothesis, or Unknown.
   - Do not invent missing policy, ownership, release, security, or performance rules.
   - Record missing human decisions as adoption blockers or follow-up questions.

3. Draft the project overlay.
   - Include local commands, forbidden zones, generated-file policy, risk gate triggers, branch/PR policy if known, deployment approval policy if known, domain terms, invariants, and ownership if known.
   - Keep generic workflow behavior in skills; put only project-specific rules in the overlay.

4. Draft reusable contexts.
   - Implementation context draft: stack, commands, implementation patterns, test patterns, architecture boundaries, generated/manual-edit boundaries, stop conditions, and update triggers.
   - Review context draft: persona, output contract, critical workflows, known risks, accepted risks, noise-control rules, and required review evidence.
   - Improvement ledger initialization guidance: whether the project should start from the generic template and which categories are likely useful.

5. Recommend first workflows.
   - Name the first three project-specific recipes that will reduce risk without over-processing.
   - Choose from adoption setup, implementation context generation, review context generation, first review route, first implementation route, or improvement-ledger initialization.
   - When Claude Code is the target runtime, recommend the local-first adapter path: install core kernel/skills, install the Claude project adapter or optional plugin, enable local hooks for project-local observability, use Pattern B `@claude review` only for PR-level shared review, and generate local weekly/monthly reports from project-local events and ledgers.

6. Stop before mutation unless authorized.
   - If the user asked only for a pack, output drafts and exact next file changes.
   - If file creation is explicitly requested, use the project scope and validation plan before editing.

## Output

```text
Project adoption pack:
- Repository summary:
- Stack and toolchain:
- Local commands:
- Test and verification commands:
- Branch / PR policy:
- Release / deployment approval policy:
- Risk classification:
- Code ownership / review ownership:
- Generated files and forbidden edit zones:
- Domain terminology and invariants:
- Security classification notes:
- Performance / reliability budgets:
- Project overlay draft:
- Implementation context draft:
- Review context draft:
- Improvement ledger initialization guidance:
- Stack overlay applicability:
- First 3 recommended workflow recipes:
- Missing information / required human decisions:
- Evidence reviewed:
- Not created or changed:
```

## Exit criteria

- The pack clearly separates generic skill behavior from project-specific overlay rules.
- Missing policy or context is recorded as Unknown instead of invented.
- Implementation context, review context, and improvement-ledger initialization guidance are included at draft level.
- First recommended workflows are concrete and scoped to the project.
- The skill does not claim project readiness when required context is missing.
- No target project files are mutated unless explicitly requested and verified.

## Failure modes

| Failure | Correction |
|---|---|
| Treating adoption as a normal delivery task | Route through `operating-mode-router` to `adoption_bootstrap`. |
| Inventing local policies | Mark them Unknown and name the required human decision. |
| Replacing context-generation skills | Draft the pack and delegate detailed context files to `implementation-context-generation` and `review-context-generation`. |
| Mutating project files from a discovery request | Output the pack and ask for explicit edit scope before changing files. |
| Dumping generic workflow text into project overlay | Keep reusable workflow procedure in skills and put only local policy in the overlay. |
