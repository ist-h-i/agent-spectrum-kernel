---
description: Investigate a bug, regression, performance issue, or unknown root cause in Codex.
---

Use the repository `AGENTS.md` and projected skills from `.agents/skills`.

Entry intent: investigation.
Mutation level: start read-only; local edits are allowed only after the cause and verification path are clear.
Routing source: use `operating-mode-router` when the operating layer is unclear, then use `skill-router` or an explicitly named relevant skill. Do not treat this prompt as a second routing source.

Evidence requirements:

- reproduce, falsify, or narrow the reported behavior when feasible
- separate Verified, Supported, Hypothesis, Unknown, and Falsified statements
- inspect relevant code, tests, docs, scripts, and logs before changing behavior
- define the regression proof before or alongside a fix
- keep cleanup separate from the root-cause fix unless required
- use `risk-gate` before destructive, external, production, auth, secret, dependency, migration, billing, email, telemetry, or infrastructure-impacting actions

Output contract:

Append one shared `Execution Envelope` for the task boundary, following `docs/execution-envelope-contract.md`. Do not repeat routing, evidence, stop, or next-action metadata in the investigation artifact.

```text
Findings:
- ...

Cause:
- ...

Changed:
- ...

Verified:
- ...

Unknown / not verified:
- ...

Next:
- ...

Execution Envelope:
```json
{
  "schema_version": "1.0.0",
  "route": { "work_mode": "調査", "operating_mode": "delivery_quality", "user_facing": "...", "internal": { "primary": "doubt-driven-development" } },
  "evidence_status": { "checked": [], "missing": [] },
  "stop_reason": { "status": "none", "details": [], "human_decision_required": [], "stop_if": [] },
  "next_action": "..."
}
```
```

Do not include raw prompts, secrets, customer data, personal data, full command output, or full file contents.

$ARGUMENTS
