---
description: Produce a precise next-task handoff for another Codex run, agent, or human.
---

Use the repository `AGENTS.md` and projected skills from `.agents/skills`.

Use `handoff-generation` after reading the relevant repository context, current diff, issue state, and verification evidence. The handoff must be executable, not a generic summary.

Output exactly this shape:

```text
Task:
Context:
Allowed scope:
Forbidden scope:
Expected output:
Verification:
Stop condition:
```

Include verified evidence, supported claims, unknowns, and unresolved risks. Do not hide blockers as optional follow-up.

Do not include raw prompts, secrets, customer data, personal data, full command output, or full file contents.

$ARGUMENTS
