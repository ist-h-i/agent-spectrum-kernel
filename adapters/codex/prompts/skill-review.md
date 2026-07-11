---
description: Run the Agent Spectrum Kernel review flow for the current PR, branch diff, or generated output in Codex.
---

Use the repository `AGENTS.md` and projected skills from `.agents/skills`.

Entry intent: review.
Mutation level: read-only unless the user explicitly asks for fixes after the review.
Routing source: use `review-router` to decide applicable review layers, then run only required gates. Do not treat this prompt as a second routing source.

Evidence requirements:

- inspect the checked-out workspace, diff, generated output, relevant docs, and verification evidence when available
- mark affected layers as `insufficient evidence` when required inputs are missing
- keep current blockers separate from non-blocking improvement candidates
- use `risk-gate` before any external comment, label, check, metric, notification, deploy, release, or production mutation

Output contract:

Append one shared `Execution Envelope` for the review boundary, following `docs/execution-envelope-contract.md`. Keep review findings and layer summaries in the artifact; do not repeat envelope metadata as separate route sections.

```text
Decision:
- approve | approve with comments | request changes | block | insufficient evidence

Layer summary:
- Domain: pass | fail | skipped | insufficient evidence - evidence/reason
- Architecture: pass | fail | skipped | insufficient evidence - evidence/reason
- Design: pass | fail | skipped | insufficient evidence - evidence/reason
- Logic: pass | fail | skipped | insufficient evidence - evidence/reason
- Output quality: pass | fail | skipped | insufficient evidence - evidence/reason
- Test / verification: pass | fail | skipped | insufficient evidence - evidence/reason
- Style / maintainability: pass | fail | skipped | insufficient evidence - evidence/reason
- Mechanical: pass | fail | skipped | insufficient evidence - evidence/reason
- Adversarial risk: pass | fail | skipped | insufficient evidence - evidence/reason
- Risk: pass | fail | skipped | insufficient evidence - evidence/reason
- Evidence: pass | fail | skipped | insufficient evidence - evidence/reason

Required fixes:
- [severity] file:line - issue, evidence, required fix

Suggestions:
- ...

Evidence reviewed:
- ...

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
```

Do not publish comments, labels, checks, metrics, or notifications externally unless the user explicitly requested that external action and `risk-gate` approved it.

$ARGUMENTS
