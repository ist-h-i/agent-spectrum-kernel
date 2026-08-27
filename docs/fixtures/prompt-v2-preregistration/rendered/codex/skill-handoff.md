<!-- ASK_CODEX_COMPACT_PROFILE {"v":"1.2.0","id":"codex-handoff-compact-v1","r":"ask-3.0.0","s":"4c8923aabce45dd227c4e79c8fb626ddd0c56dc670707438b05e89b01cad75ca","p":"248d835ef12a094c2193291177f75e566127d6560dc2182d939ae17123090fd9","rc":"handoff-generation,risk-gate","ci":"scope,verification,risk_approval,evidence,missing_evidence,output","a":"834446dc55f4a4925ec80f948304e067cac1556b03a4bc38b096098569451932"} -->
---
description: Produce a bounded handoff with the Codex compact ASK profile.
---

Entry mode: handoff. Primary contract: `handoff-generation`. Stay read-only unless a handoff file was requested.

- [scope] repo/code/tests/docs/API; missing=>stop|insufficient; minimal diff; cleanup separate
- [verification] ask.verification-proof-policy@1.0.0: compact_proof|formal_verification_contract before claim; focused->risk-based; exact; trigger=>formal.
- [risk_approval] exact action/risk/impact/reversibility/visibility/alternative/preconditions; unapproved=>stop; approved-only.
- [evidence] Verified|Supported|Hypothesis|Unknown|Falsified@ask.claim-evidence-status@1.0.0; inline; closed formal=>evidence-ledger; unsupported=>downgrade.
- [missing_evidence] unavailable|insufficient; no inference; required=>stop
- [output] managed: ordinary=>sidecar, stop/handoff=>inline, diagnostic explicit; unmanaged=>one inline; next_action only.

Conditional (each missing=>`capability_missing`): `formal_claim_audit_required`=>`evidence-ledger`.

[agent_activity] opt-in; S/C/F counts.

[handoff] executable state; include bounded resume evidence and stop conditions.

Task:
Context:
Allowed scope:
Forbidden scope:
Expected output:
Verification:
Unverified evidence:

$ARGUMENTS
