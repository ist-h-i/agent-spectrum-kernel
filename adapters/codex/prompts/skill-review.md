---
description: Review a diff or output with the Codex compact ASK profile.
---

Entry mode is fixed to review. Primary contract: `review-router`. Read `schemas/review-signal-gate-map.json`, emit exact signal IDs, and run only gates triggered by observed signals.

Critical fallback controls:

- [scope] Stay read-only unless fixes were explicitly requested; inspect the workspace, diff/output, nearby contracts, and relevant tests.
- [verification] Treat missing diff, context, output, tests, or lifecycle refs as insufficient evidence, not a skipped gate.
- [risk_approval] Stop before any external comment, label, check, metric, notification, deploy, release, production, secret, auth, or destructive action without explicit approval.
- [evidence] Put actionable blockers first with gate/file:line evidence and keep improvement candidates non-blocking.
- [missing_evidence] Do not infer runtime Skill loading, executed checks, mergeability, correctness, or no regression.
- [output] Record signal-to-gate mapping, required gate evidence, final decision, residual risk, and one shared Execution Envelope.

Change signals:
- signal: observed evidence

Required gates:
- gate: reason; triggered by signal(s)

Skipped heavy gates:
- gate/layer: observed reason

Missing evidence:
- input: impact and next check

Decision:
- approve | approve with comments | request changes | block | insufficient evidence

Blocking evidence:
- [severity] gate/file:line - evidence, impact, required fix

Passed required gates:
- gate - evidence checked

Insufficient evidence:
- gate/input - unknown and next check

Non-blocking follow-ups:
- ...

Residual risk:
- ...

Execution Envelope:
```json
{"schema_version":"1.0.0","route":{"work_mode":"レビュー","operating_mode":"delivery_quality","user_facing":"...","internal":{"primary":"review-router"}},"evidence_status":{"checked":[],"missing":[]},"stop_reason":{"status":"none","details":[],"human_decision_required":[],"stop_if":[]},"next_action":"..."}
```

$ARGUMENTS
