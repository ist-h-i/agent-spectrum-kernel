---
name: review-to-rule-compiler
description: Extract domain rule candidates from reviews, human corrections, incidents, requirement discussions, and rejected AI outputs without auto-promoting them.
---

# Review-To-Rule Compiler

## Goal

Extract domain rule candidates from evidence and prepare safe additions or updates for `docs/ai/domain-rule-ledger.md`.

This is rule-candidate extraction and promotion support. It must not automatically turn inferred review patterns into confirmed business truth.

## Use when

- `review-domain-impact` findings reveal a recurring or important domain rule.
- Human review comments, corrections, or domain-owner decisions should become durable rule candidates.
- Requirement Grill outputs or Work Package mismatches reveal missing domain rules.
- Incidents, postmortems, rejected AI outputs, or repeated user corrections should be evaluated for domain-rule promotion.

## Do not use when

- The finding is technical debt or a validation/refactor candidate. Use `improvement-ledger`.
- The task is to implement business logic.
- The user expects rules to be confirmed without evidence or human/domain-owner decision.
- A one-off opinion has no durable business-rule value.

## Process

1. Identify source material.
   - `review-domain-impact` findings.
   - Human review comments and corrections.
   - Requirement Grill outputs.
   - Work Package mismatches.
   - Production incidents or postmortems.
   - Repeated user corrections.
   - Explicit domain-owner decisions.

2. Extract candidates.
   - State the candidate rule.
   - Name business object, actor, workflow, and condition.
   - Cite source and evidence status.
   - Identify whether an existing ledger entry should be updated, contradicted, deprecated, or left unchanged.

3. Apply promotion rules.
   - AI may create `Hypothesis` candidates from observed patterns.
   - AI may propose `Supported` only when evidence is present but not fully direct.
   - `Human-confirmed` requires human/domain-owner confirmation.
   - `Verified` requires direct repo/docs/tests/runtime/production evidence.
   - Contradictions must be visible and routed to human decision.

4. Separate technical improvements.
   - Use `improvement-ledger` for debt, code smell, validation gaps, refactor candidates, and technical prevention rules.
   - A rule candidate may reference improvement items, but must not hide technical debt in domain rules.

5. Do not edit durable rules unless explicitly requested.
   - Default output is proposed ledger changes.
   - When explicitly asked to update the ledger, use `domain-rule-ledger` semantics and preserve evidence status.

## Output

```text
Rule extraction:
- Source reviewed:
- New domain rule candidates:
- Updated domain rules:
- Contradicted rules:
- Deprecated rules:
- Rejected candidates:
- Evidence status:
- Promotion decision:
- Required human confirmation:
- Consumers to refresh:
```

## Exit criteria

- Candidates are separated from confirmed rules.
- Every candidate has source and evidence status.
- Human confirmation requirements are explicit.
- Contradicted, deprecated, and stale entries are visible.
- Technical debt remains in the improvement workflow.

## Failure modes

| Failure | Correction |
|---|---|
| Auto-promoting review guesses | Keep them as `Hypothesis` or `Supported`. |
| Hiding technical debt as a domain rule | Route to `improvement-ledger`. |
| Resolving contradictions silently | Mark contradiction and require human decision. |
| Editing durable rules without request | Output proposed changes only. |
