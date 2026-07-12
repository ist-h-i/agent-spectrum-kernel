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

1. Read `docs/lifecycle-artifact-contract.md` and gather the smallest useful evidence. When a later completion, merge, or release claim needs item-level mapping, also use `docs/lifecycle-traceability-contract.md` and assign stable IDs only to the decisions that claim will consume.
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

5. Produce a Requirement Contract that owns only the business decision.

```text
Requirement Contract:
- Artifact ID:
- Artifact type: requirement
- Why the change is needed:
- Business actor:
- Business object:
- Desired outcome:
- Responsibility boundary:
- Policy boundary:
- Success condition:
- Failure condition:

Conditional fields, omit when irrelevant:
- Upstream refs:
- Trace decision IDs:
- Unresolved human decisions:
- Domain-rule constraints:
- Non-goals:
- Evidence status:
```

Do not add behavior, task, verification, or implementation fields. If a prior Requirement Contract exists, reference it and emit only an explicit delta; a Requirement-owned delta requires authoritative business decision evidence.

6. Route next.
   - Use `work-package-compiler` only when required business decisions are resolved.
   - Use `grill-design` when technical decision trees or tradeoffs remain.
   - Use `spec-driven-development` when behavior is clear enough for implementation planning.
   - Use `reject / needs human decision` when the value, owner, policy, or rule choice is still unresolved.
   - Express the next action in work terms for the user; keep skill names in the route/debug fields.

## Output

Use the shared `Execution Envelope` from `docs/execution-envelope-contract.md` for route, evidence, stop reason, and next action. This skill emits the Requirement Contract and decision boundary below; it does not repeat the envelope fields.

```text
Requirement Contract:
- Artifact ID:
- Artifact type: requirement
- Why the change is needed:
- Business actor:
- Business object:
- Desired outcome:
- Responsibility boundary:
- Policy boundary:
- Success condition:
- Failure condition:

Conditional fields, omit when irrelevant:
- Upstream refs:
- Trace decision IDs:
- Unresolved human decisions:
- Domain-rule constraints:
- Non-goals:
- Evidence status:

Deltas, only when changing a referenced Requirement:
- Target ref / field / previous / new / reason / decision evidence:

Decision boundary:
- AI-supported:
- Human decision required:
- Do not compile yet:
```

## Exit criteria

- User decisions, repo facts, domain rules, and AI hypotheses are separated.
- Unresolved business decisions are not converted into implementation scope.
- The next route is explicit and justified by evidence.
- The output is compact enough to feed `work-package-compiler` or another focused skill.
- Unchanged upstream values are referenced, not copied.

## Failure modes

| Failure | Correction |
|---|---|
| Acting as a verification gate | Route verification to review skills. |
| Compiling unresolved assumptions into tasks | Mark `needs human decision`. |
| Asking every possible question | Ask the next material question only. |
| Promoting new rule candidates | Send candidates to `review-to-rule-compiler` or `domain-rule-ledger` with gates. |
