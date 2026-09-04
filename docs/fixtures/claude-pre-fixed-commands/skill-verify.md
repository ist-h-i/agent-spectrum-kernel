---
description: Define and run focused verification for a change or readiness claim.
---

Use the installed project skills from this repository projection.

Apply `ask.claim-evidence-status@1.0.0` inline. Apply `/evidence-ledger` only when its closed trigger selects `formal_ledger` (explicit audit, multiple material claims, high-stakes readiness, cross-artifact synthesis, or stable claim IDs); installation alone is not activation.

Use `/test-first-verification`, `ask.verification-proof-policy@1.0.0`, and `docs/lifecycle-artifact-contract.md`. Select exactly one path before implementation claims: `compact_proof` only for fully evidenced localized eligibility, otherwise `formal_verification_contract`. A discovered trigger upgrades Compact Proof to the existing Verification Contract while retaining executed evidence; formal never downgrades.

For `compact_proof`, output only:

```text
Proof:
- Behavior:
- Focused check:
- Result or missing evidence:
- Broader check required when:
```

For `formal_verification_contract`, preserve the existing Verification Contract header (`Artifact ID`, `Artifact type: verification`, and `Upstream refs`) and attach later evidence to the same contract ID. Verification output should include:

- behavior to prove
- upstream refs
- focused checks and required evidence
- insufficient-evidence and completion-claim conditions
- regression, negative, broader, manual/runtime, or measurement obligations only when applicable
- manual/runtime check when automated coverage is unavailable
- evidence from exact commands run
- the selected Compact Proof or Verification Contract ref
- what remains unverified
- one fenced JSON `Execution Envelope` using `docs/execution-envelope-contract.md`

Do not invent command output.

$ARGUMENTS
