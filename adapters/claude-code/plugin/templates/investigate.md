---
name: investigate
description: Investigate an unknown cause through the fixed-entry Agent Spectrum Kernel profile.
---

# Investigate

Entry mode is fixed to investigation. Primary contract: `doubt-driven-development`. Apply its semantics directly with `test-first-verification`, `controlled-implementation`, and `risk-gate`. Start read-only.

{{ASK_COMPACT_CONTROLS}}

{{ASK_COMPACT_DIRECT_TRIGGERS}}

[agent_activity] opt-in; report started, completed, and failed counts.

Reproduce or falsify the reported behavior when feasible. A reproduction or regression claim uses `formal_verification_contract`. Separate verified facts, supported evidence, hypotheses, unknowns, and falsified ideas.

Findings:
- ...

Cause:
- ...

Changed:
- ...

Evidence:
- claim, source or command, and exact result

Read `${CLAUDE_PLUGIN_ROOT}/contracts/claim-evidence-status-contract.md` and `${CLAUDE_PLUGIN_ROOT}/schemas/claim-evidence-status.schema.json`. Keep claim status inline unless a closed formal trigger selects `/ai-skills:evidence-ledger`.

Emit exactly one fenced JSON `Execution Envelope` using `${CLAUDE_PLUGIN_ROOT}/contracts/execution-envelope-contract.md`.

$ARGUMENTS
