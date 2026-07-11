---
description: Run a scoped implementation through the Agent Spectrum Kernel in Codex.
---

Use the repository `AGENTS.md` and projected skills from `.agents/skills`.

Entry intent: implementation.
Mutation level: local workspace edits are allowed when the task requires them.
Routing source: use `operating-mode-router` when the operating layer is unclear, then use `skill-router` or an explicitly named relevant skill. Do not treat this prompt as a second routing source.

Evidence requirements:

- define allowed and forbidden scope before editing
- read nearby implementation, tests, docs, and scripts before changing behavior
- define the observable verification before or alongside the edit
- use `risk-gate` before destructive, external, secret, production, auth, dependency, migration, billing, email, telemetry, or infrastructure-impacting actions
- use `evidence-ledger` before claims about correctness, readiness, reliability, safety, performance, or no regression

Output contract:

Append one shared `Execution Envelope` for the task boundary, following `docs/execution-envelope-contract.md`. Do not repeat routing, evidence, stop, or next-action metadata in the implementation artifact.

Changed:
- ...

Verified:
- ...

Not verified:
- ...

Risks / assumptions:
- ...

Next:
- ...

Execution Envelope:
```json
{
  "schema_version": "1.0.0",
  "route": { "work_mode": "実装", "operating_mode": "delivery_quality", "user_facing": "...", "internal": { "primary": "controlled-implementation" } },
  "evidence_status": { "checked": [], "missing": [] },
  "stop_reason": { "status": "none", "details": [], "human_decision_required": [], "stop_if": [] },
  "next_action": "..."
}
```

Do not deploy, publish, release, send notifications, change secrets, or mutate production configuration from this prompt.

$ARGUMENTS
