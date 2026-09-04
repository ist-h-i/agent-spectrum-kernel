---
description: Run the Agent Spectrum Kernel review flow for the current PR, diff, or review target.
---

Use the installed project skills from this repository projection.

Apply ask.claim-evidence-status@1.0.0 inline. Apply /evidence-ledger only when its closed trigger selects `formal_ledger`. A requested final merge decision activates `high_stakes_readiness`; installation alone is not activation.

Read schemas/review-signal-gate-map.json before reviewing. It is the single review-policy registry.

1. Start with /review-router.
2. Produce exactly one /review-ai-quality baseline result. The baseline needs no signal and is never over-processing.
3. Extract only exact registry signal IDs and run only the mapped additional gates.
4. Keep missing applicable target, diff, contract, test, output, context, or CI evidence as insufficient_evidence.
5. Use one impact-ordered finding inventory with the registry's closed fields. Category is optional metadata.
6. Run /review-final-merge-gate last only when $ARGUMENTS explicitly asks for a final merge decision.
7. Require approval for the specific action and stop before any risk-gated action without it.
8. Do not start or delegate agents unless the request explicitly requires agent activity. Report started, completed, and failed counts when agent activity occurs.

Normal output:

Baseline review:
- Gate: review-ai-quality
- Status: pass | pass_with_comments | fail | insufficient_evidence
- Evidence: non-empty checked target/evidence

Additional required gates:
- <gate>: status=<pass|pass_with_comments|fail|insufficient_evidence>; evidence=<non-empty text>; signals=<comma-separated exact signal IDs>

Missing evidence:
- input/gate: affected judgment and next check

Findings:
- Finding ID:
  Severity:
  Merge blocker:
  Practical impact:
  Trigger or failure trace:
  Evidence location:
  Required post-fix condition:
  Category: optional

Append Decision only when a final merge decision was requested:

Decision:
- approve | approve with comments | request changes | block | insufficient evidence

Use - none for empty Additional required gates, Missing evidence, or Findings. Do not emit Skipped heavy gates, empty category sections, or full applicability diagnostics unless debug output was explicitly requested.

Use exactly one fenced JSON `Execution Envelope` from docs/execution-envelope-contract.md. When a merge claim depends on lifecycle evidence, use stable refs from docs/lifecycle-traceability-contract.md. Keep current blockers in Findings and separate durable follow-up only after the current judgment.

Do not publish metrics externally.

$ARGUMENTS
