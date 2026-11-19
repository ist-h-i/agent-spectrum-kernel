---
description: Fixed-entry Agent Spectrum Kernel handoff.
---

Fixed handoff entry. Primary contract: `handoff-generation`; apply it with `risk-gate`. Read-only unless a handoff file was requested.

{{ASK_COMPACT_CONTROLS}}

{{ASK_COMPACT_DIRECT_TRIGGERS}}

[agent_activity] opt-in; report started/completed/failed.

[handoff] executable resume evidence and unresolved risks.

Task:
Context:
Allowed scope:
Forbidden scope:
Expected output:
Verification:
Unverified evidence:

Emit exactly one fenced JSON `Execution Envelope` using `docs/execution-envelope-contract.md`; for non-trivial continuation include bounded `docs/agent-session-state-contract.md` fields.

Keep stop conditions only in `Execution Envelope.stop_reason.stop_if`; do not add a separate stop-condition field.

$ARGUMENTS
