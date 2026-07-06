---
name: review-domain-impact
description: Review whether a code change introduces, modifies, or removes business behavior, domain rules, workflow responsibility, state semantics, operational meaning, reporting meaning, notification timing, permissions, approval/completion criteria, or generated text used for business judgment. Use before technical review when domain impact may exist.
---

# Domain Impact Review

## Goal

Determine what business reality the change modifies and whether that domain change is explicit, authorized, and correctly represented.

## Use when

A change affects or may affect:
- business workflow,
- business rules,
- permissions or responsibility,
- status/state semantics,
- approval, rejection, completion, or escalation criteria,
- reporting, metrics, evaluation, or billing meaning,
- notifications with operational meaning,
- user-visible behavior that changes work decisions,
- data meaning, not only data shape,
- generated text used for business judgment,
- automation that replaces or changes a human step.

## Do not use when

- The change is purely mechanical formatting.
- The change is internal refactoring with verified unchanged behavior and no domain meaning change.
- The change only improves local readability.
- Domain behavior is already explicitly unchanged and verified.
- The task is to create or modify domain rules. Use `domain-rule-ledger` or `review-to-rule-compiler`.

## Process

1. Gather domain input sources when available.

```text
Domain input sources:
- Requirement Contract:
- Work Package:
- Domain Rule Ledger:
- Review context:
- Repository orientation / initial analysis:
```

Treat missing, template, stale, or contradicted inputs as evidence limitations. Do not infer confirmed business truth from placeholders.

2. Apply evidence priority.

```text
1. Current explicit user requirement / issue / approved spec
2. Human-confirmed domain rule
3. Verified production/repo behavior
4. Supported domain rule
5. Hypothesis domain rule
```

Rules:
- `Human-confirmed` and `Verified` domain rules may be used as review constraints.
- `Supported` rules may support caution or insufficient-evidence findings.
- `Hypothesis` rules may generate questions or warnings, but cannot be the sole basis for fail or block.
- `Contradicted` rules must be reported as conflicts requiring human/domain-owner decision.
- Stale rules require explicit review before use as constraints.

3. Identify the domain object.

```text
Business object:
Business action:
Business state:
Business actor:
Business rule:
Business outcome:
```

4. Compare before and after business behavior.

```text
Before:
After:
Changed business meaning:
```

5. Classify the change.
   - no domain impact,
   - domain-preserving implementation change,
   - explicit domain change,
   - implicit domain change,
   - unauthorized domain change,
   - insufficient domain evidence.

6. Check evidence.
   - issue or requirement,
   - spec or docs,
   - user request,
   - ADR or decision record,
   - tests,
   - production behavior.
   - Requirement Contract,
   - Work Package,
   - `docs/ai/domain-rule-ledger.md`,
   - `docs/ai/review-context.md`,
   - repository orientation or initial analysis.

7. Check domain rules.

```text
Domain rule checks:
- Applied confirmed/verified rules:
- Supported rules considered:
- Hypothesis rules used only for questions:
- Contradicted/stale rules:
```

8. Identify responsibility shift.
   - who gains responsibility,
   - who loses responsibility,
   - who gets new information,
   - who may make a different decision because of the change.

9. Separate AI-verifiable checks from human decisions.
   - AI-verifiable: explicit requirement, repo behavior, tests/docs alignment, confirmed/verified rule consistency.
   - Human decision required: new business rule, value tradeoff, owner approval, contradiction resolution, stale rule confirmation.

10. Decide required action.
   - pass,
   - pass with domain note,
   - request domain clarification,
   - require product/domain owner approval,
   - require ADR/domain decision record,
   - block.

## Output

```text
Domain impact decision:
- Classification:
- Gate status: pass | pass with note | fail | insufficient evidence
- Domain input sources:
- Domain rule checks:
- Decision boundary:
- Business object:
- Business rule changed:
- Workflow changed:
- Responsibility changed:
- Evidence:
- Missing evidence:
- Required fix:
- Required approval:
- Residual domain risk:
```

## Exit criteria

- Domain impact classification is explicit.
- Business before/after is documented when impact exists.
- Missing owner approval or domain evidence is visible.
- A PR with possible domain impact is not approved by logic/design review alone.

## Failure modes

| Failure | Correction |
|---|---|
| Treating validation changes as logic only | Check whether acceptance criteria changed. |
| Treating enum/status changes as type-only | Check state semantics and operational meaning. |
| Treating notification changes as UX-only | Check responsibility and intervention timing. |
| Mixing domain with architecture | Decide what business truth changes before deciding system boundaries. |
