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

Read `docs/ai/implementation-context.md` when it exists. Check `context_status` before using it:

- `template`: treat as missing durable context; placeholder rows and `Unknown` values are not implementation evidence.
- `initialized`: use recorded commands, implementation patterns, boundaries, generated-file policy, and stop conditions according to their evidence status.
- `stale`: refresh affected context or downgrade affected claims to `insufficient evidence` before relying on them.

If implementation context is missing or `template` but the task is small and local, proceed from nearby repository evidence instead of forcing context generation. If it is missing, `template`, or `stale` for repeated or non-trivial work, recommend `implementation-context-generation`.

When `docs/ai/engineering-pattern-ledger.md` exists, consult it only when the task has a repeated implementation shape, project-specific pattern, or review finding that materially affects the implementation choice:

- `template`: treat as no project-specific pattern evidence.
- `active`: use matching `Verified` or `Human-confirmed` entries as constraints, `Supported` entries as cautions requiring current repo checks, and `Hypothesis` entries as questions only.
- `archived`: cite for history only; do not use as current implementation guidance.

If the implementation decision depends on a prior architecture or boundary decision, consult `docs/ai/architecture-decision-memory.md` with the same evidence-status discipline and route to `application-boundary-architecture` or `adr-review` when mechanics or durable ADR action are unresolved.

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
  - initialized | template | missing | stale | not needed
- Engineering pattern ledger:
  - active | template | missing | archived | not needed
- Architecture decision memory:
  - active | template | missing | archived | not needed
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
- next action summarized in work terms such as running missing checks, preparing review, or stopping for approval.

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
Selected work mode:
- 実装

User-facing route:
- How the scoped change will be made, what boundaries are preserved, and what checks determine whether it is ready for review.

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
- Engineering pattern ledger:
- Architecture decision memory:
- Stack overlay used:
- Verification contract:
- Stop conditions:

Internal route:
- Primary: controlled-implementation
- Secondary:
- Next if implemented:
- Stop if:

Implementation summary:
- Goal:
- Changed files:
- Behavior changed:
- Scope kept:
- Verification:
- Not verified:
- Risks/assumptions:
- Next:

Next action:
- run missing verification | run review gates | prepare PR explanation | create handoff | stop for human decision | no further action needed
```

## Optional Metrics Event Candidate

Only when adoption metrics are explicitly enabled or requested, and the implementation reaches a meaningful durable state, include a `Metrics event candidate` following `docs/metrics-event-contract.md`.

Use counts, related IDs, verification references, and a privacy note. Do not store raw prompts, secrets, customer data, or detailed improvement-ledger findings.

## Failure modes

| Failure | Correction |
|---|---|
| Implements before requirements are clear | Stop and route to spec or grill. |
| Refactors while implementing | Split cleanup unless required for the change. |
| Copies patterns without checking tests | Inspect tests and contracts near the pattern. |
| Claims complete from diff alone | Record verification evidence or downgrade claim. |
