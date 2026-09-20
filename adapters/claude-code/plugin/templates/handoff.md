---
name: handoff
description: Produce a precise next-task handoff through the fixed-entry Agent Spectrum Kernel profile.
---

# Handoff

Entry mode is fixed to handoff. Primary contract: `handoff-generation`. Apply its semantics directly with `risk-gate`; do not add an upper routing stage. Stay read-only unless a handoff file was requested.

{{ASK_COMPACT_CONTROLS}}

{{ASK_COMPACT_DIRECT_TRIGGERS}}

[agent_activity] opt-in; report started, completed, and failed counts.

Task:
Context:
Allowed scope:
Forbidden scope:
Expected output:
Verification:
Unverified evidence:
Stop condition:

Read `${CLAUDE_PLUGIN_ROOT}/contracts/claim-evidence-status-contract.md` and `${CLAUDE_PLUGIN_ROOT}/schemas/claim-evidence-status.schema.json`. Keep claim status inline unless a closed formal trigger selects `/ai-skills:evidence-ledger`.

Emit exactly one fenced JSON `Execution Envelope` using `${CLAUDE_PLUGIN_ROOT}/contracts/execution-envelope-contract.md`.

$ARGUMENTS
