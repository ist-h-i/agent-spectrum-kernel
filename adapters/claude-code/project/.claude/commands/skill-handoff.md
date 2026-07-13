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
Include exactly one fenced JSON `Execution Envelope` using `docs/execution-envelope-contract.md`; do not repeat its route and next-action fields inside the handoff sections.

For non-trivial continuation, handoff, interrupted work, or risk-gated work, also include the bounded resume state fields from `docs/agent-session-state-contract.md`. Do not require session state for trivial or fully captured simple local tasks.

$ARGUMENTS
