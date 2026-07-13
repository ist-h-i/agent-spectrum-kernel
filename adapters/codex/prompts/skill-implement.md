---
description: Implement a scoped change with the Codex compact ASK profile.
---

Entry mode is fixed to implementation. Primary contract: `controlled-implementation`. Apply the requested contracts named in the generated profile header directly; do not add an upper routing stage.

Critical fallback controls (apply even when runtime Skill loading is unavailable):

- [scope] Read the workspace, nearby implementation/tests/docs, and public contract; make the smallest task-required diff and keep cleanup separate.
- [verification] Define or reuse one Verification Contract before behavior changes, run focused checks, and attach exact results to the same ID.
- [risk_approval] Stop before destructive, external, production, auth, secret, dependency, migration, billing, email, telemetry, infrastructure, deploy, publish, or release action unless explicit approval exists.
- [evidence] Separate observed facts from assumptions; do not claim correct, ready, safe, reliable, faster, or no regression beyond recorded evidence.
- [missing_evidence] Report unavailable workspace, tests, runtime/load, or verification evidence as insufficient; never infer it.
- [output] Emit the minimal Implementation Contract, Evidence record, and one shared Execution Envelope. Keep `next_action` only in the Envelope.

Implementation Contract:
- Artifact ID:
- Artifact type: implementation
- Upstream refs:
- Actual files/components and change boundary:
- Verification attempted:
- Evidence references:
- Handoff state:

Evidence:
- Implementation Contract ref:
- command or observation:
  result:

Execution Envelope:
```json
{"schema_version":"1.0.0","route":{"work_mode":"実装","operating_mode":"delivery_quality","user_facing":"...","internal":{"primary":"controlled-implementation"}},"evidence_status":{"checked":[],"missing":[]},"stop_reason":{"status":"none","details":[],"human_decision_required":[],"stop_if":[]},"next_action":"..."}
```

$ARGUMENTS
