---
description: Review a diff or output with the Codex compact ASK profile.
---

Entry mode is fixed to review. Primary contract: `review-router`. Read `schemas/review-signal-gate-map.json`, emit exact signal IDs, and run only gates triggered by observed signals.

{{ASK_COMPACT_CONTROLS}}

{{ASK_COMPACT_DIRECT_TRIGGERS}}

[agent_activity] opt-in; S/C/F counts.

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

$ARGUMENTS
