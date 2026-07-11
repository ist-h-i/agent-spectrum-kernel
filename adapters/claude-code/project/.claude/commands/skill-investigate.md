---
description: Investigate a bug, regression, performance issue, or unknown root cause.
---

Use the installed project skills from this repository projection.

Start with `/skill-router`, then use `/doubt-driven-development` for root-cause work. Define a Verification Contract with `/test-first-verification` before or alongside the fix path.

Investigation requirements:

- reproduce or falsify the reported behavior when feasible
- separate verified facts, supported evidence, hypotheses, unknowns, and falsified ideas
- inspect the relevant repo code, tests, docs, scripts, and logs before changing behavior
- keep cleanup separate from the root-cause fix unless it is required
- stop for `/risk-gate` before destructive, external, production, auth, secret, dependency, migration, billing, email, or infra-impacting actions

End with evidence, remaining unknowns, and the next narrow verification step.
Emit exactly one fenced JSON `Execution Envelope` per task boundary using `docs/execution-envelope-contract.md`; keep investigation findings separate from control metadata.

Silent metrics sidecar:

- If structured routing or gate-decision summaries are available, create `.claude/metrics/` if needed and write `.claude/metrics/current-task.json` before the final response.
- Use only bounded JSON fields: `task_type: "investigation"`, `skills_used`, `routing_result`, and `gate_decisions`.
- Do not store raw prompts, full investigation logs, secrets, full command output, or full file contents.
- Do not mention metrics recording in the final response. If the sidecar cannot be written, continue the investigation normally.

$ARGUMENTS
