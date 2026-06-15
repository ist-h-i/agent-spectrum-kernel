---
name: adr-review
description: Decide whether an architectural decision should be recorded or updated. Use for hard-to-reverse choices involving APIs, persistence, architecture boundaries, dependencies, deployment, or cross-team contracts.
---

# ADR Review

## Goal

Keep architectural memory durable without turning every small choice into documentation.

## When an ADR is needed

Use an ADR when the decision:
- is hard to reverse,
- affects multiple modules or teams,
- changes a public API or data contract,
- introduces a dependency,
- changes persistence, deployment, security, or reliability posture,
- resolves a disputed design direction,
- invalidates or supersedes an older ADR.

Do not write an ADR for local implementation details.

## Process

1. Read existing ADRs and architecture docs.
2. Identify the decision:
   - What is being decided?
   - What alternatives were considered?
   - What constraints matter?
   - What is the consequence of being wrong?
3. Check consistency with previous decisions.
4. Decide:
   - no ADR needed,
   - new ADR,
   - update existing ADR,
   - supersede existing ADR.
5. Draft or update the ADR.

## ADR Template

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

## Anti-rationalization

| Excuse | Rebuttal |
|---|---|
| “The code documents the decision.” | Code documents what, not why. |
| “We can reconstruct this later.” | Later reconstruction is usually fiction. |
| “An ADR is too heavy.” | A short ADR is cheaper than repeated rediscovery. |
