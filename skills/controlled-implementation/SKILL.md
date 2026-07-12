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

1. Read `docs/lifecycle-artifact-contract.md` and start the Implementation Contract before editing.

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
- Artifact ID:
- Artifact type: implementation
- Upstream refs:

Conditional entry fields, omit when irrelevant:
- Change class: feature | bug fix | refactor | cleanup | test | docs
- Implementation decisions not fixed upstream:
- Implementation context / engineering pattern / architecture memory / stack overlay refs:
```

Inherit behavior, acceptance criteria, allowed/forbidden scope, proof obligations, and stop conditions from upstream refs. If any must change, record an explicit delta and obtain the decision evidence required by the owning contract.

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

6. Complete the Implementation Contract with implementation-only facts, then inspect the final diff.

Check for:

- unintended files,
- formatting churn,
- hidden behavior changes,
- stale comments/docs,
- missing tests,
- unsupported claims.
- next action summarized in work terms such as running missing checks, preparing review, or stopping for approval.

```text
Implementation completion:
- Actual files/components and change boundary:
- Verification attempted:
- Evidence references:
- Handoff state:

Conditional fields, omit when irrelevant:
- Deviations from upstream contracts:
- Newly discovered assumptions, risks, or blockers:
- Remaining limitations:
- Approved deltas:
```

## Exit criteria

Implementation is complete only when:

- the Implementation Contract was created and followed or a stop condition was reported,
- the requested behavior is implemented,
- the diff stays inside scope,
- verification evidence is recorded or limitation is explicit,
- risks and assumptions are visible,
- next step is narrow.

## Output

Use the shared `Execution Envelope` from `docs/execution-envelope-contract.md` for route, evidence, stop reason, and next action. This skill emits the Implementation Contract and implementation summary below; it does not repeat the envelope fields.

```text
Implementation Contract:
- Artifact ID:
- Artifact type: implementation
- Upstream refs:
- Actual files/components and change boundary:
- Verification attempted:
- Evidence references:
- Handoff state:

Conditional fields, omit when irrelevant:
- Change class:
- Implementation decisions not fixed upstream:
- Context, pattern, memory, or overlay refs:
- Deviations:
- Newly discovered assumptions, risks, or blockers:
- Remaining limitations:
- Approved deltas:
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
| Replays Requirement, Spec, scope, or proof prose | Replace unchanged content with upstream refs. |
