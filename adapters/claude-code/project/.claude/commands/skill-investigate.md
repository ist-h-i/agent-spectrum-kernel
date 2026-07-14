---
description: Investigate a bug, regression, performance issue, or unknown root cause.
---

Use the installed project skills from this repository projection.

Use `/evidence-ledger` for every correctness, readiness, or causal claim.

Start with `/skill-router`, then use `/doubt-driven-development` for root-cause work. Define a Verification Contract with `/test-first-verification` before or alongside the fix path.

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
