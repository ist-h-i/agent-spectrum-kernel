---
name: engineering-pattern-ledger
description: Record, refresh, and apply evidence-backed reusable implementation patterns without replacing project overlays or stack-specific skills.
---

# Engineering Pattern Ledger

## Goal

Preserve reusable implementation judgment for a repository, stack, or project overlay while keeping enforcement tied to evidence status.

This skill turns repeated accepted implementation evidence, review outcomes, and project conventions into pattern entries that can inform future work. It does not implement code and does not replace project overlays, ADRs, implementation context, or stack-specific skills.

## Use when

- A repeated implementation shape has been accepted, rejected, constrained, or proven risky.
- A Work Package needs reusable implementation guidance from prior evidence.
- `controlled-implementation`, `application-boundary-architecture`, or a stack overlay needs repository-specific implementation patterns.
- A review finding should become implementation guidance rather than a domain rule, one-off improvement item, or ADR.
- `docs/ai/engineering-pattern-ledger.md` needs an entry added, refreshed, deprecated, or contradicted.

## Do not use when

- The task is a trivial localized edit with no repeated implementation pattern.
- The guidance is a project-specific rule that belongs in a project overlay.
- The decision is architecture memory or ADR-worthy rather than implementation pattern guidance.
- The observation is a one-off review finding with no reusable value.
- Evidence is only an AI guess and the user wants enforcement.

## Process

1. Identify the pattern candidate.
   - Source: PR, review, issue, incident, accepted implementation, test, docs, or human confirmation.
   - Scope: repository, stack overlay, project overlay, module, or boundary.
   - Pattern type: accepted shape, rejected alternative, risky pattern, constrained usage, or deprecated practice.

2. Check existing sources before adding a pattern.
   - Project overlay and AGENTS rules.
   - `docs/ai/implementation-context.md`.
   - ADRs and `architecture-decision-memory`.
   - Existing engineering pattern entries.
   - Stack overlay skills such as `angular-implementation-architecture`.

3. Classify evidence status.
   - `Verified`: directly observed in code, tests, docs, CI, runtime output, or merged PR evidence.
   - `Human-confirmed`: explicitly confirmed by a responsible human.
   - `Supported`: indirectly supported by repeated or related evidence.
   - `Hypothesis`: plausible and useful for questions only.
   - `Deprecated`: retained for history but no longer recommended.
   - `Contradicted`: conflicts with newer evidence and needs resolution.

4. Decide the target.
   - Add or refresh an engineering pattern entry.
   - Route to project overlay when it should become a local rule.
   - Route to `architecture-decision-memory` or `adr-review` when the decision is architectural.
   - Route to `verification-pattern-ledger` when the durable lesson is evidence expectation.
   - Route to `improvement-ledger` when this is follow-up work rather than a reusable pattern.

5. Write the entry with source, evidence status, staleness trigger, consumers, and review impact.

6. Apply safely.
   - `Verified` and `Human-confirmed` entries may be used as implementation constraints when the scope matches.
   - `Supported` entries may guide a preferred shape but need current repo checks.
   - `Hypothesis` entries may generate questions and caution notes only.
   - `Deprecated` and `Contradicted` entries must stay visible until replaced or closed.

## Output

```text
Engineering pattern ledger update:
- Decision: add | refresh | deprecate | contradict | route elsewhere | insufficient evidence
- Pattern ID:
- Pattern name:
- Layer / boundary:
- Evidence source:
- Evidence status:
- Applies when:
- Do not use when:
- Accepted implementation shape:
- Rejected alternatives:
- Related files / modules:
- Related skills:
- Review impact:
- Verification expectation:
- Staleness trigger:
- Owner:

Routing:
- Project overlay:
- Implementation context:
- Architecture memory / ADR:
- Verification pattern:
- Improvement ledger:
```

## Exit criteria

- The entry has source, evidence status, owner, and staleness trigger.
- The pattern is not duplicated from a project overlay, ADR, or stack overlay.
- Hypotheses are not treated as rules or blockers.
- Consumers know how the entry should be used by implementation, work packaging, and review.
- Contradicted or deprecated patterns remain visible until intentionally replaced.

## Failure modes

| Failure | Correction |
|---|---|
| Turning generic best practice into project memory | Require repository evidence or human confirmation. |
| Duplicating project overlay rules | Reference or propose overlay updates instead of copying rules. |
| Enforcing hypothesis entries | Downgrade to question or caution only. |
| Storing task progress | Use `planning-with-files` or handoff artifacts instead. |
| Hiding architecture decisions in implementation patterns | Route to `architecture-decision-memory` or `adr-review`. |
