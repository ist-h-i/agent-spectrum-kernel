---
name: grill-design
description: Stress-test a plan or design before implementation. Use when the user says "grill me", asks for design critique, or proposes a plan with unresolved decisions.
---

# Grill Design

## Goal

Force shared understanding before implementation by walking the decision tree deliberately.

## Non-goal

Do not turn a trivial edit into a design ceremony.

## Process

1. Restate the target as a falsifiable outcome:
   - What must become true?
   - What must remain true?
   - What would make this plan fail?

2. Identify the decision tree:
   - product behavior
   - data model
   - API or interface
   - state management
   - error handling
   - migration/backward compatibility
   - security/privacy
   - performance
   - observability
   - testability
   - rollout/rollback

3. Ask one question at a time.

For each question:
- Explain why this decision matters.
- Provide your recommended answer.
- State the tradeoff.
- Wait for the user when the answer materially changes the plan.

4. If the question can be answered from the codebase, inspect the codebase instead of asking.

5. Stop only when:
   - key decisions are resolved,
   - open questions are explicit,
   - constraints are clear,
   - acceptance criteria are testable,
   - implementation boundary is narrow.

## Output

```text
Design decision summary:
- Goal:
- Non-goals:
- Decisions:
- Constraints:
- Open questions:
- Acceptance criteria:
- Implementation boundary:
- Verification plan:
```

## Anti-rationalization

| Excuse | Rebuttal |
|---|---|
| “The plan sounds reasonable.” | Reasonable is not enough. Resolve failure modes. |
| “We can decide during implementation.” | Late decisions leak into code structure. |
| “The user can answer everything.” | If the repo can answer it, inspect the repo. |
| “Ask all questions at once.” | One question at a time prevents shallow agreement. |
