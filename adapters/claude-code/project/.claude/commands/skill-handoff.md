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

$ARGUMENTS
