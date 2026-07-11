---
description: Run the Agent Spectrum Kernel review flow for the current PR or diff.
---

Use the installed project skills from this repository projection.

Start with `/review-router` to extract observed change signals and map them to required gates. Run only the required gates. End with `/review-final-merge-gate` style output:

Before extracting signals, read `schemas/review-signal-gate-map.json`. Emit only its exact signal IDs and use its signal-to-gate mapping; do not invent free-form trigger IDs.

- decision: `approve`, `approve with comments`, `request changes`, `block`, or `insufficient evidence`
- blocking evidence
- passed required gates
- insufficient evidence
- non-blocking follow-ups
- residual risk
- one fenced JSON `Execution Envelope` using `docs/execution-envelope-contract.md`

Keep current-PR blockers separate from non-blocking improvement-ledger candidates and suggestions. Do not publish metrics externally.

Normal review route:

Change signals:
- signal: observed evidence

Required gates:
- gate: reason; triggered by signal(s)

Skipped heavy gates:
- gate/layer: observed reason

Missing evidence:
- input: why it is required and what remains unknown

Do not emit a fixed layer-by-layer applicability table unless validation or debugging explicitly requests the diagnostic artifact.

Silent metrics sidecar:

- If structured routing, review, or gate-decision summaries are available, create `.claude/metrics/` if needed and write `.claude/metrics/current-task.json` before the final response.
- Use only bounded JSON fields: `task_type: "review"`, `skills_used`, `routing_result`, `review_result`, and `gate_decisions`.
- Do not store raw prompts, full review text, secrets, full command output, or full file contents.
- Do not mention metrics recording in the final response. If the sidecar cannot be written, continue the review normally.

$ARGUMENTS
