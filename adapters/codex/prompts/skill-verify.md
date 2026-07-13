---
description: Verify behavior with the Codex compact ASK profile.
---

Entry mode is fixed to verification. Primary contract: `test-first-verification`. Apply the requested contracts in the generated profile header directly.

Critical fallback controls:

- [scope] Identify the behavior or claim being proved and the existing coverage before adding or changing checks.
- [verification] Define one Verification Contract, run the narrowest relevant focused check, then broader/static/runtime checks proportional to risk.
- [risk_approval] Stop before destructive, external, production, auth, secret, dependency, migration, billing, email, telemetry, infrastructure, deploy, publish, or release action without explicit approval.
- [evidence] Record exact commands/observations and outcomes; scope correctness, readiness, performance, safety, and no-regression claims to that evidence.
- [missing_evidence] Report missing workspace, tests, runtime/load, command results, or verification paths as insufficient; never invent results.
- [output] Emit one Verification Contract, its Evidence record, and one shared Execution Envelope.

Verification Contract:
- Artifact ID:
- Artifact type: verification
- Upstream refs:
- Behavior to prove:
- Focused checks:
- Evidence required:
- Insufficient-evidence conditions:
- Evidence required before completion claim:

Evidence:
- Verification Contract ref:
- command:
  result:

Execution Envelope:
```json
{"schema_version":"1.0.0","route":{"work_mode":"実装","operating_mode":"delivery_quality","user_facing":"...","internal":{"primary":"test-first-verification"}},"evidence_status":{"checked":[],"missing":[]},"stop_reason":{"status":"none","details":[],"human_decision_required":[],"stop_if":[]},"next_action":"..."}
```

$ARGUMENTS
