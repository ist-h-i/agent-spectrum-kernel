---
name: handoff
description: Produce a precise next-task handoff through the fixed-entry Agent Spectrum Kernel profile.
---
<!-- ASK_CLAUDE_FIXED_ENTRY_PROFILE {"v":"1.2","m":"handoff","k":"p","r":"ask-fixed-entry-assets-v1","p":"c61e020fc0c7127e7a3412405f86b5e9848fc4ed49f8cede26893d89215316b7","a":"834446dc55f4a4925ec80f948304e067cac1556b03a4bc38b096098569451932"} -->

# Handoff

Entry mode is fixed to handoff. Primary contract: `handoff-generation`. Apply its semantics directly with `risk-gate`; do not add an upper routing stage. Stay read-only unless a handoff file was requested.

- [scope] repo/code/tests/docs/API; missing=>stop|insufficient; minimal diff; cleanup separate
- [verification] ask.verification-proof-policy@1.0.0: compact_proof|formal_verification_contract before claim; focused->risk-based; exact; trigger=>formal.
- [risk_approval] exact action/risk/impact/reversibility/visibility/alternative/preconditions; unapproved=>stop; approved-only.
- [evidence] Verified|Supported|Hypothesis|Unknown|Falsified@ask.claim-evidence-status@1.0.0; inline; closed formal=>evidence-ledger; unsupported=>downgrade.
- [missing_evidence] unavailable|insufficient; no inference; required=>stop
- [output] managed: ordinary=>sidecar, stop/handoff=>inline, diagnostic explicit; unmanaged=>one inline; next_action only.

Conditional (each missing=>`capability_missing`): `formal_claim_audit_required`=>`evidence-ledger`.

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
