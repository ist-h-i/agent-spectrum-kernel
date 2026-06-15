---
name: adr-review
description: Decide whether an architectural decision should be recorded, updated, or superseded. Use for hard-to-reverse choices involving APIs, persistence, architecture boundaries, dependencies, deployment, security, or cross-team contracts.
---

# ADR Review

## Goal

Keep architectural memory durable without turning every small choice into documentation.

## Use when

A decision:
- is hard to reverse,
- affects multiple modules or teams,
- changes a public API or data contract,
- introduces or removes a dependency,
- changes persistence, deployment, security, or reliability posture,
- resolves a disputed design direction,
- invalidates or supersedes an older ADR.

## Do not use when

- The decision is a local implementation detail.
- Existing docs already capture the rationale accurately.

## Process

1. Read existing ADRs and architecture docs.

2. Identify the decision.

```text
Decision:
Alternatives:
Constraints:
Consequences if wrong:
Reversibility:
```

3. Check consistency with previous decisions.

4. Decide:
- no ADR needed,
- new ADR,
- update existing ADR,
- supersede existing ADR.

5. Draft the smallest adequate ADR.

## ADR template

```text
# ADR-NNN: Title

Date:
Status: proposed | accepted | superseded | deprecated

## Context

## Decision

## Options considered

### Option A
Pros:
Cons:

### Option B
Pros:
Cons:

## Consequences

## Verification / review trigger

## Supersedes / superseded by
```

## Output

```text
ADR decision:
- Needed: yes | no | update | supersede
- Reason:
- Existing ADRs affected:
- Proposed title:
- Key consequences:
- Review trigger:
```

## Exit criteria

- The decision’s reversibility and cross-cutting impact are assessed.
- ADR status is clear.
- Rationale is recorded without excessive ceremony.

## Failure modes

| Failure | Correction |
|---|---|
| “The code documents it.” | Code documents what, not why. |
| ADR for every small choice | Record only durable architectural decisions. |
| New ADR ignoring old ADRs | Read and link/supersede existing decisions. |
