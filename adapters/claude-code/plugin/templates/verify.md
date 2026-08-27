---
name: verify
description: Verify behavior through the fixed-entry Agent Spectrum Kernel profile.
---

# Verify

Entry mode is fixed to verification. Primary contract: `test-first-verification`. Apply its semantics directly with `risk-gate`; do not add an upper routing stage.

{{ASK_COMPACT_CONTROLS}}

{{ASK_COMPACT_DIRECT_TRIGGERS}}

[agent_activity] opt-in; report started/completed/failed.

Select one proof path before implementation claims. For `compact_proof`, emit only:

Proof:
- Behavior:
- Focused check:
- Result or missing evidence:
- Broader check required when:

For `formal_verification_contract`, emit the existing Verification Contract:
- Artifact ID:
- Artifact type: verification
- Upstream refs:
- Required evidence and completion condition:

Evidence:
- Selected proof artifact ref:
- command and exact result:

Read `${CLAUDE_PLUGIN_ROOT}/contracts/claim-evidence-status-contract.md` and `${CLAUDE_PLUGIN_ROOT}/schemas/claim-evidence-status.schema.json`. Keep claim status inline unless a closed formal trigger selects `/ai-skills:evidence-ledger`.

Emit exactly one fenced JSON `Execution Envelope` using `${CLAUDE_PLUGIN_ROOT}/contracts/execution-envelope-contract.md`. Do not invent command output.

$ARGUMENTS
