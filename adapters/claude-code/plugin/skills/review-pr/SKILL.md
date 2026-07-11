---
description: Run the Agent Spectrum Kernel PR review flow through review-router and final merge gate.
---

# Review PR

Use the core Agent Spectrum Kernel review model.

Before reviewing, read the bundled canonical contract at `${CLAUDE_PLUGIN_ROOT}/contracts/execution-envelope-contract.md` and the bundled schemas at `${CLAUDE_PLUGIN_ROOT}/schemas/`. The plugin package is self-contained; do not substitute a host repository document.

Process:

1. Start with `review-router` to determine applicable layers.
2. Run only required gates.
3. Include code-health review only when maintainability, debt, repeated finding, validation-check, or refactor-candidate risk is applicable.
4. Keep current-PR blockers in Required fixes.
5. Put non-blocking follow-up under Improvement ledger candidates.
6. End with `review-final-merge-gate` style output.

Output contract:

- Decision: approve | approve with comments | request changes | block | insufficient evidence
- Layer summary
- Required fixes
- Suggestions
- Improvement ledger candidates when applicable
- Evidence reviewed
- Residual risk
- exactly one fenced JSON `Execution Envelope` using `${CLAUDE_PLUGIN_ROOT}/contracts/execution-envelope-contract.md`; the serialized output must contain the literal `Execution Envelope:` heading immediately before the JSON fence

Do not merge, deploy, publish, or mutate production configuration.

$ARGUMENTS
