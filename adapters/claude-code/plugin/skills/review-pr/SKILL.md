---
description: Run the Agent Spectrum Kernel PR review flow through review-router and final merge gate.
---

# Review PR

Use the core Agent Spectrum Kernel review model.

Before reviewing, read the bundled canonical contract at `${CLAUDE_PLUGIN_ROOT}/contracts/execution-envelope-contract.md` and the bundled schemas at `${CLAUDE_PLUGIN_ROOT}/schemas/`. The plugin package is self-contained; do not substitute a host repository document.

Process:

1. Start with `review-router` to extract observed change signals and map them to required gates.
2. Run only required gates.
3. Include code-health review only when maintainability, debt, repeated finding, validation-check, or refactor-candidate risk is applicable.
4. Keep current-PR blockers in Blocking evidence; use Required fixes only for detailed fix entries.
5. Put non-blocking follow-up under Non-blocking follow-ups and separate improvement-ledger candidates when applicable.
6. End with `review-final-merge-gate` style output.

Normal routing artifact:

Change signals:
- signal: observed evidence

Required gates:
- gate: reason; triggered by signal(s)

Skipped heavy gates:
- gate/layer: observed reason

Missing evidence:
- input: why it is required and what remains unknown

Do not emit a fixed layer-by-layer applicability table unless validation or debugging explicitly requests the diagnostic artifact.

Output contract:

- Decision: approve | approve with comments | request changes | block | insufficient evidence
- Blocking evidence
- Passed required gates
- Insufficient evidence
- Non-blocking follow-ups
- Residual risk
- exactly one fenced JSON `Execution Envelope` using `${CLAUDE_PLUGIN_ROOT}/contracts/execution-envelope-contract.md`; the serialized output must contain the literal `Execution Envelope:` heading immediately before the JSON fence

Do not merge, deploy, publish, or mutate production configuration.

$ARGUMENTS
