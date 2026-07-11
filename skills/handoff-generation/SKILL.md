---
name: handoff-generation
description: Create a precise handoff for another agent, reviewer, or future session. Use after implementation, investigation, review, partial completion, or when generating a Codex/Cursor/Claude task prompt.
---

# Handoff Generation

## Goal

Make the next agent or human effective without rereading the entire conversation.

## Use when

- Work is complete and needs review.
- Work is partial and must continue later.
- Another agent will implement the next task.
- The user needs a precise coding-agent prompt.
- Risk, assumptions, or unverified behavior remains.

## Do not use when

- The task is trivial and the final response fully captures state.

## Process

1. Summarize the actual goal, not the chat history.

2. State current status.

```text
Status: complete | partial | blocked | needs review | needs verification
```

3. List changed or relevant files and why.

4. List verified evidence.

5. List unverified items and why.

6. List assumptions and risks.

7. Create the next task as a narrow instruction with allowed/forbidden scope.

8. Include a stop condition so the next agent knows when to pause.

9. For handoff, non-trivial continuation, interrupted work, or risk-gated work, include a resume block compatible with `docs/agent-session-state-contract.md`. The resume state must keep `execution_envelope` as the only route/evidence/stop/next-action control record. Do not create session state for trivial tasks where the final response already fully captures the state.

## Output

Use the shared `Execution Envelope` from `docs/execution-envelope-contract.md`. Emit it once as fenced JSON and keep detailed proof, assumptions, and resume context in the handoff artifact without duplicating envelope fields.

```text
Handoff:
- Goal:
- Current state:
- Changed/relevant files:
- Verified:
- Not verified:
- Assumptions:
- Risks:
- Important context:
- Next task:
- Stop condition:
- Resume state: optional; include only for handoff, non-trivial continuation, interrupted work, or risk-gated work. Omit for trivial or fully captured simple tasks.
  - task_intent:
  - execution_envelope:
  - current_phase:
  - evidence_details:
  - open_assumptions:
  - resume_context:
  - updated_at:
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
Stop condition:
```

## Exit criteria

- The next agent can start without rereading the full conversation.
- The next task is narrow and executable.
- Residual risks and verification gaps are explicit.
- Stop condition prevents uncontrolled continuation.

## Failure modes

| Failure | Correction |
|---|---|
| Handoff repeats chat history | Preserve decision-relevant state only. |
| “Continue from here” task | Write a concrete next task. |
| Unverified items omitted | List them explicitly. |
| No stop condition | Add a clear pause/escalation point. |
