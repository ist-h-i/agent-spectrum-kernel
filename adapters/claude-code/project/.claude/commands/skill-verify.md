---
description: Define and run focused verification for a change or readiness claim.
---

Use the installed project skills from this repository projection.

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

Use `/evidence-ledger` when the result includes correctness, readiness, reliability, safety, performance, or no-regression claims. Do not invent command output.

$ARGUMENTS
