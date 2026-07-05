---
description: Define and run focused verification for a change or readiness claim in Codex.
---

Use the repository `AGENTS.md` and projected skills from `.agents/skills`.

Use `test-first-verification` to define the Verification Contract before claiming behavior is correct, fixed, ready, safe, reliable, faster, or regression-free.

Verification output should include:

- behavior to prove
- regression to prevent
- existing coverage
- focused test or validation command
- manual/runtime check when automated coverage is unavailable
- evidence from exact commands run
- what remains unverified

Use `evidence-ledger` when the result includes correctness, readiness, reliability, safety, performance, cost, maintainability, or no-regression claims.

Never invent command output. If a command was not run, say it was not run and provide the exact next command.

Do not include raw prompts, secrets, customer data, personal data, full command output, or full file contents.

$ARGUMENTS
