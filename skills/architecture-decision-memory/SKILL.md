---
name: architecture-decision-memory
description: Preserve reusable architecture and boundary decisions with evidence, alternatives, tradeoffs, and revisit conditions without replacing ADRs.
---

# Architecture Decision Memory

## Goal

Record lightweight reusable architecture and boundary decision memory with evidence, alternatives, consequences, and revisit conditions.

This skill is the pre-ADR and cross-task memory layer. ADRs remain the canonical durable architecture record when they exist. Use `adr-review` when a decision should be recorded, updated, superseded, or reconciled as an ADR.

## Use when

- Similar boundary or design decisions recur across tasks.
- `application-boundary-architecture` needs prior decision context.
- `review-architecture-impact` needs to compare a diff against existing architecture intent.
- An architecture decision is too lightweight or pre-decisional for an ADR but still useful to preserve.
- `docs/ai/architecture-decision-memory.md` needs an entry added, refreshed, deprecated, or contradicted.

## Do not use when

- A formal ADR already exists and only needs review or update; use `adr-review`.
- The decision is a local implementation pattern; use `engineering-pattern-ledger`.
- The task is trivial and has no architecture or boundary implication.
- The decision is based only on AI inference and would be enforced as a rule.

## Process

1. Identify the architecture boundary.
   - Dependency direction, module boundary, feature public API, persistence boundary, infrastructure boundary, DTO/error trust boundary, async lifetime, ownership, lifecycle, or coupling.

2. Gather decision evidence.
   - Code structure, imports, tests, docs, ADRs, review findings, issue discussion, Work Package, or human confirmation.
   - Options considered, accepted option, rejected alternatives, tradeoffs, consequences, and constraints.

3. Classify evidence status.
   - `Verified`, `Human-confirmed`, `Supported`, `Hypothesis`, `Deprecated`, or `Contradicted`.
   - Hypothesis decisions may guide questions only.

4. Decide target.
   - Add or update architecture memory.
   - Route to `adr-review` if the decision is hard to reverse, externally visible, policy-level, or already contradicted by an ADR.
   - Route to `application-boundary-architecture` if boundary mechanics are unresolved.
   - Route to `engineering-pattern-ledger` if the durable result is implementation shape.

5. Record revisit and staleness conditions.
   - Required when APIs, ownership, dependency direction, persistence, performance, scale, product constraints, or team ownership changes.

## Output

```text
Architecture decision memory update:
- Decision: add | refresh | deprecate | contradict | route to ADR | route to boundary design | insufficient evidence
- Decision ID:
- Decision summary:
- Architecture boundary:
- Context:
- Options considered:
- Accepted option:
- Rejected alternatives:
- Reason:
- Tradeoffs:
- Consequences:
- Evidence source:
- Evidence status:
- Related ADR:
- Related project overlay rule:
- Related engineering pattern:
- Review impact:
- Revisit condition:
- Staleness trigger:
- Owner:

Routing:
- ADR review:
- Application boundary:
- Engineering pattern:
- Work package:
- Review architecture impact:
```

## Exit criteria

- The memory entry has evidence status, alternatives, consequences, owner, and revisit conditions.
- ADRs remain canonical when present.
- Hypothesis entries are not enforced as architecture rules.
- Contradictions with ADRs, project overlays, code, or patterns are reported.
- Consumers know whether to use, question, or ignore the entry.

## Failure modes

| Failure | Correction |
|---|---|
| Replacing ADRs with memory | Route to `adr-review` for formal durable decisions. |
| Recording every small design choice | Require recurrence, boundary impact, or review relevance. |
| Enforcing AI-inferred architecture intent | Mark as Hypothesis and ask questions only. |
| Losing revisit conditions | Require staleness and revisit triggers before entry acceptance. |
