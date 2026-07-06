---
name: requirement-grill
description: Turn vague business intent into a Requirement Contract while preserving human decision boundaries and evidence status.
---

# Requirement Grill

## Goal

Clarify vague user intent before implementation, design stress testing, or work package compilation.

This is decision support. It may recommend a decision, but unresolved value, priority, workflow, or business-rule decisions remain human decisions.

## Use when

- The business meaning, success condition, user intent, affected workflow, or domain rule impact is unclear.
- The next step might be `work-package-compiler`, `grill-design`, or `spec-driven-development`, but the decision boundary is not stable.
- A request could reduce manual steps but might shift responsibility, approval, or correction burden.
- `docs/ai/domain-rule-ledger.md` exists and should constrain or question requirement definition.

## Do not use when

- The requirement is already confirmed and ready for implementation planning.
- The user asks for technical design stress testing only. Use `grill-design`.
- The user asks for implementation planning from a stable requirement. Use `spec-driven-development`.
- A required business decision is unresolved and the task is to produce an executable implementation package.

## Process

1. Gather the smallest useful evidence.
   - Current user request, issue, approved spec, or discussion.
   - Existing docs, ADRs, tests, or repo behavior when relevant.
   - `docs/ai/domain-rule-ledger.md` when present.

2. Separate evidence lanes.
   - User decisions or stated intent.
   - Verified repo facts.
   - Human-confirmed or verified domain rules.
   - Supported or hypothesis domain rules.
   - AI hypotheses.

3. Use domain rules safely.
   - `Human-confirmed` and `Verified` rules are constraints.
   - `Supported` rules produce caution and follow-up checks.
   - `Hypothesis` rules produce questions only.
   - `Contradicted` or stale rules require human/domain-owner decision before use as constraints.

4. Ask only the next material question when blocked.
   - Do not ask broad question dumps.
   - Do not ask for facts that the repo or docs can answer.
   - If progress is possible, state the reversible assumption and keep it out of durable contracts.

5. Produce a Requirement Contract.

```text
Requirement Contract:
- User intent:
- Business object:
- Business actor:
- Desired business outcome:
- Current pain:
- Success condition:
- Failure condition:
- Non-goals:
- Domain rules referenced:
- New domain rule candidates:
- Ambiguities:
- Recommended decision:
- Evidence status:
- Route next:
  - work-package-compiler
  - grill-design
  - spec-driven-development
  - reject / needs human decision
```

6. Route next.
   - Use `work-package-compiler` only when required business decisions are resolved.
   - Use `grill-design` when technical decision trees or tradeoffs remain.
   - Use `spec-driven-development` when behavior is clear enough for implementation planning.
   - Use `reject / needs human decision` when the value, owner, policy, or rule choice is still unresolved.
   - Express the next action in work terms for the user; keep skill names in the route/debug fields.

## Output

```text
Selected work mode:
- 要件確認

User-facing route:
- What can be decided from evidence, what remains a human decision, and whether the work can proceed to packaging or design refinement.

Requirement Contract:
- User intent:
- Business object:
- Business actor:
- Desired business outcome:
- Current pain:
- Success condition:
- Failure condition:
- Non-goals:
- Domain rules referenced:
- New domain rule candidates:
- Ambiguities:
- Recommended decision:
- Evidence status:
- Route next:

Internal route:
- Primary: requirement-grill
- Secondary:
- Next if resolved:
- Stop if:

Decision boundary:
- AI-supported:
- Human decision required:
- Do not compile yet:

Route confidence:
- high | medium | low

Evidence checked:
- ...

Missing evidence:
- ...

Next action:
- proceed to implementation packaging | refine requirement | refine technical design | stop for human decision | no further action needed
```

## Exit criteria

- User decisions, repo facts, domain rules, and AI hypotheses are separated.
- Unresolved business decisions are not converted into implementation scope.
- The next route is explicit and justified by evidence.
- The output is compact enough to feed `work-package-compiler` or another focused skill.

## Failure modes

| Failure | Correction |
|---|---|
| Acting as a verification gate | Route verification to review skills. |
| Compiling unresolved assumptions into tasks | Mark `needs human decision`. |
| Asking every possible question | Ask the next material question only. |
| Promoting new rule candidates | Send candidates to `review-to-rule-compiler` or `domain-rule-ledger` with gates. |
