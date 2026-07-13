---
description: Run the Agent Spectrum Kernel review flow for the current PR, branch diff, or generated output in Codex.
---

Use the repository `AGENTS.md` and projected skills from `.agents/skills`.

Entry intent: review.
Mutation level: read-only unless the user explicitly asks for fixes after the review.
Routing source: use `review-router` to extract observed change signals, map them to required gates, then run only those gates. Do not treat this prompt as a second routing source.

Before extracting signals, read `schemas/review-signal-gate-map.json`. Emit only its exact signal IDs and use its signal-to-gate mapping; do not invent free-form trigger IDs.

Evidence requirements:

- inspect the checked-out workspace, diff, generated output, relevant docs, and verification evidence when available
- record missing diff, context, output, or verification inputs as `insufficient evidence`, never as skipped
- keep current blockers separate from non-blocking improvement candidates
- when the merge claim depends on lifecycle evidence, use stable refs from `docs/lifecycle-traceability-contract.md` and report stale or missing refs as `insufficient evidence`
- use `risk-gate` before any external comment, label, check, metric, notification, deploy, release, or production mutation

Output contract:

Append one shared `Execution Envelope` for the review boundary, following `docs/execution-envelope-contract.md`. Keep review findings and signal/gate summaries in the artifact; do not repeat envelope metadata as separate route sections.

Change signals:
- signal: observed evidence

Required gates:
- gate: reason; triggered by signal(s)

Skipped heavy gates:
- gate/layer: observed reason

Missing evidence:
- input: why it is required and what remains unknown

Decision:
- approve | approve with comments | request changes | block | insufficient evidence

Blocking evidence:
- [severity] gate/file:line - evidence, impact, and required fix or decision

Passed required gates:
- gate - evidence checked

Insufficient evidence:
- gate/input - what remains unknown and the next check

Non-blocking follow-ups:
- improvement-ledger candidate, rule feedback, or suggestion

Residual risk:
- ...

Execution Envelope:
```json
{
  "schema_version": "1.0.0",
  "route": { "work_mode": "レビュー", "operating_mode": "delivery_quality", "user_facing": "...", "internal": { "primary": "review-router" } },
  "evidence_status": { "checked": [], "missing": [] },
  "stop_reason": { "status": "none", "details": [], "human_decision_required": [], "stop_if": [] },
  "next_action": "..."
}
```

Do not publish comments, labels, checks, metrics, or notifications externally unless the user explicitly requested that external action and `risk-gate` approved it.

$ARGUMENTS
