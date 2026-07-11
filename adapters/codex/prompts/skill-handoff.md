---
description: Produce a precise next-task handoff for another Codex run, agent, or human.
---

Use the repository `AGENTS.md` and projected skills from `.agents/skills`.

Entry intent: handoff.
Mutation level: read-only unless the user explicitly asks you to write the handoff artifact to disk.
Routing source: use `handoff-generation` after reading the relevant repository context, current diff, issue state, and verification evidence.

Evidence requirements:

- distinguish verified evidence, supported claims, assumptions, unknowns, and unresolved risks
- include allowed scope, forbidden scope, expected output, verification, and stop condition
- make the next task executable rather than generic
- include bounded resume-state fields for non-trivial continuation, interrupted work, or risk-gated work when useful

Output contract:

Append one shared `Execution Envelope` for the handoff boundary, following `docs/execution-envelope-contract.md`. Keep the next-task handoff and bounded resume state in the artifact; do not repeat envelope metadata as separate route sections.

```text
Task:
Context:
Allowed scope:
Forbidden scope:
Expected output:
Verification:
Stop condition:

Execution Envelope:
- route:
- evidence status:
- stop reason:
- next action:
```

Do not include raw prompts, secrets, customer data, personal data, full command output, or full file contents.

$ARGUMENTS
