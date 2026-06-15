---
name: controlled-implementation
description: Execute a scoped implementation with minimal diff, repository conventions, and verification checkpoints. Use after scope/spec are clear or for medium-risk code changes.
---

# Controlled Implementation

## Goal

Implement the required behavior without scope drift, speculative architecture, or unverifiable completion claims.

## Use when

- The target behavior and scope are clear enough to implement.
- A non-trivial code change is required.
- Multiple files may change but the boundary is known.
- You need a disciplined implementation loop after spec, grill, or investigation.

## Do not use when

- Core requirements are still unclear. Use `grill-design` or `spec-driven-development` first.
- Root cause is unknown. Use `doubt-driven-development` first.
- The operation is destructive or externally visible. Use `risk-gate` first.

## Process

1. Restate the implementation contract.

```text
Goal:
Allowed scope:
Forbidden scope:
Expected behavior:
Verification:
```

2. Inspect nearby patterns.

Before editing, inspect:

- nearest equivalent implementation,
- neighboring tests,
- error handling style,
- naming conventions,
- public interfaces,
- dependency patterns.

3. Make the smallest valid change.

Rules:

- preserve public contracts unless explicitly changing them,
- avoid new abstractions unless justified by observed duplication or boundary pressure,
- keep behavior change and cleanup separate,
- do not touch generated/vendor files unless required,
- prefer local reversible changes.

4. Add or update verification.

Use `test-first-verification` when behavior needs proof or a bug/regression is involved.

5. Run focused checks.

Run the narrowest relevant check first. Then run broader checks proportional to risk.

6. Inspect the final diff.

Check for:

- unintended files,
- formatting churn,
- hidden behavior changes,
- stale comments/docs,
- missing tests,
- unsupported claims.

## Exit criteria

Implementation is complete only when:

- the requested behavior is implemented,
- the diff stays inside scope,
- verification evidence is recorded or limitation is explicit,
- risks and assumptions are visible,
- next step is narrow.

## Output

```text
Implementation summary:
- Goal:
- Changed files:
- Behavior changed:
- Scope kept:
- Verification:
- Not verified:
- Risks/assumptions:
- Next:
```

## Failure modes

| Failure | Correction |
|---|---|
| Implements before requirements are clear | Stop and route to spec or grill. |
| Refactors while implementing | Split cleanup unless required for the change. |
| Copies patterns without checking tests | Inspect tests and contracts near the pattern. |
| Claims complete from diff alone | Record verification evidence or downgrade claim. |
