---
description: Define and run focused verification for a change or readiness claim.
---

Use the installed project skills from this repository projection.

Apply `ask.claim-evidence-status@1.0.0` inline. Apply `/evidence-ledger` only when its closed trigger selects `formal_ledger` (explicit audit, multiple material claims, high-stakes readiness, cross-artifact synthesis, or stable claim IDs); installation alone is not activation.

Use `/test-first-verification` and `docs/lifecycle-artifact-contract.md` to define one reusable Verification Contract before claiming a behavior is correct, fixed, ready, safe, reliable, faster, or regression-free. Preserve the canonical header (`Artifact ID`, `Artifact type: verification`, and `Upstream refs`), reference upstream behavior, and attach later evidence to the same contract ID.

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

Do not invent command output.

$ARGUMENTS
