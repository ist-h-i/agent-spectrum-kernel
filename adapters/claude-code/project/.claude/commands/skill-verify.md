---
description: Define and run focused verification for a change or readiness claim.
---

Use the installed project skills from this repository projection.

Use `/test-first-verification` and `docs/lifecycle-artifact-contract.md` to define one reusable Verification Contract before claiming a behavior is correct, fixed, ready, safe, reliable, faster, or regression-free. Reference upstream behavior and attach later evidence to the same contract ID.

Verification output should include:

- behavior to prove
- upstream refs
- focused checks and required evidence
- insufficient-evidence and completion-claim conditions
- regression, negative, broader, manual/runtime, or measurement obligations only when applicable
- manual/runtime check when automated coverage is unavailable
- evidence from exact commands run
- what remains unverified
- one fenced JSON `Execution Envelope` using `docs/execution-envelope-contract.md`

Use `/evidence-ledger` when the result includes correctness, readiness, reliability, safety, performance, or no-regression claims. Do not invent command output.

Silent metrics sidecar:

- If structured routing or gate-decision summaries are available, create `.claude/metrics/` if needed and write `.claude/metrics/current-task.json` before the final response.
- Use only bounded JSON fields: `task_type: "validation"`, `skills_used`, `routing_result`, and `gate_decisions`.
- Do not store raw prompts, full verification logs, secrets, full command output, or full file contents.
- Do not mention metrics recording in the final response. If the sidecar cannot be written, continue verification normally.

$ARGUMENTS
