---
name: documentation-knowledge-compiler
description: Extract durable engineering knowledge from docs, ADRs, PR descriptions, handoffs, and context artifacts without storing task progress.
---

# Documentation Knowledge Compiler

## Goal

Identify which documentation knowledge should become durable reusable context, which should remain task-local, and which is stale, conflicting, or insufficiently evidenced.

This skill does not create a document management system. It routes durable knowledge to the correct target and prevents stale docs from becoming trusted facts.

## Use when

- Docs, ADRs, PR descriptions, handoffs, review context, implementation context, meeting notes, or requirement discussions contain reusable engineering knowledge.
- A document conflicts with code, ADRs, project overlays, or ledgers.
- Durable knowledge should be routed to review context, implementation context, domain rule ledger, engineering pattern ledger, verification pattern ledger, ADR, architecture memory, or project overlay.
- `docs/ai/documentation-knowledge-ledger.md` needs an entry added, refreshed, deprecated, or contradicted.

## Do not use when

- The content is transient task progress; use `planning-with-files` or `handoff-generation`.
- The user wants a direct docs edit and no durable knowledge decision is needed.
- The source is a raw private transcript or full document that should not be copied into a ledger.
- Existing docs are stale and no freshness evidence is available.

## Process

1. Identify candidate knowledge.
   - Requirement, design decision, implementation convention, verification expectation, review policy, operation note, release note, known issue, or deprecated information.

2. Verify source and freshness.
   - Source document and location.
   - Evidence status and freshness status.
   - Conflicts with code, tests, ADRs, project overlay, ledgers, or current user input.

3. Choose the durable target.
   - Review knowledge -> `review-context-generation` or review rule ledger.
   - Implementation convention -> `implementation-context-generation` or engineering pattern ledger.
   - Verification expectation -> verification pattern ledger.
   - Business/domain rule -> `domain-rule-ledger`.
   - Architecture decision -> `architecture-decision-memory` or `adr-review`.
   - Task progress -> `planning-with-files` or handoff, not durable docs memory.
   - Docs correction -> docs update or issue.

4. Classify evidence and freshness.
   - Evidence: `Verified`, `Human-confirmed`, `Supported`, `Hypothesis`, `Deprecated`, `Contradicted`.
   - Freshness: `current`, `stale`, `conflicting`, `unknown`, `deprecated`.

5. Record only the durable statement, source reference, consumers, conflicts, recommended target, staleness trigger, and owner.

## Output

```text
Documentation knowledge compilation:
- Decision: add | refresh | deprecate | contradict | route elsewhere | insufficient evidence
- Knowledge ID:
- Knowledge type:
- Statement:
- Source document:
- Source location:
- Evidence status:
- Freshness status:
- Consumers:
- Conflicts:
- Recommended target:
- Staleness trigger:
- Owner:

Routing:
- Review context:
- Implementation context:
- Domain rule ledger:
- Engineering pattern ledger:
- Verification pattern ledger:
- Architecture memory / ADR:
- Project overlay:
- Docs update:
- Task progress handoff:
```

## Exit criteria

- Durable knowledge is separated from task progress.
- Stale or conflicting docs are not treated as current truth.
- Full documents, transcripts, secrets, and raw private data are not copied into the ledger.
- The recommended target is explicit and does not overwrite ADRs or project overlays automatically.
- Conflicts remain visible until resolved.

## Failure modes

| Failure | Correction |
|---|---|
| Storing task progress as durable knowledge | Route to `planning-with-files` or handoff. |
| Treating old docs as truth | Mark freshness as stale or unknown until evidence is refreshed. |
| Copying full documents | Store a statement and source reference only. |
| Overwriting ADR or overlay rules | Propose an update and preserve the conflict. |
