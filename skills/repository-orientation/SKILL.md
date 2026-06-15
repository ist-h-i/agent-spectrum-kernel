---
name: repository-orientation
description: Build a concise map of an unfamiliar repository before making changes. Use when structure, commands, conventions, tests, or module boundaries are unknown.
---

# Repository Orientation

## Goal

Understand enough of the repository to avoid random edits, invented conventions, and false assumptions.

## Use when

- This is the first task in a repository.
- The change spans unfamiliar modules.
- Build/test commands are unknown.
- The repo has monorepo structure, generated code, multiple packages, or unclear boundaries.
- Nearby conventions are likely to matter.

## Do not use when

- The change is a tiny localized edit and the relevant files/tests are already known.

## Process

1. Inspect entry points.
   - README or equivalent.
   - Package/build/dependency files.
   - Workspace/monorepo configuration.
   - Test/lint/typecheck/build scripts.
   - CI config if available.

2. Inspect design context.
   - docs/
   - ADRs
   - CONTRIBUTING or coding standards
   - context maps, schema docs, API docs
   - ownership/module-boundary hints

3. Identify commands.
   - install/bootstrap
   - build
   - test all
   - focused test
   - typecheck
   - lint
   - run/dev server

4. Map target area.
   - target files/modules
   - nearby tests
   - public interfaces
   - existing patterns to reuse
   - generated/vendored files to avoid

5. Record only decision-relevant findings. Do not create a repository encyclopedia.

## Output

```text
Repository orientation:
- Stack:
- Package/workspace shape:
- Relevant commands:
- Relevant conventions:
- Target area:
- Tests near target:
- Docs/ADRs found:
- Generated/vendored areas to avoid:
- Known risks:
- Unknowns:
```

## Exit criteria

- The agent knows where to change code.
- The agent knows the strongest affordable verification command.
- Existing conventions near the target are identified.
- Unknowns are explicit.

## Failure modes

| Failure | Correction |
|---|---|
| Inferring structure from filenames | Inspect files and scripts. |
| Reading too broadly | Stop after the task-relevant map is sufficient. |
| Ignoring tests | Find nearby tests or mark test gap explicitly. |
