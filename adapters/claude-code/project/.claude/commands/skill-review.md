---
description: Run the Agent Spectrum Kernel review flow for the current PR or diff.
---

Use the installed project skills from this repository projection.

Start with `/review-router` to extract observed change signals and map them to required gates. Run only the required gates. End with `/review-final-merge-gate` style output:

- require approval for the specific action and stop without that approval before any risk-gated action
- when required evidence is missing, report `insufficient_evidence` and stop; do not infer the missing result
- do not start or delegate agents unless the request explicitly requires agent activity; report started, completed, and failed counts

Before extracting signals, read `schemas/review-signal-gate-map.json`. Emit only its exact signal IDs and use its signal-to-gate mapping; do not invent free-form trigger IDs.

- decision: `approve`, `approve with comments`, `request changes`, `block`, or `insufficient evidence`
- blocking evidence
- passed required gates
- insufficient evidence
- non-blocking follow-ups
- residual risk
- one fenced JSON `Execution Envelope` using `docs/execution-envelope-contract.md`

When the merge claim depends on lifecycle evidence, use stable refs from `docs/lifecycle-traceability-contract.md`; do not copy acceptance, evidence, blocker, or accepted-risk content into another lifecycle section.

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

$ARGUMENTS
