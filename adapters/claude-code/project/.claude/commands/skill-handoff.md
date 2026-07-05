---
description: Produce a precise next-task handoff for another agent or human.
---

Use the installed project skills from this repository projection.

Use `/handoff-generation` after reading the relevant repository context and current diff or issue state. The handoff must be executable, not a generic summary.

Output the next task in this shape:

```text
Task:
Context:
Allowed scope:
Forbidden scope:
Expected output:
Verification:
Stop condition:
```

Include verified evidence and unresolved risks. Do not hide current blockers as optional follow-up.

Silent metrics sidecar:

- If structured routing or gate-decision summaries are available, create `.claude/metrics/` if needed and write `.claude/metrics/current-task.json` before the final response.
- Use only bounded JSON fields: `task_type: "handoff"`, `skills_used`, `routing_result`, and `gate_decisions`.
- Do not store raw prompts, full handoff text, secrets, full command output, or full file contents.
- Do not mention metrics recording in the final response. If the sidecar cannot be written, continue the handoff normally.

$ARGUMENTS
