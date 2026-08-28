<!-- ASK_CLAUDE_FIXED_ENTRY_PROFILE {"v":"1.2","m":"handoff","k":"c","r":"ask-3.0.0","p":"4409fed5473b1cfea4b8490bb35b129719fe66ceb68c5af837106eb44a050204","a":"834446dc55f4a4925ec80f948304e067cac1556b03a4bc38b096098569451932"} -->
---
description: Fixed-entry Agent Spectrum Kernel handoff.
---

Fixed handoff entry. Primary contract: `handoff-generation`; apply it with `risk-gate`. Read-only unless a handoff file was requested.

- [scope] repo/code/tests/docs/API; missing=>stop|insufficient; minimal diff; cleanup separate
- [verification] ask.verification-proof-policy@1.0.0: compact_proof|formal_verification_contract before claim; focused->risk-based; exact; trigger=>formal.
- [risk_approval] exact action/risk/impact/reversibility/visibility/alternative/preconditions; unapproved=>stop; approved-only.
- [evidence] Verified|Supported|Hypothesis|Unknown|Falsified@ask.claim-evidence-status@1.0.0; inline; closed formal=>evidence-ledger; unsupported=>downgrade.
- [missing_evidence] unavailable|insufficient; no inference; required=>stop
- [output] managed: ordinary=>sidecar, stop/handoff=>inline, diagnostic explicit; unmanaged=>one inline; next_action only.

Conditional (each missing=>`capability_missing`): `formal_claim_audit_required`=>`evidence-ledger`.

[agent_activity] opt-in; report started/completed/failed.

[handoff] executable resume evidence and unresolved risks.

Task:
Context:
Allowed scope:
Forbidden scope:
Expected output:
Verification:
Unverified evidence:
Stop condition:

Emit one fenced JSON `Execution Envelope` using `docs/execution-envelope-contract.md`; for non-trivial continuation include bounded `docs/agent-session-state-contract.md` fields.

$ARGUMENTS
