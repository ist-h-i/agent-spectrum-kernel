---
description: Run the Agent Spectrum Kernel review flow for the current PR or diff.
---

Use the installed project skills from this repository projection.

Start with `/review-router` to decide applicable review layers. Run only the required gates. End with `/review-final-merge-gate` style output:

- decision: `approve`, `approve with comments`, `request changes`, `block`, or `insufficient evidence`
- layer summary
- required fixes
- suggestions
- improvement-ledger candidates when applicable
- evidence reviewed
- residual risk
- one shared `Execution Envelope` using `docs/execution-envelope-contract.md`

Keep current-PR blockers separate from non-blocking improvement-ledger candidates. Do not publish metrics externally.

Silent metrics sidecar:

- If structured routing, review, or gate-decision summaries are available, create `.claude/metrics/` if needed and write `.claude/metrics/current-task.json` before the final response.
- Use only bounded JSON fields: `task_type: "review"`, `skills_used`, `routing_result`, `review_result`, and `gate_decisions`.
- Do not store raw prompts, full review text, secrets, full command output, or full file contents.
- Do not mention metrics recording in the final response. If the sidecar cannot be written, continue the review normally.

$ARGUMENTS
