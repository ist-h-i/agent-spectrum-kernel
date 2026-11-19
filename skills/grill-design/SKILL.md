---
name: grill-design
description: Stress-test a plan or design before implementation. Use when the user says "grill me", asks for design critique, or proposes a plan with unresolved decisions.
---

# Grill Design

## Goal

Force shared understanding before implementation by walking the design decision tree deliberately.

## Use when

- The user asks to be grilled.
- Requirements are ambiguous.
- A design decision will shape APIs, data, state, workflows, or tests.
- The failure modes are not yet explicit.
- The implementation path depends on unresolved tradeoffs.

## Do not use when

- The task is a trivial edit.
- The plan is already specified with acceptance criteria and verification.

## Process

1. Convert intent into a falsifiable outcome.

```text
Outcome:
Must remain true:
Failure condition:
```

2. Walk the decision tree.

Check only branches relevant to the task:
- user/product behavior,
- data model,
- API/interface,
- state management,
- error handling,
- migration/backward compatibility,
- security/privacy,
- performance,
- observability,
- testability,
- rollout/rollback.

3. For each material question:
- ask one question at a time,
- explain why it matters,
- provide the recommended answer,
- state the tradeoff,
- wait only if the answer materially changes the plan.

When an adopted project has competing state owners, compatibility contracts or deployable slices that users can distinguish, or the user explicitly requests this strategy, compare the proposed owners and their consumers at the same distinguishing scenario. Pick the least costly adequate mechanism, including keeping the current structure; a mock-friendly class or a new service alone is not a reason to split. State which observation would rule out the chosen design and which work should wait for it. Use the selected `spec-driven-development` capability’s `references/decision-led-test-strategy.md` before choosing the boundary, even when the user did not name the method.

4. If the repository can answer the question, inspect the repository instead of asking.

5. Stop when the implementation boundary and acceptance criteria are clear.

## Output

```text
Design decision summary:
- Goal:
- Non-goals:
- Decisions:
- Recommended unresolved decisions:
- Constraints:
- Open questions:
- Acceptance criteria:
- Implementation boundary:
- Verification plan:
```

## Exit criteria

- Key design branches have been considered.
- User decisions are separated from repository facts.
- Open questions are explicit and minimal.
- Implementation can start without encoding hidden assumptions.

## Failure modes

| Failure | Correction |
|---|---|
| Asking all questions at once | Ask the next material question only. |
| Treating “reasonable” as sufficient | Name failure modes and acceptance criteria. |
| Asking the user what the repo can answer | Inspect the repo. |
| Designing past the need | Stop at the smallest implementation boundary. |
