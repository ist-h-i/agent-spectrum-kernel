---
name: planning-with-files
description: Maintain durable planning state for multi-step or long-running coding tasks. Use when work spans many files, sessions, agents, or review cycles.
---

# Planning With Files

## Goal

Make long-running agent work recoverable after context loss.

## When to use

Use when:
- The task will take multiple steps.
- Work may continue across sessions.
- Several agents or reviewers may touch the work.
- There are many findings, decisions, or partial results.
- Losing context would create risk.

Do not use for short tasks where the final response is sufficient.

## Process

1. Choose the project’s existing planning location if one exists.
   - If none exists, use `.agent/` or `docs/ai/` depending on project norms.
   - Avoid polluting source directories.

2. Create only the files needed:

```text
task_plan.md       — goal, scope, milestones, task list
findings.md        — verified facts from code/docs/runtime
progress.md        — completed, current, blocked, next
decision_log.md    — decisions, rationale, date, owner
verification.md    — commands, outputs, remaining checks
```

3. Keep planning files terse and factual.
   - No essay.
   - No duplicate chat transcript.
   - No unsupported claims.

4. Update planning state after each meaningful change.
   - Mark completed work.
   - Record evidence.
   - Record blockers.
   - Preserve next action.

5. Finalize with handoff if another agent/human may continue.

## Anti-rationalization

| Excuse | Rebuttal |
|---|---|
| “The conversation history is enough.” | Context can be lost. Files persist. |
| “Planning files slow me down.” | Rework from lost context is slower. |
| “I will update them at the end.” | End-only updates miss the decisions that matter. |
