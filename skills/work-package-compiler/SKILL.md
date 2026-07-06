---
name: work-package-compiler
description: Convert a confirmed Requirement Contract into an agent-ready Work Package with scope, review gates, verification, and blockers.
---

# Work Package Compiler

## Goal

Convert a confirmed Requirement Contract or equivalent approved spec into an agent-ready Work Package.

This is a transformation skill. It does not make business decisions and must route back to `requirement-grill` when required decisions are unresolved.

## Use when

- A Requirement Contract is available and business decisions are sufficiently resolved.
- A human wants an executable task for another agent or future session.
- Scope, non-goals, verification, risk gates, and review gates need to be packaged together.
- Domain rules from `docs/ai/domain-rule-ledger.md` should be applied as constraints.

## Do not use when

- User intent, desired outcome, or business decision boundary is still unclear.
- The task needs technical design stress testing before it can be safely implemented.
- The user asked for implementation now and no packaging handoff is needed.
- The package would hide risk gates or unresolved decisions inside a prompt.

## Process

1. Verify inputs.
   - Requirement Contract from `requirement-grill` or equivalent approved spec.
   - Relevant repo facts and project overlay.
   - Domain rules from `docs/ai/domain-rule-ledger.md` when present.
   - Review/implementation context when present.
   - Verification policy and commands when available.

2. Check blockers before compiling.
   - If `Open blockers` include unresolved business decisions, route to `requirement-grill`.
   - If technical design choices are unresolved, route to `grill-design`.
   - If risk gates require approval, expose them; do not bury them in the agent prompt.

3. Keep evidence status visible.
   - Mark target files/modules as `Verified`, `Supported`, `Hypothesis`, or `Unknown`.
   - Do not invent target files when repo evidence is missing.
   - Use `Human-confirmed` and `Verified` domain rules as constraints.
   - Use `Supported` domain rules as cautions.
   - Use `Hypothesis` domain rules only as questions or warnings.

4. Produce a Work Package.

```text
Work Package:
- Title:
- Goal:
- Why now:
- User/business value:
- Non-goals:
- Target scope:
- Files/modules likely touched:
- Do-not-touch zones:
- Acceptance criteria:
- Verification contract:
- Required review gates:
- Domain rules applied:
- Risk gates:
- Agent prompt:
- Reviewer checklist:
- Open blockers:
```

5. Confirm execution readiness.
   - The package is executable only when `Open blockers` has no unresolved business decisions.
   - Required review gates must include `review-domain-impact` when domain rules or business behavior are involved.

## Output

```text
Work Package:
- Title:
- Goal:
- Why now:
- User/business value:
- Non-goals:
- Target scope:
- Files/modules likely touched:
- Do-not-touch zones:
- Acceptance criteria:
- Verification contract:
- Required review gates:
- Domain rules applied:
- Risk gates:
- Agent prompt:
- Reviewer checklist:
- Open blockers:

Route:
- executable | requirement-grill | grill-design | needs human decision
```

## Exit criteria

- The Work Package is independently executable or explicitly blocked.
- Business assumptions are not converted into implementation scope.
- Verification and review gates are named.
- Domain rules are applied according to evidence status.
- The reviewer can tell what must not be touched.

## Failure modes

| Failure | Correction |
|---|---|
| Making the business decision during packaging | Route back to `requirement-grill`. |
| Hiding risk gates in the prompt | List them in `Risk gates`. |
| Inventing target files | Mark scope as `Hypothesis` or `Unknown`. |
| Skipping domain review | Add `review-domain-impact` when business behavior or domain rules are involved. |
