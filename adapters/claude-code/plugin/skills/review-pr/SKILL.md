---
description: Run the Agent Spectrum Kernel PR review flow through one baseline semantic review, exact-signal additional gates, and an optional final merge decision.
---

# Review PR

Use the bundled Agent Spectrum Kernel review model. Read ${CLAUDE_PLUGIN_ROOT}/contracts/review-signal-gate-map.json, ${CLAUDE_PLUGIN_ROOT}/contracts/claim-evidence-status-contract.md, ${CLAUDE_PLUGIN_ROOT}/schemas/claim-evidence-status.schema.json, and ${CLAUDE_PLUGIN_ROOT}/contracts/execution-envelope-contract.md. Do not substitute host repository policy for the bundled plugin contracts.

Apply ask.claim-evidence-status@1.0.0 inline. Apply /ai-skills:evidence-ledger only when its closed trigger selects formal_ledger. A requested final merge decision activates high_stakes_readiness; capability availability alone does not.

Process:

1. Start with review-router.
2. Produce exactly one review-ai-quality baseline result for the evaluative target. The baseline needs no signal and is never over-processing.
3. Emit only exact bundled registry signal IDs and run only mapped additional gates.
4. Keep missing applicable target, diff, contract, test, output, context, or CI evidence as insufficient_evidence.
5. Compile one impact-ordered finding inventory using the bundled registry's closed fields.
6. Run review-final-merge-gate last only when $ARGUMENTS explicitly asks for a final merge decision.
7. Use stable lifecycle refs from the bundled traceability contract when a merge claim depends on them.
8. Validate legacy claim-status input with ${CLAUDE_PLUGIN_ROOT}/scripts/claim-evidence-status.mjs; never infer a stronger status.
9. Do not start or delegate agents unless the request explicitly requires agent activity. Report started, completed, and failed counts when agent activity occurs.

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

Append Decision only when final merge judgment was requested:

Decision:
- approve | approve with comments | request changes | block | insufficient evidence

Use - none for empty Additional required gates, Missing evidence, or Findings. Do not emit Skipped heavy gates, empty category sections, or full applicability diagnostics unless debug output was explicitly requested.

Emit exactly one fenced JSON `Execution Envelope` from ${CLAUDE_PLUGIN_ROOT}/contracts/execution-envelope-contract.md, with the literal Execution Envelope: heading immediately before the JSON fence. Do not merge, deploy, publish, or mutate production configuration.

$ARGUMENTS
