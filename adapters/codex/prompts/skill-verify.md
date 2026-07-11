---
description: Define and run focused verification for a change or readiness claim in Codex.
---

Use the repository `AGENTS.md` and projected skills from `.agents/skills`.

Entry intent: verification.
Mutation level: local test or fixture edits are allowed when they are needed to make the target behavior observable.
Routing source: use `test-first-verification` for the verification contract. Use `evidence-ledger` before any readiness, safety, reliability, correctness, performance, cost, maintainability, or no-regression claim.

Evidence requirements:

- state the behavior to prove and regression to prevent
- identify existing coverage before adding new checks
- run the focused command, broader command, or manual/runtime check that matches the claim
- quote exact command names and outcomes; never invent command output
- state what remains unverified and the exact next check

Output contract:

Append one shared `Execution Envelope` for the verification boundary, following `docs/execution-envelope-contract.md`. Keep the Verification Contract and evidence in the artifact; do not repeat envelope metadata as separate route sections.

```text
Verification Contract:
- Behavior to prove:
- Regression to prevent:
- Existing coverage:
- Commands:
- Evidence required:
- What remains unverified:

Evidence:
- command:
  result:

Not verified:
- ...

Next verification:
- ...

Execution Envelope:
- route:
- evidence status:
- stop reason:
- next action:
```

Do not include raw prompts, secrets, customer data, personal data, full command output, or full file contents.

$ARGUMENTS
