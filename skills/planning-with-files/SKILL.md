---
name: planning-with-files
description: Maintain durable planning state for multi-step or long-running coding tasks. Use when work spans files, sessions, agents, or review cycles.
---

# Planning With Files

## Goal

Make long-running agent work recoverable after context loss.

## Use when

- The task spans many steps.
- Work may continue across sessions.
- Multiple agents or reviewers may touch the work.
- There are many findings, decisions, or partial results.
- Losing context would create risk.

## Do not use when

- A final response is enough to preserve state.
- The repository has a policy against agent planning files and no approved location exists.

## Process

1. Choose the project’s existing planning location if one exists.
   - Prefer existing `docs/`, `planning/`, `.agent/`, or issue/task files.
   - If none exists, propose `.agent/<task-slug>/` or `docs/ai/<task-slug>/`.
   - Do not pollute source directories.

2. Create only necessary files.

```text
task_plan.md       — goal, scope, milestones, task list
findings.md        — verified facts from code/docs/runtime
progress.md        — completed, current, blocked, next
decision_log.md    — decisions, rationale, date, owner/agent
verification.md    — commands, outputs, remaining checks
handoff.md         — next task and residual risk
```

3. Keep files terse and factual.
   - No essay.
   - No chat transcript dump.
   - No unsupported claims.
   - Link or cite evidence where possible.

4. Update state after meaningful changes.
   - Mark completed work.
   - Record new evidence.
   - Record blockers.
   - Preserve next action.

5. Finalize with `handoff-generation` if another agent/human may continue.

## Output

```text
Planning state:
- Location:
- Files created/updated:
- Current milestone:
- Completed:
- Blocked:
- Next:
```

## Exit criteria

- A future agent can recover goal, scope, status, evidence, and next action.
- Planning files contain decision-relevant state only.
- The repository is not polluted with redundant documents.

## Failure modes

| Failure | Correction |
|---|---|
| Relying on chat history | Persist durable state when context loss matters. |
| Writing a plan encyclopedia | Keep only decision-relevant state. |
| Updating only at the end | Update after meaningful decisions and evidence. |
