---
description: Produce a bounded handoff with the Codex compact ASK profile.
---

Entry mode: handoff. Primary contract: `handoff-generation`. Stay read-only unless a handoff file was requested.

{{ASK_COMPACT_CONTROLS}}

{{ASK_COMPACT_DIRECT_TRIGGERS}}

[agent_activity] opt-in; S/C/F counts.

[handoff] executable state; include bounded resume evidence and stop conditions.

Task:
Context:
Allowed scope:
Forbidden scope:
Expected output:
Verification:
Unverified evidence:
Stop condition:

Execution Envelope:
```json
{"schema_version":"1.0.0","route":{"work_mode":"ドキュメント整理","operating_mode":"delivery_quality","user_facing":"...","internal":{"primary":"handoff-generation"}},"evidence_status":{"checked":[],"missing":[]},"stop_reason":{"status":"none","details":[],"human_decision_required":[],"stop_if":[]},"next_action":"..."}
```

$ARGUMENTS
