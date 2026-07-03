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

1. Produce the Implementation Contract before editing.

Read `docs/ai/implementation-context.md` when it exists. Use it for known commands, implementation patterns, boundaries, generated-file policy, and stop conditions. If it is missing but the task is small and local, proceed from nearby repository evidence instead of forcing context generation. If it is missing or stale for repeated or non-trivial work, recommend `implementation-context-generation`.

```text
Implementation Contract:
- Goal:
- Change class:
  - feature | bug fix | refactor | cleanup | test | docs
- Expected behavior:
- Non-goals:
- Allowed files/modules:
- Forbidden files/modules:
- Public contract impact:
- Data/state impact:
- Error handling expectation:
- Existing patterns to reuse:
- Boundary decision:
  - resolved | unresolved | not needed
- Implementation context:
  - read | missing | stale | not needed
- Stack overlay used:
  - none | project-specific | stack-specific
- Verification contract:
- Stop conditions:
```

Stop before implementation when:

- boundary mechanics are unresolved; route to `application-boundary-architecture`,
- a verification path is missing or cannot produce sufficient evidence,
- stack-specific implementation uncertainty exists and a relevant overlay is available,
- public API, schema, migration, dependency, auth, permission, billing, email, telemetry, production config, or infrastructure changes are needed,
- generated/manual-edit boundaries are unclear,
- a human decision is required.

Do not treat passing tests as permission to expand scope beyond the contract.

2. Inspect nearby patterns.

Before editing, inspect:

- nearest equivalent implementation,
- neighboring tests,
- error handling style,
- naming conventions,
- public interfaces,
- dependency patterns,
- stack or project overlay constraints when the contract selected an overlay.

3. Make the smallest valid change.

Rules:

- preserve public contracts unless explicitly changing them,
- avoid new abstractions unless justified by observed duplication or boundary pressure,
- keep behavior change and cleanup separate,
- do not touch generated/vendor files unless required,
- prefer local reversible changes.

4. Add or update verification.

Use `test-first-verification` when behavior needs proof or a bug/regression is involved. Reference its Verification Contract before changing behavior.

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

- the Implementation Contract was created and followed or a stop condition was reported,
- the requested behavior is implemented,
- the diff stays inside scope,
- verification evidence is recorded or limitation is explicit,
- risks and assumptions are visible,
- next step is narrow.

## Output

```text
Implementation Contract:
- Goal:
- Change class:
- Expected behavior:
- Non-goals:
- Allowed files/modules:
- Forbidden files/modules:
- Public contract impact:
- Data/state impact:
- Error handling expectation:
- Existing patterns to reuse:
- Boundary decision:
- Implementation context:
- Stack overlay used:
- Verification contract:
- Stop conditions:

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
