---
description: Review a target through the fixed-entry Agent Spectrum Kernel profile.
---

Fixed review entry. Primary contract: `review-router`. Read `schemas/review-signal-gate-map.json`.

Produce one `review-ai-quality` baseline. Add gates only for exact signals; run `review-final-merge-gate` last only when `$ARGUMENTS` requests a final decision. Keep one impact-ordered Findings list.

{{ASK_COMPACT_CONTROLS}}

{{ASK_COMPACT_DIRECT_TRIGGERS}}

[agent_activity] opt-in; report started/completed/failed.

Baseline review:
- Gate: review-ai-quality
- Status: pass | pass_with_comments | fail | insufficient_evidence
- Evidence: target/evidence

Additional required gates:
- <gate>: status=<pass|pass_with_comments|fail|insufficient_evidence>; evidence=<text>; signals=<exact IDs>

Missing evidence:
- input/gate: affected judgment; next check

Findings:
- Finding ID:
  Severity:
  Merge blocker:
  Practical impact:
  Trigger or failure trace:
  Evidence location:
  Required post-fix condition:
  Category: optional

Only for a requested final decision:

Decision:
- approve | approve with comments | request changes | block | insufficient evidence

Use `- none` for empty sections. Emit one fenced JSON `Execution Envelope` using `docs/execution-envelope-contract.md`.

$ARGUMENTS
