---
description: Route and execute a scoped implementation through the Agent Spectrum Kernel.
---

Use the installed project skills from this repository projection.

Apply `ask.claim-evidence-status@1.0.0` inline. Apply `/evidence-ledger` only when its closed trigger selects `formal_ledger` (explicit audit, multiple material claims, high-stakes readiness, cross-artifact synthesis, or stable claim IDs); installation alone is not activation.

Start with `/skill-router` unless the user already named a more specific skill. For behavior changes, apply `ask.verification-proof-policy@1.0.0` through `/test-first-verification`: select `compact_proof` only from complete localized eligibility evidence, otherwise select `formal_verification_contract`. Emit the selected Compact Proof or Verification Contract, then use `/controlled-implementation` for the edit loop.

Keep the change boundary narrow:

- require approval for the specific action and stop without that approval before any risk-gated action
- when required evidence is missing, report `insufficient_evidence` and stop; do not infer the missing result
- do not start or delegate agents unless the request explicitly requires agent activity; report started, completed, and failed counts
- classify the task and risk before editing
- follow `docs/lifecycle-artifact-contract.md`; reference upstream Requirement, Spec, Work Package, and Verification artifacts instead of copying unchanged fields
- read nearby repository patterns first
- consume allowed and forbidden scope from the Work Package, or use the compact path when no package is required
- record changed assumptions, acceptance criteria, scope, or proof obligations as explicit deltas with decision evidence
- use `/risk-gate` before destructive, external, secret, production, auth, dependency, migration, billing, email, or infra-impacting actions
- verify the observable behavior before claiming completion
- reference the selected Compact Proof or Formal Verification Contract from the Implementation Contract without copying unchanged proof fields
- emit exactly one fenced JSON `Execution Envelope` per task boundary using `docs/execution-envelope-contract.md`; keep implementation details in the skill artifact

The Implementation Contract preserves the canonical header (`Artifact ID`, `Artifact type: implementation`, and `Upstream refs`) and records only implementation decisions not fixed upstream, actual change boundary, verification attempts, evidence refs, remaining limitations, handoff state, and any present deviation/discovery/delta.

Do not deploy, publish, release, send notifications, change secrets, or mutate production configuration from this command.

$ARGUMENTS
