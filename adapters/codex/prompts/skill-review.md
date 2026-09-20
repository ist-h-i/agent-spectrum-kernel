---
description: Review a diff or output with the Codex compact ASK profile.
---

Review entry. Primary contract: `review-router`. Read schemas/review-signal-gate-map.json.

Produce exactly one review-ai-quality baseline result. It is signal-independent. Select additional gates only for exact observed signal IDs. Run review-final-merge-gate last only when runner-required.
Use one impact-ordered Findings inventory with the listed fields.

{{ASK_COMPACT_CONTROLS}}

{{ASK_COMPACT_DIRECT_TRIGGERS}}

[agent_activity] opt-in; S/C/F counts.

Baseline review:
- Gate: review-ai-quality
- Status: pass | pass_with_comments | fail | insufficient_evidence
- Evidence: target/evidence

Additional required gates:
- <gate>: status=<pass|pass_with_comments|fail|insufficient_evidence>; evidence=<text>; signals=<exact IDs>

Missing evidence:
- {"gate_id":"<exact insufficient_evidence gate>","missing_input":"<non-empty missing input>","affected_judgment":"<non-empty affected judgment>","next_check":"<non-empty next check>"}

Findings:
- Finding ID:
  Severity:
  Merge blocker:
  Practical impact:
  Trigger or failure trace:
  Evidence location:
  Required post-fix condition:
  Category: optional

Only when review-final-merge-gate is runner-required, append:

Decision:
- approve | approve with comments | request changes | block | insufficient evidence

Missing evidence is canonical closed JSONL: one exact four-field record per `insufficient_evidence` gate in gate order; no others; `- none` iff no gate is insufficient. Reject missing/extra fields and unknown/duplicate/unmatched/partial gate IDs. Use - none for other empty sections. Omit skipped gates, empty categories, and applicability diagnostics unless explicitly requested.

$ARGUMENTS
