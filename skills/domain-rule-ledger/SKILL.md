---
name: domain-rule-ledger
description: Create, update, and govern durable business/domain rule ledgers with evidence status, stale triggers, contradictions, and promotion gates.
---

# Domain Rule Ledger

## Goal

Maintain a durable, reviewable domain rule ledger without turning AI-inferred rules into automatic business truth.

Use this skill to create or update `docs/ai/domain-rule-ledger.md` entries that future requirement definition, work package compilation, and domain impact review can consume safely.

## Use when

- A project needs durable memory for business rules, approval criteria, workflow constraints, or state semantics.
- A review, requirement discussion, incident, or human correction produced a domain rule candidate.
- Existing domain rules need stale review, contradiction handling, owner assignment, or evidence-status updates.
- `requirement-grill`, `work-package-compiler`, or `review-domain-impact` needs a governed rule source.

## Do not use when

- The information is temporary task progress. Use `planning-with-files` or a task handoff instead.
- The finding is technical debt, code smell, validation gap, or refactor work with no business/domain rule. Use `improvement-ledger`.
- The rule candidate is only an AI guess and the user asked for confirmed truth.
- The task is to implement product behavior. This skill governs rule records only.

## Process

1. Locate the ledger.
   - Default path: `docs/ai/domain-rule-ledger.md`.
   - If missing and the user asked to initialize durable rules, create it from the repository template shape.
   - Treat `ledger_status: template` as no project-specific domain rules.

2. Classify each rule or candidate.

```text
Domain rule entry:
- ID:
- Rule:
- Business object:
- Business actor:
- Workflow:
- State / condition:
- Source:
- Evidence status:
- Applies to:
- Used by:
- Last checked:
- Staleness trigger:
- Owner:
```

3. Apply evidence status semantics.
   - `Verified`: directly supported by repo/docs/tests/runtime/production behavior.
   - `Human-confirmed`: confirmed by a responsible human or domain owner.
   - `Supported`: backed by indirect evidence but not fully proven.
   - `Hypothesis`: usable for question generation only, not for blocking review.
   - `Deprecated`: retained for history and migration context.
   - `Contradicted`: retained as a visible conflict requiring a human/domain-owner decision.

4. Enforce promotion gates.
   - `Hypothesis` -> `Supported` requires cited supporting evidence.
   - `Supported` -> `Verified` requires direct repo/docs/tests/runtime/production evidence.
   - Any status -> `Human-confirmed` requires explicit human/domain-owner confirmation.
   - Contradictions are not overwritten silently; keep the contradicted entry visible and add the conflict source.

5. Handle stale rules.
   - Mark stale review when `Last checked` is old relative to `Staleness trigger`.
   - If current evidence no longer supports a rule, move it to `Contradicted` or `Deprecated` instead of deleting it.
   - Do not use stale or contradicted rules as blocking constraints without human review.

6. Keep consumers explicit.
   - Record `Used by` as `requirement-grill`, `work-package-compiler`, `review-domain-impact`, or another concrete consumer.
   - When a rule changes, name which consumers or reviews should be refreshed.

## Output

```text
Domain rule ledger update:
- Ledger path:
- Ledger status:
- Entries added:
- Entries updated:
- Entries marked stale:
- Contradictions:
- Deprecated rules:
- Promotion decisions:
- Human confirmation required:
- Consumers to refresh:
- Evidence reviewed:
- Not changed:
```

## Exit criteria

- Each durable rule has a source and evidence status.
- AI-created candidates remain `Hypothesis` or `Supported` unless stronger evidence or human confirmation exists.
- Stale and contradicted rules remain visible.
- Human decision boundaries are explicit.
- Technical debt is not hidden inside domain rules.

## Failure modes

| Failure | Correction |
|---|---|
| Auto-promoting inferred business rules | Keep them as `Hypothesis` or `Supported` and ask for confirmation. |
| Deleting contradicted rules | Mark `Contradicted` and cite the conflict. |
| Storing task progress as a domain rule | Move progress to handoff or planning artifacts. |
| Using `Hypothesis` rules to block review | Use them only for questions or warnings. |
