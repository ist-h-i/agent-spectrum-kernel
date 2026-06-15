---
name: repository-orientation
description: Build a concise map of an unfamiliar repository before making changes. Use at the start of work in a repo whose structure, commands, conventions, or test setup are not yet known.
---

# Repository Orientation

## Goal

Understand enough of the repository to avoid random edits and false assumptions.

## When to use

Use when:
- This is the first task in a repository.
- The requested change spans unfamiliar modules.
- Build/test commands are unknown.
- The repo has unclear architecture, generated code, or multiple packages.

Do not use for a tiny, already-localized edit where the relevant files are obvious.

## Process

1. Inspect project entry points:
   - README or equivalent.
   - package/build/dependency files.
   - test, lint, typecheck, and CI configuration.
   - workspace/monorepo configuration.

2. Inspect domain and architecture material:
   - docs/
   - adr/
   - CONTEXT.md or context maps
   - contributing guide
   - code ownership or module boundaries

3. Identify commands:
   - install
   - build
   - test
   - typecheck
   - lint
   - run/dev server
   - focused test command for the target area

4. Map relevant code:
   - target files
   - neighboring tests
   - existing patterns
   - public interfaces
   - generated or vendored files to avoid

5. Record only useful findings. Do not create a large repo encyclopedia.

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
- Known risks:
- Unknowns:
```

## Anti-rationalization

| Excuse | Rebuttal |
|---|---|
| “I can infer the structure from filenames.” | Inspect the actual repo. Filenames lie. |
| “I only need one file.” | Nearby tests and conventions determine whether the change is valid. |
| “No docs means no architecture.” | Existing code is still architecture. |
