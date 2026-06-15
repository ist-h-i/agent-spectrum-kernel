---
name: handoff-generation
description: Create a precise handoff for another agent, reviewer, or future session. Use after implementation, investigation, review, or partial completion.
---

# Handoff Generation

## Goal

Make the next agent or human effective without rereading the entire conversation.

## When to use

Use when:
- work is complete and needs review,
- work is partial and must continue later,
- another agent will implement the next task,
- the user needs a Codex/Cursor/Claude task prompt,
- risk or unverified behavior remains.

## Process

1. Summarize the actual goal, not the chat history.
2. State current status:
   - complete
   - partial
   - blocked
   - needs review
   - needs verification
3. List changed files and why.
4. List verified evidence.
5. List unverified items and why.
6. List assumptions and risks.
7. Create the next task as a narrow instruction.

## Output

```text
Handoff:
- Goal:
- Current state:
- Changed files:
- Verified:
- Not verified:
- Assumptions:
- Risks:
- Important context:
- Next task:
- Stop condition:
```

## Next task format

```text
Task:
Context:
Allowed scope:
Forbidden scope:
Expected output:
Verification:
Do not:
```

## Anti-rationalization

| Excuse | Rebuttal |
|---|---|
| “The diff is self-explanatory.” | Diffs do not explain intent, risk, or unverified behavior. |
| “The next agent can inspect it.” | Make inspection targeted. |
| “I should include everything.” | Handoff should preserve decision-relevant state, not transcript noise. |
