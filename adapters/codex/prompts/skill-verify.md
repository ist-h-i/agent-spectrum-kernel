---
description: Define and run focused verification for a change or readiness claim in Codex.
---

Use the repository `AGENTS.md` and projected skills from `.agents/skills`.

Entry intent: verification.
Mutation level: local test or fixture edits are allowed when they are needed to make the target behavior observable.
Routing source: use `test-first-verification` for the verification contract. Use `evidence-ledger` before any readiness, safety, reliability, correctness, performance, cost, maintainability, or no-regression claim.

Evidence requirements:

- follow `docs/lifecycle-artifact-contract.md`; reference the Spec, Work Package, or compact change being proved
- state behavior proof obligations and regression obligations when applicable
- identify existing coverage before adding new checks
- run the focused command, broader command, or manual/runtime check that matches the claim
- quote exact command names and outcomes; never invent command output
- state what remains unverified and the exact next check

Output contract:

Append one shared `Execution Envelope` for the verification boundary, following `docs/execution-envelope-contract.md`. Keep the Verification Contract and evidence in the artifact; do not repeat envelope metadata as separate route sections.

Verification Contract:
- Artifact ID:
- Upstream refs:
- Behavior to prove:
- Focused checks:
- Evidence required:
- Insufficient-evidence conditions:
- Evidence required before completion claim:

Conditional fields may be omitted. Add regression, broader, negative, manual/runtime, measurement, merge, or release obligations only when applicable.

Evidence:
- Verification Contract ref:
- command:
  result:
- Insufficient evidence observed, when present:

Execution Envelope:
```json
{
  "schema_version": "1.0.0",
  "route": { "work_mode": "実装", "operating_mode": "delivery_quality", "user_facing": "...", "internal": { "primary": "test-first-verification" } },
  "evidence_status": { "checked": [], "missing": [] },
  "stop_reason": { "status": "none", "details": [], "human_decision_required": [], "stop_if": [] },
  "next_action": "..."
}
```

Do not include raw prompts, secrets, customer data, personal data, full command output, or full file contents.

$ARGUMENTS
