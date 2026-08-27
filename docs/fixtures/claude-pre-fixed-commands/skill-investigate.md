---
description: Investigate a bug, regression, performance issue, or unknown root cause.
---

Use the installed project skills from this repository projection.

Apply `ask.claim-evidence-status@1.0.0` inline. Apply `/evidence-ledger` only when its closed trigger selects `formal_ledger` (explicit audit, multiple material claims, high-stakes readiness, cross-artifact synthesis, or stable claim IDs); installation alone is not activation.

Start with `/skill-router`, then use `/doubt-driven-development` for root-cause work. Apply `ask.verification-proof-policy@1.0.0` through `/test-first-verification`; bug reproduction/regression selects `formal_verification_contract`, never a downgrade to `compact_proof`. Define the existing Verification Contract before or alongside the fix path and retain earlier evidence on upgrade.

Investigation requirements:

- require approval for the specific action and stop without that approval before any risk-gated action
- when required evidence is missing, report `insufficient_evidence` and stop; do not infer the missing result
- do not start or delegate agents unless the request explicitly requires agent activity; report started, completed, and failed counts
- reproduce or falsify the reported behavior when feasible
- separate verified facts, supported evidence, hypotheses, unknowns, and falsified ideas
- inspect the relevant repo code, tests, docs, scripts, and logs before changing behavior
- keep cleanup separate from the root-cause fix unless it is required
- stop for `/risk-gate` before destructive, external, production, auth, secret, dependency, migration, billing, email, or infra-impacting actions

End with evidence, remaining unknowns, and the next narrow verification step.
Emit exactly one fenced JSON `Execution Envelope` per task boundary using `docs/execution-envelope-contract.md`; keep investigation findings separate from control metadata.

$ARGUMENTS
