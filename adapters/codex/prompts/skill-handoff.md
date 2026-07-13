---
description: Produce a bounded handoff with the Codex compact ASK profile.
---

Entry mode: handoff. Primary contract: `handoff-generation`. Stay read-only unless a handoff file was requested.

Critical fallback controls:

- [scope] Read the task, workspace/diff, issue state, and evidence needed for the next task.
- [verification] Preserve commands/results and name the next check for each unproved claim.
- [risk_approval] Do not perform destructive, external, production, secret, auth, deploy, publish, release, or notification actions without explicit approval.
- [evidence] Separate facts, support, assumptions, unknowns, risks, and unresolved decisions.
- [missing_evidence] Report unavailable workspace, diff, tests, runtime/load, or verification evidence as insufficient; never infer it.
- [output] Include allowed/forbidden scope, output, verification, stop condition, and one Execution Envelope.

Task:
Context:
Allowed scope:
Forbidden scope:
Expected output:
Verification:
Stop condition:

Execution Envelope:
```json
{"schema_version":"1.0.0","route":{"work_mode":"ドキュメント整理","operating_mode":"delivery_quality","user_facing":"...","internal":{"primary":"handoff-generation"}},"evidence_status":{"checked":[],"missing":[]},"stop_reason":{"status":"none","details":[],"human_decision_required":[],"stop_if":[]},"next_action":"..."}
```

$ARGUMENTS
