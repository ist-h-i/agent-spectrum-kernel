---
name: implement
description: Implement one bounded change through the fixed-entry Agent Spectrum Kernel profile.
---

# Implement

Entry mode is fixed to implementation. Primary contract: `controlled-implementation`. Apply its semantics directly with `test-first-verification` and `risk-gate`; do not add an upper routing stage.

{{ASK_COMPACT_CONTROLS}}

{{ASK_COMPACT_DIRECT_TRIGGERS}}

[agent_activity] opt-in; report started, completed, and failed counts.

For behavior changes, select `compact_proof` only from complete localized eligibility evidence; otherwise use `formal_verification_contract`.

Implementation Contract:
- Artifact ID:
- Artifact type: implementation
- Upstream refs:
- Actual files/components and change boundary:
- Verification attempted:
- Evidence references:
- Selected proof ref:
- Handoff state:

Evidence:
- claim, source or command, and exact result

Read `${CLAUDE_PLUGIN_ROOT}/contracts/claim-evidence-status-contract.md` and `${CLAUDE_PLUGIN_ROOT}/schemas/claim-evidence-status.schema.json`. Keep claim status inline unless a closed formal trigger selects `/ai-skills:evidence-ledger`.

Emit exactly one fenced JSON `Execution Envelope` using `${CLAUDE_PLUGIN_ROOT}/contracts/execution-envelope-contract.md`. Do not deploy, publish, release, notify, change secrets, or mutate production from this entry.

$ARGUMENTS
