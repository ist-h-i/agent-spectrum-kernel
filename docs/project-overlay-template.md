# Project Overlay Template

Use this for repository-specific rules. Do not put these into the global kernel unless they apply to every repository you work on.

Routing order:

```text
generic workflow selection via skill-router
-> project overlay skill selection when the overlay signal applies
```

Do not replace the generic `skill-router` table with framework-specific routes. Add overlay skills only for repository-specific framework, domain, architecture, UI/UX, data, CI, or safety rules.

For stack-specific implementation skills, follow `docs/stack-implementation-overlay-contract.md`. Stack overlays are selected after the generic workflow and only add constraints for `controlled-implementation` plus verification supplements for `test-first-verification`.

Use `docs/ai/review-context.md` for reusable review context such as personas, output contracts, critical workflows, accepted risks, known issues, and review noise-control rules. Keep permanent agent behavior rules in the project overlay; keep task progress in `planning-with-files`.

Recommended filename:

```text
AGENTS.project.md
```

or append as a clearly marked project section below the global `AGENTS.md`.

## Template

````md
# Project Overlay

## Project identity

- Product/domain:
- Primary users:
- Critical workflows:
- Non-goals:

## Stack

- Language/runtime:
- Framework:
- Package manager:
- Build tool:
- Test framework:
- Deployment target:

## Project-specific skills

Use these only after generic workflow selection:

| Overlay signal | Skill | Use after generic workflow |
|---|---|---|
|  |  |  |

## Commands

```text
Install:
Dev:
Build:
Typecheck:
Lint:
Unit test:
Integration test:
E2E test:
Focused test pattern:
```

## Architecture boundaries

- Module boundaries:
- Public APIs:
- Data contracts:
- Generated files:
- Files/directories not to edit manually:

## Coding conventions

- Naming:
- Error handling:
- State management:
- Dependency injection:
- Logging/observability:
- Test style:

## Safety rules

Require explicit approval before:

- production deploy:
- migration:
- destructive script:
- auth/permission change:
- billing/payment/email/notification change:
- secret/credential handling:

## Verification policy

For each change type, run:

| Change type | Required verification |
|---|---|
| UI behavior |  |
| API behavior |  |
| Persistence/migration |  |
| Auth/security |  |
| Performance |  |
| Refactor |  |

## Domain language

Canonical terms:

| Term | Meaning | Source |
|---|---|---|
|  |  |  |

Avoid these terms:

| Term | Reason | Use instead |
|---|---|---|
|  |  |  |

## Review policy

- PR size preference:
- Required tests:
- Required docs:
- Required ADR conditions:
- Review blockers:
- Durable review context path:
- Accepted risk owners:
- Known issues not to re-report:

## Handoff format additions

Add these fields to `handoff-generation` when relevant:

```text
Issue/PR:
Environment:
Feature flag:
Rollback owner:
Monitoring link:
```
````
